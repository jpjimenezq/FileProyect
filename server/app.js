import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { createReadStream, existsSync, promises as fs } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UserError, detect } from './exec.js'
import { TOOLS, sniff } from './tools.js'
import { aiEnabled, complete } from './ai.js'
import { openStore } from './db.js'
import { PLANS, PRICES, day, effectivePlan, month } from './plans.js'
import { checkPassword, clearCookie, hashPassword, hashToken, loadSecret, makeToken, newResetToken, normalizeEmail, readToken, sessionCookie, tokenFromRequest, verifyPassword } from './auth.js'
import { createMailer, resetEmail } from './mail.js'
import { applyEvent, billingEnabled, createCheckout, createPortal, verifyWebhook } from './billing.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MB = 1024 * 1024
const HARD_LIMIT = 100 * MB
const AUTH_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

const safeName = (name) => path.parse(name).name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 80) || 'documento'
const contentDisposition = (name) => `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`

export async function buildApp({ dbFile, logger = true, mailer } = {}) {
  const dataDir = process.env.DATA_DIR || path.join(HERE, 'data')
  const store = openStore(dbFile ?? path.join(dataDir, 'fileproyect.db'))
  const secret = loadSecret(dataDir)
  const secure = process.env.COOKIE_SECURE === '1' || (process.env.PUBLIC_URL ?? '').startsWith('https')
  const maxJobs = Number(process.env.JOBS) || 3

  const app = Fastify({ logger, bodyLimit: 1024 * 1024, trustProxy: process.env.TRUST_PROXY === '1' })

  const mail = mailer ?? createMailer(app.log)

  // Debe registrarse antes que las rutas: Fastify aplica el manejador solo a lo que se define después
  app.setErrorHandler((err, req, reply) => {
    const status = err instanceof UserError ? err.status : err.statusCode ?? 500
    if (status >= 500) req.log.error(err)
    const message =
      err.code === 'MISSING' ? 'El servidor no tiene instaladas las herramientas necesarias.'
      : err.code === 'TIMEOUT' ? 'La operación tardó demasiado. Prueba con un archivo más pequeño.'
      : err.code === 'FST_REQ_FILE_TOO_LARGE' ? 'El archivo supera los 100 MB.'
      : status >= 500 ? 'Error interno del servidor.'
      : err.message
    reply.status(err.code === 'FST_REQ_FILE_TOO_LARGE' ? 413 : status).send({ error: message, code: err.userCode })
  })
  await app.register(cors, { exposedHeaders: ['Content-Disposition', 'X-Result-Note'] })
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' })
  await app.register(multipart, { limits: { fileSize: HARD_LIMIT, files: 1, fields: 4 } })

  const pruneTimer = setInterval(() => store.prune(day(new Date(Date.now() - 2 * 86400_000))), 6 * 3600_000)
  pruneTimer.unref()
  app.addHook('onClose', async () => { clearInterval(pruneTimer); store.close() })

  // Defensa CSRF: una petición con Origin de otro sitio no puede usar la cookie de sesión
  app.addHook('onRequest', async (req) => {
    const origin = req.headers.origin
    if (req.method !== 'GET' && req.method !== 'HEAD' && origin && !req.url.startsWith('/api/billing/webhook')) {
      let host
      try { host = new URL(origin).host } catch { host = '' }
      const allowed = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).host : undefined
      // en desarrollo, Vite reenvía /api con otro Host: se admiten orígenes locales (nunca en producción)
      const devLocal = process.env.NODE_ENV !== 'production' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
      if (host !== req.headers.host && host !== allowed && !devLocal) throw new UserError('Origen no permitido.', 403)
    }
  })

  // ── Identidad y cuotas ──────────────────────────────────────────────
  const currentUser = (req) => {
    const t = readToken(secret, tokenFromRequest(req))
    const user = t && store.userById(t.id)
    // al cambiar la contraseña sube session_epoch y las sesiones anteriores dejan de valer
    return user && (user.session_epoch ?? 0) === t.epoch ? user : undefined
  }
  const actorOf = (req) => {
    const user = currentUser(req)
    return { user, key: user ? `u:${user.id}` : `ip:${req.ip}`, plan: effectivePlan(user) }
  }
  const usageOf = (actor) => ({ jobsToday: store.usage(actor.key, 'jobs', `d:${day()}`), aiCharsMonth: store.usage(actor.key, 'ai', `m:${month()}`) })

  const publicUser = (u) => u && { email: u.email, plan: effectivePlan(u), until: u.plan_until, subscribed: Boolean(u.stripe_subscription) }

  const meBody = (actor) => ({
    user: publicUser(actor.user) ?? null,
    plan: actor.plan,
    limits: PLANS[actor.plan],
    plans: PLANS,
    usage: usageOf(actor),
    prices: PRICES,
    billing: billingEnabled(),
    ai: aiEnabled(),
  })

  const startSession = (reply, user) => reply.header('Set-Cookie', sessionCookie(makeToken(secret, user.id, user.session_epoch ?? 0), secure))

  app.get('/api/me', async (req) => meBody(actorOf(req)))

  app.post('/api/auth/register', AUTH_LIMIT, async (req, reply) => {
    const email = normalizeEmail(req.body?.email)
    checkPassword(req.body?.password)
    if (req.body?.acceptTerms !== true) throw new UserError('Debes aceptar los términos y la política de privacidad.')
    if (store.userByEmail(email)) throw new UserError('Ya existe una cuenta con ese correo. Prueba a iniciar sesión.', 409)
    const id = store.createUser(email, hashPassword(req.body.password), Date.now())
    const user = store.userById(id)
    startSession(reply, user)
    return meBody({ user, key: `u:${id}`, plan: 'free' })
  })

  app.post('/api/auth/login', AUTH_LIMIT, async (req, reply) => {
    const user = store.userByEmail(String(req.body?.email ?? '').trim().toLowerCase())
    // mismo mensaje y mismo coste de cálculo si el correo no existe, para no revelar qué correos están registrados
    const ok = verifyPassword(String(req.body?.password ?? ''), user?.pass_hash ?? '00:00')
    if (!user || !ok) throw new UserError('Correo o contraseña incorrectos.', 401)
    startSession(reply, user)
    return meBody({ user, key: `u:${user.id}`, plan: effectivePlan(user) })
  })

  // Recuperar contraseña: la respuesta es siempre la misma exista o no la cuenta, para no revelar qué correos están registrados
  const baseUrl = () => process.env.PUBLIC_URL?.replace(/\/$/, '') ?? (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173')

  app.post('/api/auth/forgot', AUTH_LIMIT, async (req) => {
    const user = store.userByEmail(String(req.body?.email ?? '').trim().toLowerCase())
    const base = baseUrl()
    if (user && base && store.resetsSince(user.id, Date.now() - 3600_000) < 3) {
      const token = newResetToken()
      store.addResetToken(user.id, hashToken(token), Date.now() + 3600_000)
      try {
        await mail.send({ to: user.email, ...resetEmail(`${base}/cuenta/restablecer?token=${token}`) })
      } catch (e) {
        req.log.error(e, 'No se pudo enviar el correo de recuperación')
      }
    } else if (user && !base) {
      req.log.error('Falta PUBLIC_URL: no se puede crear el enlace de recuperación')
    }
    return { ok: true }
  })

  app.post('/api/auth/reset', AUTH_LIMIT, async (req, reply) => {
    checkPassword(req.body?.password)
    const row = store.resetToken(hashToken(req.body?.token))
    if (!row || row.expires_at < Date.now()) throw new UserError('El enlace no es válido o ha caducado. Pide uno nuevo.', 400, 'reset')
    store.setPassword(row.user_id, hashPassword(req.body.password))
    store.clearResetTokens(row.user_id)
    const user = store.userById(row.user_id)
    startSession(reply, user)
    return meBody({ user, key: `u:${user.id}`, plan: effectivePlan(user) })
  })

  app.post('/api/auth/logout', async (req, reply) => {
    reply.header('Set-Cookie', clearCookie(secure))
    return { ok: true }
  })

  app.post('/api/account/delete', AUTH_LIMIT, async (req, reply) => {
    const user = currentUser(req)
    if (!user) throw new UserError('Inicia sesión primero.', 401, 'login')
    if (!verifyPassword(String(req.body?.password ?? ''), user.pass_hash)) throw new UserError('Contraseña incorrecta.', 401)
    if (effectivePlan(user) === 'pro' && user.stripe_subscription) throw new UserError('Cancela tu suscripción en «Gestionar suscripción» antes de borrar la cuenta.', 409)
    store.deleteUser(user.id)
    reply.header('Set-Cookie', clearCookie(secure))
    return { ok: true }
  })

  // ── Cobros ──────────────────────────────────────────────────────────
  const requireUser = (req) => {
    const user = currentUser(req)
    if (!user) throw new UserError('Inicia sesión para continuar.', 401, 'login')
    return user
  }

  app.post('/api/billing/checkout', async (req) => ({ url: await createCheckout(requireUser(req), req.body?.interval === 'year' ? 'year' : 'month') }))
  app.post('/api/billing/portal', async (req) => ({ url: await createPortal(requireUser(req)) }))

  // Solo para probar en local sin Stripe: nunca activar en producción
  if (process.env.BILLING_DEV === '1') {
    app.post('/api/billing/dev-upgrade', async (req) => {
      const user = requireUser(req)
      store.setPlan(user.id, { plan: req.body?.plan === 'free' ? 'free' : 'pro', until: Date.now() + 30 * 86400_000 })
      return meBody({ user: store.userById(user.id), key: `u:${user.id}`, plan: effectivePlan(store.userById(user.id)) })
    })
  }

  // El webhook necesita el cuerpo sin interpretar para validar la firma: su propio ámbito con su propio parser
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => done(null, body))
    scope.post('/api/billing/webhook', async (req, reply) => {
      const whSecret = process.env.STRIPE_WEBHOOK_SECRET
      if (!whSecret || !verifyWebhook(req.body, req.headers['stripe-signature'], whSecret)) throw new UserError('Firma no válida.', 400)
      applyEvent(store, JSON.parse(req.body))
      return reply.send({ received: true })
    })
  })

  // ── Servicios ───────────────────────────────────────────────────────
  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/capabilities', async () => {
    const bins = await detect()
    return { bins, ai: aiEnabled(), tools: Object.fromEntries(Object.entries(TOOLS).map(([id, t]) => [id, bins[t.bin]])) }
  })

  const limitError = (actor, what) =>
    actor.plan === 'anon' ? new UserError(`${what} Crea una cuenta gratis para tener más.`, 429, 'login')
    : actor.plan === 'free' ? new UserError(`${what} Con Pro tienes mucho más margen.`, 429, 'quota')
    : new UserError(`${what} Inténtalo de nuevo mañana.`, 429, 'limit')

  // Las tareas de IA reciben texto ya extraído por el navegador; el cliente trocea los documentos largos
  app.post('/api/ai/:task', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const actor = actorOf(req)
    if (!actor.user) throw new UserError('Crea una cuenta gratis para usar las herramientas de IA.', 401, 'login')
    const { text, options } = req.body ?? {}
    const left = PLANS[actor.plan].aiCharsPerMonth - usageOf(actor).aiCharsMonth
    if (typeof text === 'string' && text.length > left) throw limitError(actor, 'Has agotado tu cuota mensual de IA.')
    const out = await complete(req.params.task, text, options && typeof options === 'object' ? options : {})
    store.addUsage(actor.key, 'ai', `m:${month()}`, text.length)
    return { text: out }
  })

  let running = 0
  const waiting = []
  const acquire = () => (running < maxJobs ? (running++, Promise.resolve()) : new Promise((res) => waiting.push(res)))
  const release = () => { const next = waiting.shift(); next ? next() : running-- }

  app.post('/api/tools/:id', async (req, reply) => {
    const tool = TOOLS[req.params.id]
    if (!tool) throw new UserError('Herramienta desconocida.', 404)
    if (!(await detect())[tool.bin]) throw new UserError(`El servidor no tiene instalado ${tool.bin}.`, 503)

    const actor = actorOf(req)
    const limits = PLANS[actor.plan]
    if (usageOf(actor).jobsToday >= limits.jobsPerDay) throw limitError(actor, `Has llegado al límite de ${limits.jobsPerDay} conversiones de hoy.`)

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileproyect-'))
    const cleanup = () => fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    let handedOver = false

    try {
      let opts = {}
      let upload
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const original = part.filename || 'documento'
          const ext = path.extname(original).toLowerCase()
          const spec = tool.inputs[0]
          if (!spec.exts.includes(ext)) throw new UserError(`Formato no admitido. Usa: ${spec.exts.join(', ')}`, 415)
          const file = path.join(dir, `input${ext}`)
          await pipeline(part.file, (await fs.open(file, 'w')).createWriteStream())
          if (part.file.truncated) throw new UserError('El archivo supera los 100 MB.', 413)
          if ((await fs.stat(file)).size > limits.maxFileMB * MB) throw limitError(actor, `Tu plan admite archivos de hasta ${limits.maxFileMB} MB.`)
          const head = Buffer.alloc(1024)
          const fh = await fs.open(file, 'r')
          const { bytesRead } = await fh.read(head, 0, 1024, 0)
          await fh.close()
          if (!sniff(head.subarray(0, bytesRead), spec.magic)) throw new UserError('El contenido del archivo no coincide con su extensión.', 415)
          upload = { file, original }
        } else if (part.fieldname === 'options') {
          try { opts = JSON.parse(part.value) } catch { throw new UserError('Opciones no válidas.') }
        }
      }
      if (!upload) throw new UserError('Falta el archivo.')

      await acquire()
      let result
      try {
        result = await tool.run({ dir, files: [upload.file], opts })
      } finally {
        release()
      }
      store.addUsage(actor.key, 'jobs', `d:${day()}`, 1)

      const name = `${safeName(upload.original)}${tool.suffix}.${tool.ext}`
      const note = result.note ?? tool.note
      reply.header('Content-Type', tool.mime).header('Content-Disposition', contentDisposition(name))
      if (note) reply.header('X-Result-Note', encodeURIComponent(note))
      handedOver = true
      const stream = createReadStream(result.path)
      stream.on('close', cleanup)
      return reply.send(stream)
    } finally {
      if (!handedOver) await cleanup()
    }
  })

  // En producción, el mismo servidor entrega la web compilada
  const dist = path.join(HERE, '..', 'dist')
  if (existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist })
    app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? reply.status(404).send({ error: 'No encontrado' }) : reply.sendFile('index.html')))
  }

  return { app, store }
}
