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
import { openSupabaseData, supabaseConfigured } from './store/index.js'
import { sqliteData } from './store/sqlite.js'
import { registerAdmin } from './admin.js'
import { applyGrant, assertUsable, normalizeCode } from './discounts.js'
import { PLANS, PRICES, day, effectivePlan, month } from './plans.js'
import { checkPassword, clearCookie, hashPassword, hashToken, loadSecret, makeToken, newResetToken, normalizeEmail, readToken, sessionCookie, tokenFromRequest, verifyPassword } from './auth.js'
import { createMailer, resetEmail } from './mail.js'
import { applyEvent, billingEnabled, createCheckout, createPortal, createStripePromo, verifyWebhook } from './billing.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MB = 1024 * 1024
const HARD_LIMIT = 100 * MB
const AUTH_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

const safeName = (name) => path.parse(name).name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 80) || 'documento'
const contentDisposition = (name) => `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`

const SUPABASE_GONE = 'El inicio de sesión lo gestiona Supabase en el cliente: usa la pantalla de acceso de la web.'

/**
 * `data` permite inyectar el almacén (pruebas). Si no, con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno
 * se usa Supabase (identidad por token Bearer) y, si no, SQLite con sesiones por cookie.
 */
export async function buildApp({ dbFile, logger = true, mailer, data: injected } = {}) {
  const dataDir = process.env.DATA_DIR || path.join(HERE, 'data')
  // `store` es el SQLite sin envolver: solo existe en modo SQLite (las rutas de cookies lo usan directamente)
  const store = injected || supabaseConfigured() ? undefined : openStore(dbFile ?? path.join(dataDir, 'fileproyect.db'))
  const data = injected ?? (store ? sqliteData(store) : openSupabaseData())
  const supa = data.mode === 'supabase'
  const secret = supa ? undefined : loadSecret(dataDir)
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
      : err instanceof UserError ? err.message
      : status >= 500 ? 'Error interno del servidor.'
      : err.message
    reply.status(err.code === 'FST_REQ_FILE_TOO_LARGE' ? 413 : status).send({ error: message, code: err.userCode })
  })
  // Un cuerpo JSON vacío (p. ej. DELETE o POST sin datos con Content-Type: application/json) se acepta como "sin cuerpo"
  const parseJson = app.getDefaultJsonParser('error', 'error')
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => (body.trim() === '' ? done(null, undefined) : parseJson(req, body, done)))
  await app.register(cors, { exposedHeaders: ['Content-Disposition', 'X-Result-Note'] })
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' })
  await app.register(multipart, { limits: { fileSize: HARD_LIMIT, files: 1, fields: 4 } })

  const pruneTimer = setInterval(() => {
    data.usage.prune(day(new Date(Date.now() - 2 * 86400_000))).catch((e) => app.log.error(e, 'No se pudo limpiar el uso antiguo'))
  }, 6 * 3600_000)
  pruneTimer.unref()
  app.addHook('onClose', async () => { clearInterval(pruneTimer); await data.close() })

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
  // Supabase: `Authorization: Bearer <access_token>`. SQLite: cookie de sesión firmada.
  const currentUser = async (req) => {
    if (supa) {
      const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')
      if (!bearer) return undefined
      const user = await data.users.fromToken(bearer[1])
      if (!user) throw new UserError('La sesión ha caducado. Vuelve a iniciar sesión.', 401, 'session')
      if (user.banned) throw new UserError('Tu cuenta está suspendida. Si crees que es un error, contacta con soporte.', 403, 'banned')
      return user
    }
    const t = readToken(secret, tokenFromRequest(req))
    const user = t && (await data.users.byId(t.id))
    // al cambiar la contraseña sube session_epoch y las sesiones anteriores dejan de valer
    return user && (user.session_epoch ?? 0) === t.epoch ? user : undefined
  }
  const actorOf = async (req) => {
    const user = await currentUser(req)
    return { user, key: user ? `u:${user.id}` : `ip:${req.ip}`, plan: effectivePlan(user) }
  }
  const usageOf = async (actor) => {
    const [jobsToday, aiCharsMonth] = await Promise.all([data.usage.get(actor.key, 'jobs', `d:${day()}`), data.usage.get(actor.key, 'ai', `m:${month()}`)])
    return { jobsToday, aiCharsMonth }
  }

  const publicUser = (u) => u && { email: u.email, name: u.full_name ?? null, role: u.role ?? 'user', plan: effectivePlan(u), until: u.plan_until, subscribed: Boolean(u.stripe_subscription) }

  const meBody = async (actor) => ({
    user: publicUser(actor.user) ?? null,
    plan: actor.plan,
    limits: PLANS[actor.plan],
    plans: PLANS,
    usage: await usageOf(actor),
    prices: PRICES,
    billing: billingEnabled(),
    ai: aiEnabled(),
  })
  const meBodyOf = async (id) => {
    const user = await data.users.byId(id)
    return meBody({ user, key: `u:${user.id}`, plan: effectivePlan(user) })
  }

  const startSession = (reply, user) => reply.header('Set-Cookie', sessionCookie(makeToken(secret, user.id, user.session_epoch ?? 0), secure))

  app.get('/api/me', async (req) => meBody(await actorOf(req)))

  // Con Supabase, registro, acceso y recuperación se hacen en el cliente (supabase-js): estas rutas ya no sirven
  const authRoute = (url, opts, handler) => app.post(url, opts, supa ? async () => { throw new UserError(SUPABASE_GONE, 410, 'supabase') } : handler)

  authRoute('/api/auth/register', AUTH_LIMIT, async (req, reply) => {
    const email = normalizeEmail(req.body?.email)
    checkPassword(req.body?.password)
    if (req.body?.acceptTerms !== true) throw new UserError('Debes aceptar los términos y la política de privacidad.')
    if (store.userByEmail(email)) throw new UserError('Ya existe una cuenta con ese correo. Prueba a iniciar sesión.', 409)
    const id = store.createUser(email, hashPassword(req.body.password), Date.now())
    const user = store.userById(id)
    startSession(reply, user)
    return meBody({ user, key: `u:${id}`, plan: 'free' })
  })

  authRoute('/api/auth/login', AUTH_LIMIT, async (req, reply) => {
    const user = store.userByEmail(String(req.body?.email ?? '').trim().toLowerCase())
    // mismo mensaje y mismo coste de cálculo si el correo no existe, para no revelar qué correos están registrados
    const ok = verifyPassword(String(req.body?.password ?? ''), user?.pass_hash ?? '00:00')
    if (!user || !ok) throw new UserError('Correo o contraseña incorrectos.', 401)
    startSession(reply, user)
    return meBody({ user, key: `u:${user.id}`, plan: effectivePlan(user) })
  })

  // Recuperar contraseña: la respuesta es siempre la misma exista o no la cuenta, para no revelar qué correos están registrados
  const baseUrl = () => process.env.PUBLIC_URL?.replace(/\/$/, '') ?? (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173')

  authRoute('/api/auth/forgot', AUTH_LIMIT, async (req) => {
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

  authRoute('/api/auth/reset', AUTH_LIMIT, async (req, reply) => {
    checkPassword(req.body?.password)
    const row = store.resetToken(hashToken(req.body?.token))
    if (!row || row.expires_at < Date.now()) throw new UserError('El enlace no es válido o ha caducado. Pide uno nuevo.', 400, 'reset')
    store.setPassword(row.user_id, hashPassword(req.body.password))
    store.clearResetTokens(row.user_id)
    const user = store.userById(row.user_id)
    startSession(reply, user)
    return meBody({ user, key: `u:${user.id}`, plan: effectivePlan(user) })
  })

  authRoute('/api/auth/logout', {}, async (req, reply) => {
    reply.header('Set-Cookie', clearCookie(secure))
    return { ok: true }
  })

  // ── Cobros ──────────────────────────────────────────────────────────
  const requireUser = async (req) => {
    const user = await currentUser(req)
    if (!user) throw new UserError('Inicia sesión para continuar.', 401, 'login')
    return user
  }

  app.post('/api/account/delete', AUTH_LIMIT, async (req, reply) => {
    const user = await requireUser(req)
    // con Supabase la identidad la prueba el token; en SQLite se pide además la contraseña
    if (!supa && !verifyPassword(String(req.body?.password ?? ''), user.pass_hash)) throw new UserError('Contraseña incorrecta.', 401)
    if (effectivePlan(user) === 'pro' && user.stripe_subscription) throw new UserError('Cancela tu suscripción en «Gestionar suscripción» antes de borrar la cuenta.', 409)
    if (supa) await data.users.remove(user.id)
    else store.deleteUser(user.id)
    if (!supa) reply.header('Set-Cookie', clearCookie(secure))
    return { ok: true }
  })

  const needDiscounts = () => {
    if (!data.discounts) throw new UserError('Los códigos de descuento requieren Supabase en este servidor.', 503)
  }

  app.post('/api/billing/checkout', async (req) => {
    const user = await requireUser(req)
    const interval = req.body?.interval === 'year' ? 'year' : 'month'
    if (req.body?.code == null || req.body.code === '') return { url: await createCheckout(user, interval) }

    needDiscounts()
    let code = await data.discounts.byCode(normalizeCode(req.body.code))
    assertUsable(code)
    // regalo de Pro: no pasa por Stripe
    if (code.kind === 'grant') {
      const until = await applyGrant(data, user, code)
      return { url: null, granted: true, plan: 'pro', until }
    }
    if (!billingEnabled()) throw new UserError('Los pagos no están configurados en este servidor: no se puede aplicar el descuento.', 503)
    if (await data.discounts.hasRedeemed(code.id, user.id)) throw new UserError('Ya has canjeado este código.', 409)
    // códigos creados antes de configurar Stripe: se crean en Stripe la primera vez que se usan
    if (!code.stripe_promotion_code_id) code = await data.discounts.update(code.id, await createStripePromo(code))
    return { url: await createCheckout(user, interval, code) }
  })

  // Canjear desde la cuenta un código que regala Pro (los de descuento se escriben al pagar)
  app.post('/api/billing/redeem', AUTH_LIMIT, async (req) => {
    const user = await requireUser(req)
    needDiscounts()
    const code = await data.discounts.byCode(normalizeCode(req.body?.code))
    assertUsable(code)
    if (code.kind !== 'grant') throw new UserError('Este código es un descuento: escríbelo al pagar la suscripción.', 400)
    const until = await applyGrant(data, user, code)
    return { granted: true, until, ...(await meBodyOf(user.id)) }
  })
  app.post('/api/billing/portal', async (req) => ({ url: await createPortal(await requireUser(req)) }))

  // Solo para probar en local sin Stripe: nunca activar en producción
  if (process.env.BILLING_DEV === '1') {
    app.post('/api/billing/dev-upgrade', async (req) => {
      const user = await requireUser(req)
      await data.users.setPlan(user.id, { plan: req.body?.plan === 'free' ? 'free' : 'pro', until: Date.now() + 30 * 86400_000 })
      return meBodyOf(user.id)
    })
  }

  // El webhook necesita el cuerpo sin interpretar para validar la firma: su propio ámbito con su propio parser
  await app.register(async (scope) => {
    scope.removeContentTypeParser('application/json')
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => done(null, body))
    scope.post('/api/billing/webhook', async (req, reply) => {
      const whSecret = process.env.STRIPE_WEBHOOK_SECRET
      if (!whSecret || !verifyWebhook(req.body, req.headers['stripe-signature'], whSecret)) throw new UserError('Firma no válida.', 400)
      await applyEvent(data, JSON.parse(req.body))
      return reply.send({ received: true })
    })
  })

  // ── Administración (solo con Supabase) ──────────────────────────────
  registerAdmin(app, { data, requireUser })

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
    const actor = await actorOf(req)
    if (!actor.user) throw new UserError('Crea una cuenta gratis para usar las herramientas de IA.', 401, 'login')
    const { text, options } = req.body ?? {}
    const left = PLANS[actor.plan].aiCharsPerMonth - (await usageOf(actor)).aiCharsMonth
    if (typeof text === 'string' && text.length > left) throw limitError(actor, 'Has agotado tu cuota mensual de IA.')
    const out = await complete(req.params.task, text, options && typeof options === 'object' ? options : {})
    await data.usage.add(actor.key, 'ai', `m:${month()}`, text.length)
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

    const actor = await actorOf(req)
    const limits = PLANS[actor.plan]
    if ((await usageOf(actor)).jobsToday >= limits.jobsPerDay) throw limitError(actor, `Has llegado al límite de ${limits.jobsPerDay} conversiones de hoy.`)

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
      await data.usage.add(actor.key, 'jobs', `d:${day()}`, 1)

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

  return { app, store, data }
}
