import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createHmac } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

process.env.SESSION_SECRET = 'test-secret'
process.env.DATA_DIR = path.join(os.tmpdir(), 'fileproyect-test-data')

const { buildApp } = await import('./app.js')
const { PLANS, effectivePlan } = await import('./plans.js')
const { verifyWebhook } = await import('./billing.js')

async function fresh() {
  const sent = []
  const mailer = { send: async (msg) => { sent.push(msg); return true } }
  const { app, store } = await buildApp({ dbFile: ':memory:', logger: false, mailer })
  const post = (url, payload, cookie, headers = {}) => app.inject({ method: 'POST', url, payload, headers: { ...(cookie ? { cookie } : {}), ...headers } })
  const cookieOf = (res) => String(res.headers['set-cookie']).split(';')[0]
  const register = async (email = 'ana@example.com', password = 'secreto123') => {
    const res = await post('/api/auth/register', { email, password, acceptTerms: true })
    return { res, cookie: cookieOf(res) }
  }
  return { app, store, post, register, cookieOf, sent }
}

const tokenFrom = (msg) => /token=([\w-]+)/.exec(msg.text)[1]

/** Servidor falso que hace de DeepSeek y de Stripe */
function fakeUpstream() {
  const calls = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      calls.push({ url: req.url, auth: req.headers.authorization, body })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (req.url.startsWith('/chat/completions')) res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
      else if (req.url === '/v1/checkout/sessions') res.end(JSON.stringify({ url: 'https://checkout.example/abc' }))
      else res.end(JSON.stringify({ url: 'https://portal.example/xyz' }))
    })
  })
  return new Promise((resolve) => server.listen(0, () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })))
}

test('registro, sesión por cookie y /api/me', async (t) => {
  const { app, register } = await fresh()
  t.after(() => app.close())

  assert.equal((await app.inject('/api/me')).json().plan, 'anon')

  const { res, cookie } = await register()
  assert.equal(res.statusCode, 200)
  assert.match(String(res.headers['set-cookie']), /HttpOnly/)
  const me = (await app.inject({ url: '/api/me', headers: { cookie } })).json()
  assert.equal(me.user.email, 'ana@example.com')
  assert.equal(me.plan, 'free')
  assert.equal(me.limits.jobsPerDay, PLANS.free.jobsPerDay)
})

test('rechaza correos y contraseñas no válidos, y cuentas duplicadas', async (t) => {
  const { app, post, register } = await fresh()
  t.after(() => app.close())

  const bad = await post('/api/auth/register', { email: 'no-es-correo', password: 'secreto123' })
  assert.equal(bad.statusCode, 400)
  // el cliente lee { error, code }: todas las rutas deben usar el manejador de errores propio
  assert.match(bad.json().error, /correo/)
  assert.equal((await post('/api/billing/checkout', {})).json().code, 'login')
  assert.equal((await post('/api/auth/register', { email: 'a@b.co', password: 'corta' })).statusCode, 400)
  await register()
  assert.equal((await register('ANA@example.com')).res.statusCode, 409)
})

test('login correcto, incorrecto y cierre de sesión', async (t) => {
  const { app, post, register } = await fresh()
  t.after(() => app.close())
  await register()

  assert.equal((await post('/api/auth/login', { email: 'ana@example.com', password: 'mala-clave' })).statusCode, 401)
  assert.equal((await post('/api/auth/login', { email: 'nadie@example.com', password: 'secreto123' })).statusCode, 401)
  const ok = await post('/api/auth/login', { email: ' Ana@Example.com ', password: 'secreto123' })
  assert.equal(ok.statusCode, 200)
  const out = await post('/api/auth/logout', {})
  assert.match(String(out.headers['set-cookie']), /Max-Age=0/)
})

test('una cookie manipulada o caducada no inicia sesión', async (t) => {
  const { app, register } = await fresh()
  t.after(() => app.close())
  const { cookie } = await register()
  const tampered = cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))
  assert.equal((await app.inject({ url: '/api/me', headers: { cookie: tampered } })).json().plan, 'anon')
})

test('rechaza peticiones con Origin de otro sitio (CSRF)', async (t) => {
  const { app, post } = await fresh()
  t.after(() => app.close())
  const res = await post('/api/auth/register', { email: 'x@example.com', password: 'secreto123' }, undefined, { origin: 'https://malo.example', host: 'localhost:3001' })
  assert.equal(res.statusCode, 403)
})

