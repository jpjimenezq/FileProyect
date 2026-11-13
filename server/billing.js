import { createHmac, timingSafeEqual } from 'node:crypto'
import { UserError } from './exec.js'

const api = () => process.env.STRIPE_API_BASE || 'https://api.stripe.com'
const publicUrl = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '')

export const billingEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_MONTH && process.env.STRIPE_PRICE_YEAR)

/** Stripe usa application/x-www-form-urlencoded con corchetes para los anidados */
function form(data) {
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null) body.append(k, String(v))
  return body
}

async function stripe(path, data) {
  if (!billingEnabled()) throw new UserError('Los pagos no están configurados en este servidor.', 503)
  let res
  try {
    res = await fetch(`${api()}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form(data),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new UserError('No se pudo conectar con el sistema de pagos.', 502)
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new UserError('El sistema de pagos rechazó la operación.', 502)
  return json
}

export async function createCheckout(user, interval) {
  const price = interval === 'year' ? process.env.STRIPE_PRICE_YEAR : process.env.STRIPE_PRICE_MONTH
  const session = await stripe('/v1/checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': 1,
    client_reference_id: user.id,
    ...(user.stripe_customer ? { customer: user.stripe_customer } : { customer_email: user.email }),
    allow_promotion_codes: 'true',
    success_url: `${publicUrl()}/cuenta?pago=ok`,
    cancel_url: `${publicUrl()}/precios`,
  })
  return session.url
}

export async function createPortal(user) {
  if (!user.stripe_customer) throw new UserError('Todavía no tienes una suscripción.')
  const session = await stripe('/v1/billing_portal/sessions', { customer: user.stripe_customer, return_url: `${publicUrl()}/cuenta` })
  return session.url
}

/** Comprueba la cabecera Stripe-Signature (t=marca de tiempo,v1=HMAC-SHA256 de "t.cuerpo") */
export function verifyWebhook(rawBody, header, secret, now = Date.now()) {
  const parts = Object.fromEntries(String(header ?? '').split(',').map((p) => p.split('=', 2)))
  const t = Number(parts.t)
  if (!parts.v1 || !t || Math.abs(now / 1000 - t) > 300) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'))
  const given = Buffer.from(parts.v1)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

const ACTIVE = new Set(['active', 'trialing', 'past_due'])

/** Traduce un evento de Stripe en cambios de plan. Es idempotente: repetir el evento no rompe nada. */
export function applyEvent(store, event) {
  const obj = event.data?.object ?? {}
  if (event.type === 'checkout.session.completed') {
    const id = Number(obj.client_reference_id)
    if (id && store.userById(id)) {
      // hasta que llegue customer.subscription.updated con la fecha real se da un margen de 35 días
      store.setPlan(id, { plan: 'pro', until: Date.now() + 35 * 24 * 3600 * 1000, customer: obj.customer, subscription: obj.subscription })
    }
  } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const user = store.userByCustomer(obj.customer)
    if (!user) return
    const end = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end
    const active = event.type !== 'customer.subscription.deleted' && ACTIVE.has(obj.status)
    store.setPlan(user.id, { plan: active ? 'pro' : 'free', until: active && end ? end * 1000 : null, subscription: obj.id })
  }
}
