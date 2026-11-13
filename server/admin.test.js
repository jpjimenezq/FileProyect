import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

process.env.SESSION_SECRET = 'test-secret'
process.env.DATA_DIR = path.join(os.tmpdir(), 'fileproyect-test-data')

const { buildApp } = await import('./app.js')
const { fakeData } = await import('./fake-data.js')
const { validateNewDiscount, normalizeCode } = await import('./discounts.js')

async function fresh() {
  const data = fakeData()
  const { app } = await buildApp({ logger: false, data })
  const as = (token) => ({ authorization: `Bearer ${token}` })
  const req = (method, url, token, payload) => app.inject({ method, url, payload, headers: token ? as(token) : {} })
  const admin = data.addUser('admin@example.com', { role: 'admin' })
  const ana = data.addUser('ana@example.com')
  return { app, data, req, admin, ana }
}

const grantCode = (extra = {}) => ({ code: 'regalo30', kind: 'grant', grant_days: 30, ...extra })

test('autorización: anónimo 401, usuario 403, administrador 200', async (t) => {
  const { app, req, admin, ana } = await fresh()
  t.after(() => app.close())

  for (const url of ['/api/admin/stats', '/api/admin/users', '/api/admin/discounts', '/api/admin/audit']) {
    assert.equal((await req('GET', url)).statusCode, 401, url)
    assert.equal((await req('GET', url, ana.token)).statusCode, 403, url)
    assert.equal((await req('GET', url, admin.token)).statusCode, 200, url)
  }
  assert.equal((await req('POST', '/api/admin/discounts', ana.token, grantCode())).statusCode, 403)
  // un token inventado no es un usuario: pide iniciar sesión de nuevo
  const bad = await req('GET', '/api/me', 'tok-nadie@example.com')
  assert.equal(bad.statusCode, 401)
  assert.equal(bad.json().code, 'session')
})

test('/api/me con token devuelve el usuario y su rol', async (t) => {
  const { app, req, admin, ana } = await fresh()
  t.after(() => app.close())
  assert.equal((await req('GET', '/api/me')).json().plan, 'anon')
  assert.equal((await req('GET', '/api/me', admin.token)).json().user.role, 'admin')
  const me = (await req('GET', '/api/me', ana.token)).json()
  assert.equal(me.user.email, 'ana@example.com')
  assert.equal(me.user.role, 'user')
  assert.equal(me.plan, 'free')
})

test('las rutas antiguas de acceso devuelven 410 en modo Supabase', async (t) => {
  const { app, req } = await fresh()
  t.after(() => app.close())
  for (const url of ['register', 'login', 'logout', 'forgot', 'reset']) {
    const res = await req('POST', `/api/auth/${url}`, null, { email: 'x@example.com', password: 'secreto123' })
    assert.equal(res.statusCode, 410, url)
    assert.match(res.json().error, /Supabase/)
  }
})

test('un usuario bloqueado recibe 403 en español', async (t) => {
  const { app, req, ana, data } = await fresh()
  t.after(() => app.close())
  data.users.update(ana.user.id, { banned: true })
  for (const [m, u] of [['GET', '/api/me'], ['POST', '/api/billing/checkout'], ['POST', '/api/billing/redeem'], ['POST', '/api/ai/summarize']]) {
    const res = await req(m, u, ana.token, {})
    assert.equal(res.statusCode, 403, u)
    assert.match(res.json().error, /suspendida/)
    assert.equal(res.json().code, 'banned')
  }
})