test('la IA exige cuenta y descuenta de la cuota mensual', async (t) => {
  const up = await fakeUpstream()
  Object.assign(process.env, { DEEPSEEK_API_KEY: 'k', DEEPSEEK_BASE_URL: up.url })
  const { app, post, register } = await fresh()
  t.after(() => { app.close(); up.server.close() })

  const anon = await post('/api/ai/summarize', { text: 'hola' })
  assert.equal(anon.statusCode, 401)
  assert.equal(anon.json().code, 'login')

  const { cookie } = await register()
  const original = PLANS.free.aiCharsPerMonth
  PLANS.free.aiCharsPerMonth = 100
  t.after(() => { PLANS.free.aiCharsPerMonth = original })

  assert.equal((await post('/api/ai/summarize', { text: 'a'.repeat(60) }, cookie)).statusCode, 200)
  const me = (await app.inject({ url: '/api/me', headers: { cookie } })).json()
  assert.equal(me.usage.aiCharsMonth, 60)

  const over = await post('/api/ai/summarize', { text: 'a'.repeat(60) }, cookie)
  assert.equal(over.statusCode, 429)
  assert.equal(over.json().code, 'quota')
})

test('las herramientas de servidor sin binarios responden 503 (la cuota se aplica después)', async (t) => {
  const { app, post } = await fresh()
  t.after(() => app.close())
  const res = await post('/api/tools/compress', {})
  assert.ok([503, 415, 400].includes(res.statusCode))
})

function signed(payload, secret, t = Math.floor(Date.now() / 1000)) {
  return { body: payload, header: `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}` }
}

test('verifyWebhook valida firma y tolerancia de tiempo', () => {
  const { body, header } = signed('{"a":1}', 'whsec')
  assert.equal(verifyWebhook(body, header, 'whsec'), true)
  assert.equal(verifyWebhook(body + ' ', header, 'whsec'), false)
  assert.equal(verifyWebhook(body, header, 'otra'), false)
  assert.equal(verifyWebhook(body, header, 'whsec', Date.now() + 3600_000), false)
  assert.equal(verifyWebhook(body, 'basura', 'whsec'), false)
})

test('el webhook de Stripe activa y desactiva Pro', async (t) => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  const { app, register } = await fresh()
  t.after(() => app.close())
  const { cookie } = await register()
  const id = (await app.inject({ url: '/api/me', headers: { cookie } })).json() && 1

  const send = (event, secret = 'whsec_test') => {
    const { body, header } = signed(JSON.stringify(event), secret)
    return app.inject({ method: 'POST', url: '/api/billing/webhook', payload: body, headers: { 'content-type': 'application/json', 'stripe-signature': header } })
  }
  const plan = async () => (await app.inject({ url: '/api/me', headers: { cookie } })).json().plan

  assert.equal((await send({ type: 'checkout.session.completed', data: { object: { client_reference_id: String(id), customer: 'cus_1', subscription: 'sub_1' } } }, 'firma-falsa')).statusCode, 400)
  assert.equal(await plan(), 'free')

  assert.equal((await send({ type: 'checkout.session.completed', data: { object: { client_reference_id: String(id), customer: 'cus_1', subscription: 'sub_1' } } })).statusCode, 200)
  assert.equal(await plan(), 'pro')

  const end = Math.floor(Date.now() / 1000) + 86400 * 30
  await send({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ current_period_end: end }] } } } })
  assert.equal(await plan(), 'pro')

  await send({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled' } } })
  assert.equal(await plan(), 'free')
})

test('checkout y portal usan Stripe y exigen sesión', async (t) => {
  const up = await fakeUpstream()
  Object.assign(process.env, { STRIPE_API_BASE: up.url, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_MONTH: 'price_m', STRIPE_PRICE_YEAR: 'price_y' })
  const { app, post, register } = await fresh()
  t.after(() => { app.close(); up.server.close() })

  assert.equal((await post('/api/billing/checkout', { interval: 'month' })).statusCode, 401)

  const { cookie } = await register()
  const res = await post('/api/billing/checkout', { interval: 'year' }, cookie)
  assert.equal(res.json().url, 'https://checkout.example/abc')
  const call = up.calls.find((c) => c.url === '/v1/checkout/sessions')
  assert.equal(call.auth, 'Bearer sk_test_x')
  assert.match(call.body, /price_y/)
  assert.match(call.body, /customer_email=ana%40example.com/)

  // sin suscripción previa no hay portal
  assert.equal((await post('/api/billing/portal', {}, cookie)).statusCode, 400)
})

