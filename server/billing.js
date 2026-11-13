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

/**
 * `promo` es un código de descuento (percent/amount) ya validado: se aplica como promotion code de Stripe
 * y su id viaja en los metadatos para registrar el canje cuando el pago se complete.
 */
export async function createCheckout(user, interval, promo) {
  const price = interval === 'year' ? process.env.STRIPE_PRICE_YEAR : process.env.STRIPE_PRICE_MONTH
  const session = await stripe('/v1/checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': 1,
    client_reference_id: user.id,
    ...(user.stripe_customer ? { customer: user.stripe_customer } : { customer_email: user.email }),
    // allow_promotion_codes y discounts son excluyentes en Stripe
    ...(promo ? { 'discounts[0][promotion_code]': promo.stripe_promotion_code_id, 'metadata[discount_code_id]': promo.id } : { allow_promotion_codes: 'true' }),
    success_url: `${publicUrl()}/cuenta?pago=ok`,
    cancel_url: `${publicUrl()}/precios`,
  })
  return session.url
}

/**
 * Crea en Stripe el cupón y el promotion code de un descuento percent/amount. El máximo de usos y la caducidad
 * los controla este servidor (en Stripe no se pueden editar después), así que no se envían.
 */
export async function createStripePromo(code) {
  const coupon = await stripe('/v1/coupons', {
    name: code.code,
    ...(code.kind === 'percent' ? { percent_off: code.value } : { amount_off: Math.round(code.value * 100), currency: code.currency }),
    duration: code.duration,
    ...(code.duration === 'repeating' ? { duration_in_months: code.duration_months } : {}),
  })
  let promo
  try {
    // API reciente de Stripe: el cupón va dentro de «promotion»
    promo = await stripe('/v1/promotion_codes', { code: code.code, 'promotion[type]': 'coupon', 'promotion[coupon]': coupon.id })
  } catch {
    // versiones anteriores de la API
    promo = await stripe('/v1/promotion_codes', { code: code.code, coupon: coupon.id })
  }
  return { stripe_coupon_id: coupon.id, stripe_promotion_code_id: promo.id }
}

/** Activa o desactiva el promotion code en Stripe (si falla no se bloquea el panel: el servidor ya valida el estado) */
export async function setStripePromoActive(promotionCodeId, active) {
  await stripe(`/v1/promotion_codes/${promotionCodeId}`, { active: String(active) })
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

/**
 * Traduce un evento de Stripe en cambios de plan. Es idempotente: repetir el evento no rompe nada.
 * `data` es el almacén (users, discounts); los id de usuario son números (SQLite) o uuid (Supabase).
 */
export async function applyEvent(data, event) {
  const obj = event.data?.object ?? {}
  if (event.type === 'checkout.session.completed') {
    const ref = String(obj.client_reference_id ?? '')
    const id = /^\d+$/.test(ref) ? Number(ref) : ref
    if (id && (await data.users.byId(id))) {
      // hasta que llegue customer.subscription.updated con la fecha real se da un margen de 35 días
      await data.users.setPlan(id, { plan: 'pro', until: Date.now() + 35 * 24 * 3600 * 1000, customer: obj.customer, subscription: obj.subscription })
      // pago con código de descuento: se anota el canje (si ya estaba canjeado o agotado, no pasa nada)
      if (obj.metadata?.discount_code_id && data.discounts) await data.discounts.redeem(obj.metadata.discount_code_id, id).catch(() => {})
    }
  } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const user = await data.users.byCustomer(obj.customer)
    if (!user) return
    const end = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end
    const active = event.type !== 'customer.subscription.deleted' && ACTIVE.has(obj.status)
    await data.users.setPlan(user.id, { plan: active ? 'pro' : 'free', until: active && end ? end * 1000 : null, subscription: obj.id })
  }
}