test('administrar usuarios: listar, buscar, editar, bloquear y borrar con auditoría', async (t) => {
  const { app, req, admin, ana, data } = await fresh()
  t.after(() => app.close())

  const list = (await req('GET', '/api/admin/users?search=ANA&page=1', admin.token)).json()
  assert.equal(list.total, 1)
  assert.equal(list.items[0].email, 'ana@example.com')

  const until = new Date(Date.now() + 10 * 86400_000).toISOString()
  const patched = await req('PATCH', `/api/admin/users/${ana.user.id}`, admin.token, { plan: 'pro', plan_until: until, full_name: ' Ana ' })
  assert.equal(patched.statusCode, 200)
  assert.equal(patched.json().effective_plan, 'pro')
  assert.equal(patched.json().full_name, 'Ana')
  assert.equal((await req('GET', '/api/me', ana.token)).json().plan, 'pro')

  assert.equal((await req('PATCH', `/api/admin/users/${ana.user.id}`, admin.token, { plan: 'gold' })).statusCode, 400)
  assert.equal((await req('PATCH', `/api/admin/users/${ana.user.id}`, admin.token, { role: 'root' })).statusCode, 400)
  assert.equal((await req('PATCH', `/api/admin/users/${ana.user.id}`, admin.token, {})).statusCode, 400)
  assert.equal((await req('PATCH', '/api/admin/users/no-es-uuid', admin.token, { banned: true })).statusCode, 400)
  assert.equal((await req('PATCH', `/api/admin/users/${crypto.randomUUID()}`, admin.token, { banned: true })).statusCode, 404)
  // un administrador no puede bloquearse ni quitarse el rol a sí mismo
  assert.equal((await req('PATCH', `/api/admin/users/${admin.user.id}`, admin.token, { banned: true })).statusCode, 409)
  assert.equal((await req('PATCH', `/api/admin/users/${admin.user.id}`, admin.token, { role: 'user' })).statusCode, 409)

  assert.equal((await req('DELETE', `/api/admin/users/${admin.user.id}`, admin.token)).statusCode, 409)
  // el navegador suele enviar Content-Type: application/json aunque no haya cuerpo
  const del = await app.inject({ method: 'DELETE', url: `/api/admin/users/${ana.user.id}`, headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'application/json' } })
  assert.equal(del.statusCode, 200)
  assert.equal(data.profiles.has(ana.user.id), false)

  const audit = (await req('GET', '/api/admin/audit', admin.token)).json()
  assert.deepEqual(audit.items.map((a) => a.action), ['user.delete', 'user.update'])
  assert.equal(audit.items[0].actor_email, 'admin@example.com')
})

test('estadísticas del panel', async (t) => {
  const { app, req, admin, ana } = await fresh()
  t.after(() => app.close())
  await req('POST', '/api/admin/discounts', admin.token, grantCode())
  const stats = (await req('GET', '/api/admin/stats', admin.token)).json()
  assert.equal(stats.users, 2)
  assert.equal(stats.new7d, 2)
  assert.equal(stats.pro, 0)
  assert.equal(stats.activeCodes, 1)
  assert.equal(typeof stats.jobsToday, 'number')
  assert.ok(ana)
})

test('códigos de descuento: crear, validar, duplicados, activar y editar', async (t) => {
  const { app, req, admin } = await fresh()
  t.after(() => app.close())

  const created = await req('POST', '/api/admin/discounts', admin.token, grantCode({ description: 'Regalo', max_redemptions: 5 }))
  assert.equal(created.statusCode, 201)
  assert.equal(created.json().code, 'REGALO30') // se guarda en mayúsculas
  assert.equal(created.json().grant_days, 30)
  // sin distinguir mayúsculas
  assert.equal((await req('POST', '/api/admin/discounts', admin.token, grantCode({ code: 'Regalo30' }))).statusCode, 409)

  const bad = (body) => req('POST', '/api/admin/discounts', admin.token, body)
  assert.equal((await bad({ code: 'ab', kind: 'grant', grant_days: 3 })).statusCode, 400)
  assert.equal((await bad({ code: 'con espacio', kind: 'grant', grant_days: 3 })).statusCode, 400)
  assert.equal((await bad({ code: 'A'.repeat(33), kind: 'grant', grant_days: 3 })).statusCode, 400)
  assert.equal((await bad({ code: 'OKK', kind: 'raro' })).statusCode, 400)
  assert.equal((await bad({ code: 'PCT0', kind: 'percent', value: 0 })).statusCode, 400)
  assert.equal((await bad({ code: 'PCT101', kind: 'percent', value: 101 })).statusCode, 400)
  assert.equal((await bad({ code: 'AMT0', kind: 'amount', value: 0 })).statusCode, 400)
  assert.equal((await bad({ code: 'GRANT0', kind: 'grant', grant_days: 0 })).statusCode, 400)
  assert.equal((await bad({ code: 'REP', kind: 'percent', value: 10, duration: 'repeating' })).statusCode, 400)
  assert.equal((await bad({ code: 'PASADO', kind: 'percent', value: 10, expires_at: '2020-01-01' })).statusCode, 400)
  assert.equal((await bad({ code: 'MAXMAL', kind: 'percent', value: 10, max_redemptions: 0 })).statusCode, 400)

  const pct = await bad({ code: 'verano_20', kind: 'percent', value: 20, duration: 'repeating', duration_months: 3 })
  assert.equal(pct.statusCode, 201)
  assert.equal(pct.json().duration_months, 3)
  const amt = await bad({ code: 'MENOS5', kind: 'amount', value: 5 })
  assert.equal(amt.json().currency, 'eur')

  const list = (await req('GET', '/api/admin/discounts', admin.token)).json().items
  assert.equal(list.length, 3)

  const id = created.json().id
  const off = await req('PATCH', `/api/admin/discounts/${id}`, admin.token, { active: false, description: 'Pausado', max_redemptions: 10 })
  assert.equal(off.json().active, false)
  assert.equal(off.json().max_redemptions, 10)
  assert.equal((await req('PATCH', `/api/admin/discounts/${id}`, admin.token, { active: 'si' })).statusCode, 400)
  assert.equal((await req('PATCH', `/api/admin/discounts/${crypto.randomUUID()}`, admin.token, { active: true })).statusCode, 404)
  assert.equal((await req('GET', '/api/admin/audit', admin.token)).json().items[0].action, 'discount.update')
})