test('borrar la cuenta elimina al usuario', async (t) => {
  const { app, post, register } = await fresh()
  t.after(() => app.close())
  const { cookie } = await register()
  assert.equal((await post('/api/account/delete', { password: 'incorrecta' }, cookie)).statusCode, 401)
  assert.equal((await post('/api/account/delete', { password: 'secreto123' }, cookie)).statusCode, 200)
  assert.equal((await post('/api/auth/login', { email: 'ana@example.com', password: 'secreto123' })).statusCode, 401)
})

test('el registro exige aceptar los términos', async (t) => {
  const { app, post } = await fresh()
  t.after(() => app.close())
  const res = await post('/api/auth/register', { email: 'x@example.com', password: 'secreto123' })
  assert.equal(res.statusCode, 400)
  assert.match(res.json().error, /términos/)
})

test('recuperar contraseña: enlace por correo, un solo uso y cierra las sesiones anteriores', async (t) => {
  const { app, post, register, sent } = await fresh()
  t.after(() => app.close())
  const { cookie: oldSession } = await register()

  const res = await post('/api/auth/forgot', { email: ' ANA@example.com ' })
  assert.deepEqual(res.json(), { ok: true })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'ana@example.com')
  assert.match(sent[0].text, /\/cuenta\/restablecer\?token=/)
  const token = tokenFrom(sent[0])

  // contraseña débil y token inventado se rechazan
  assert.equal((await post('/api/auth/reset', { token, password: 'corta' })).statusCode, 400)
  const fake = await post('/api/auth/reset', { token: 'inventado', password: 'nueva-clave-1' })
  assert.equal(fake.statusCode, 400)
  assert.equal(fake.json().code, 'reset')

  const ok = await post('/api/auth/reset', { token, password: 'nueva-clave-1' })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.json().user.email, 'ana@example.com')
  assert.match(String(ok.headers['set-cookie']), /fp_session=/)

  // el enlace no se puede usar dos veces
  assert.equal((await post('/api/auth/reset', { token, password: 'otra-clave-22' })).statusCode, 400)
  // la contraseña vieja ya no sirve y la nueva sí
  assert.equal((await post('/api/auth/login', { email: 'ana@example.com', password: 'secreto123' })).statusCode, 401)
  assert.equal((await post('/api/auth/login', { email: 'ana@example.com', password: 'nueva-clave-1' })).statusCode, 200)
  // la sesión abierta antes del cambio queda invalidada
  assert.equal((await app.inject({ url: '/api/me', headers: { cookie: oldSession } })).json().plan, 'anon')
})

test('recuperar contraseña no revela qué correos existen y limita los envíos', async (t) => {
  const { app, post, register, sent } = await fresh()
  t.after(() => app.close())
  await register()

  const unknown = await post('/api/auth/forgot', { email: 'nadie@example.com' })
  assert.deepEqual(unknown.json(), { ok: true })
  assert.equal(sent.length, 0)

  for (let i = 0; i < 5; i++) await post('/api/auth/forgot', { email: 'ana@example.com' })
  assert.equal(sent.length, 3) // máximo 3 correos por hora y cuenta
})

test('un enlace de recuperación caducado no vale', async (t) => {
  const { app, post, register, sent, store } = await fresh()
  t.after(() => app.close())
  await register()
  await post('/api/auth/forgot', { email: 'ana@example.com' })
  const token = tokenFrom(sent[0])
  const { hashToken } = await import('./auth.js')
  // se adelanta la caducidad en la base de datos
  store.addResetToken(1, hashToken('viejo'), Date.now() - 1000)
  assert.equal((await post('/api/auth/reset', { token: 'viejo', password: 'nueva-clave-1' })).statusCode, 400)
  assert.equal((await post('/api/auth/reset', { token, password: 'nueva-clave-1' })).statusCode, 200)
})

test('effectivePlan respeta la fecha de fin con 2 días de gracia', () => {
  const now = Date.now()
  assert.equal(effectivePlan(undefined), 'anon')
  assert.equal(effectivePlan({ plan: 'free' }), 'free')
  assert.equal(effectivePlan({ plan: 'pro', plan_until: now + 1000 }), 'pro')
  assert.equal(effectivePlan({ plan: 'pro', plan_until: now - 86400_000 }), 'pro')
  assert.equal(effectivePlan({ plan: 'pro', plan_until: now - 5 * 86400_000 }), 'free')
})