test('normalizar y validar códigos', () => {
  assert.equal(normalizeCode('  hola-1 '), 'HOLA-1')
  assert.equal(validateNewDiscount({ code: 'x_y-9', kind: 'percent', value: 100 }).code, 'X_Y-9')
  assert.throws(() => validateNewDiscount({ code: 'ñandú', kind: 'percent', value: 10 }))
})

test('canjear un código grant da Pro, no se repite y suma días', async (t) => {
  const { app, req, admin, ana } = await fresh()
  t.after(() => app.close())
  await req('POST', '/api/admin/discounts', admin.token, grantCode())

  assert.equal((await req('POST', '/api/billing/redeem', null, { code: 'REGALO30' })).statusCode, 401)
  assert.equal((await req('POST', '/api/billing/redeem', ana.token, { code: 'NOEXISTE' })).statusCode, 404)

  const ok = await req('POST', '/api/billing/redeem', ana.token, { code: 'regalo30' })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.json().plan, 'pro')
  const days = (ok.json().until - Date.now()) / 86400_000
  assert.ok(days > 29.9 && days <= 30)
  assert.equal((await req('GET', '/api/me', ana.token)).json().plan, 'pro')

  const again = await req('POST', '/api/billing/redeem', ana.token, { code: 'REGALO30' })
  assert.equal(again.statusCode, 409)
  assert.match(again.json().error, /Ya has canjeado/)
})

test('un código grant también se aplica desde el checkout, sin pasar por Stripe', async (t) => {
  const { app, req, admin, ana } = await fresh()
  t.after(() => app.close())
  await req('POST', '/api/admin/discounts', admin.token, grantCode())
  const res = await req('POST', '/api/billing/checkout', ana.token, { code: 'REGALO30', interval: 'month' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().granted, true)
  assert.equal(res.json().url, null)
  assert.equal((await req('GET', '/api/me', ana.token)).json().plan, 'pro')
})

test('los códigos respetan máximo de usos, caducidad y estado activo', async (t) => {
  const { app, req, admin, ana, data } = await fresh()
  t.after(() => app.close())
  const bob = data.addUser('bob@example.com')
  const eva = data.addUser('eva@example.com')

  await req('POST', '/api/admin/discounts', admin.token, grantCode({ code: 'SOLO1', max_redemptions: 1 }))
  assert.equal((await req('POST', '/api/billing/redeem', ana.token, { code: 'SOLO1' })).statusCode, 200)
  const full = await req('POST', '/api/billing/redeem', bob.token, { code: 'SOLO1' })
  assert.equal(full.statusCode, 410)
  assert.match(full.json().error, /máximo/)

  await req('POST', '/api/admin/discounts', admin.token, grantCode({ code: 'CADUCA', expires_at: new Date(Date.now() + 60_000).toISOString() }))
  const caduca = [...data.codes.values()].find((c) => c.code === 'CADUCA')
  caduca.expires_at = new Date(Date.now() - 1000).toISOString() // pasa el tiempo
  const old = await req('POST', '/api/billing/redeem', bob.token, { code: 'CADUCA' })
  assert.equal(old.statusCode, 410)
  assert.match(old.json().error, /caducado/)

  const off = await req('POST', '/api/admin/discounts', admin.token, grantCode({ code: 'APAGADO' }))
  await req('PATCH', `/api/admin/discounts/${off.json().id}`, admin.token, { active: false })
  assert.equal((await req('POST', '/api/billing/redeem', eva.token, { code: 'APAGADO' })).statusCode, 404)
})

test('los descuentos percent/amount se piden al pagar y exigen Stripe configurado', async (t) => {
  for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_MONTH', 'STRIPE_PRICE_YEAR']) delete process.env[k]
  const { app, req, admin, ana } = await fresh()
  t.after(() => app.close())
  await req('POST', '/api/admin/discounts', admin.token, { code: 'VERANO', kind: 'percent', value: 20 })

  const redeem = await req('POST', '/api/billing/redeem', ana.token, { code: 'VERANO' })
  assert.equal(redeem.statusCode, 400)
  assert.match(redeem.json().error, /descuento/)

  const checkout = await req('POST', '/api/billing/checkout', ana.token, { code: 'VERANO' })
  assert.equal(checkout.statusCode, 503)
  assert.match(checkout.json().error, /pagos no están configurados/)
})

test('descuento percent con Stripe: crea cupón y código promocional y los aplica al checkout', async (t) => {
  const http = await import('node:http')
  const calls = []
  const server = http.createServer((rq, rs) => {
    let body = ''
    rq.on('data', (c) => (body += c))
    rq.on('end', () => {
      calls.push({ url: rq.url, body })
      rs.writeHead(200, { 'Content-Type': 'application/json' })
      if (rq.url === '/v1/coupons') rs.end(JSON.stringify({ id: 'coupon_1' }))
      else if (rq.url === '/v1/promotion_codes') rs.end(JSON.stringify({ id: 'promo_1' }))
      else rs.end(JSON.stringify({ url: 'https://checkout.example/desc' }))
    })
  })
  await new Promise((r) => server.listen(0, r))
  Object.assign(process.env, { STRIPE_API_BASE: `http://127.0.0.1:${server.address().port}`, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_MONTH: 'price_m', STRIPE_PRICE_YEAR: 'price_y' })
  const { app, req, admin, ana } = await fresh()
  t.after(() => { app.close(); server.close(); for (const k of ['STRIPE_API_BASE', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_MONTH', 'STRIPE_PRICE_YEAR']) delete process.env[k] })

  const created = await req('POST', '/api/admin/discounts', admin.token, { code: 'VERANO', kind: 'percent', value: 20, duration: 'once' })
  assert.equal(created.json().stripe_promotion_code_id, 'promo_1')
  assert.match(calls.find((c) => c.url === '/v1/coupons').body, /percent_off=20/)

  const res = await req('POST', '/api/billing/checkout', ana.token, { code: 'verano', interval: 'year' })
  assert.equal(res.json().url, 'https://checkout.example/desc')
  const session = calls.filter((c) => c.url === '/v1/checkout/sessions').at(-1).body
  assert.match(session, /promotion_code%5D=promo_1/)
  assert.doesNotMatch(session, /allow_promotion_codes/)
})

test('el webhook con metadatos de descuento anota el canje', async () => {
  const { applyEvent } = await import('./billing.js')
  const data = fakeData()
  const { user } = data.addUser('pagador@example.com')
  const code = await data.discounts.create({ code: 'PAGO', kind: 'percent', value: 10, max_redemptions: null, expires_at: null })
  await applyEvent(data, { type: 'checkout.session.completed', data: { object: { client_reference_id: user.id, customer: 'cus_9', subscription: 'sub_9', metadata: { discount_code_id: code.id } } } })
  assert.equal(user.plan, 'pro')
  assert.equal(user.stripe_customer, 'cus_9')
  assert.equal(data.codes.get(code.id).redeemed, 1)
  assert.equal(await data.discounts.hasRedeemed(code.id, user.id), true)
})

test('en modo SQLite el panel y los códigos avisan de que requieren Supabase', async (t) => {
  const { app } = await buildApp({ dbFile: ':memory:', logger: false })
  t.after(() => app.close())
  const res = await app.inject('/api/admin/stats')
  assert.equal(res.statusCode, 404)
  assert.match(res.json().error, /Supabase/)
})
