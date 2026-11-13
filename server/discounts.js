import { UserError } from './exec.js'
import { effectivePlan } from './plans.js'

const CODE = /^[A-Z0-9_-]{3,32}$/
const KINDS = ['percent', 'amount', 'grant']
const DURATIONS = ['once', 'repeating', 'forever']
const DAY_MS = 86400_000

/** Los códigos se escriben sin distinguir mayúsculas: se guardan y comparan en mayúsculas */
export const normalizeCode = (code) => String(code ?? '').trim().toUpperCase()

function int(v, name, min, max) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new UserError(`${name} debe ser un número entero entre ${min} y ${max}.`)
  return n
}

function optionalDate(v, name) {
  if (v == null || v === '') return null
  const t = Date.parse(v)
  if (Number.isNaN(t)) throw new UserError(`${name} no es una fecha válida.`)
  return new Date(t).toISOString()
}

function optionalMax(v) {
  return v == null || v === '' ? null : int(v, 'El máximo de usos', 1, 1_000_000)
}

function description(v) {
  const d = String(v ?? '').trim()
  if (d.length > 200) throw new UserError('La descripción admite como máximo 200 caracteres.')
  return d || null
}

/** Valida el cuerpo de POST /api/admin/discounts y devuelve la fila lista para guardar */
export function validateNewDiscount(body = {}) {
  const code = normalizeCode(body.code)
  if (!CODE.test(code)) throw new UserError('El código debe tener de 3 a 32 caracteres: letras A-Z, números, guion y guion bajo.')
  if (!KINDS.includes(body.kind)) throw new UserError('El tipo debe ser percent, amount o grant.')

  const row = { code, description: description(body.description), kind: body.kind, value: 0, currency: 'eur', duration: 'once', duration_months: null, grant_days: null }
  if (body.kind === 'percent') {
    const v = Number(body.value)
    if (!Number.isFinite(v) || v < 1 || v > 100) throw new UserError('El porcentaje debe estar entre 1 y 100.')
    row.value = v
  } else if (body.kind === 'amount') {
    const v = Number(body.value)
    if (!Number.isFinite(v) || v <= 0 || v > 100_000) throw new UserError('El importe debe ser mayor que 0.')
    row.value = Math.round(v * 100) / 100
    const cur = String(body.currency ?? 'eur').trim().toLowerCase()
    if (!/^[a-z]{3}$/.test(cur)) throw new UserError('La moneda debe ser un código de 3 letras (p. ej. eur).')
    row.currency = cur
  } else {
    row.grant_days = int(body.grant_days, 'Los días de Pro', 1, 3650)
  }
  if (body.kind !== 'grant') {
    row.duration = body.duration ?? 'once'
    if (!DURATIONS.includes(row.duration)) throw new UserError('La duración debe ser once, repeating o forever.')
    if (row.duration === 'repeating') row.duration_months = int(body.duration_months, 'Los meses de duración', 1, 36)
  }
  row.max_redemptions = optionalMax(body.max_redemptions)
  row.expires_at = optionalDate(body.expires_at, 'La caducidad')
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) throw new UserError('La caducidad debe estar en el futuro.')
  return row
}

/** Valida PATCH /api/admin/discounts/:id: solo activar/desactivar, descripción, caducidad y máximo */
export function validateDiscountPatch(body = {}) {
  const patch = {}
  if ('active' in body) {
    if (typeof body.active !== 'boolean') throw new UserError('«active» debe ser verdadero o falso.')
    patch.active = body.active
  }
  if ('description' in body) patch.description = description(body.description)
  if ('expires_at' in body) patch.expires_at = optionalDate(body.expires_at, 'La caducidad')
  if ('max_redemptions' in body) patch.max_redemptions = optionalMax(body.max_redemptions)
  if (!Object.keys(patch).length) throw new UserError('No hay nada que cambiar.')
  return patch
}

/** Comprueba que el código se puede usar ahora (la base de datos vuelve a comprobarlo al canjear, de forma atómica) */
export function assertUsable(code, now = Date.now()) {
  if (!code || !code.active) throw new UserError('Ese código no existe o ya no está activo.', 404)
  if (code.expires_at && Date.parse(code.expires_at) <= now) throw new UserError('Ese código ha caducado.', 410)
  if (code.max_redemptions != null && code.redeemed >= code.max_redemptions) throw new UserError('Ese código ya se ha usado el máximo de veces.', 410)
}

/** Canjea un código para un usuario y traduce el resultado a errores en español */
export async function redeemCode(data, code, userId) {
  const result = await data.discounts.redeem(code.id, userId)
  if (result === 'already') throw new UserError('Ya has canjeado este código.', 409)
  if (result !== 'ok') throw new UserError('Ese código ya no está disponible.', 410)
}

/**
 * Canjea un código 'grant': regala Pro sumando los días a lo que le quede (o desde hoy), sin pasar por Stripe.
 * Una suscripción de pago activa no se toca. Devuelve la fecha de fin (ms).
 */
export async function applyGrant(data, user, code, now = Date.now()) {
  assertUsable(code, now)
  if (await data.discounts.hasRedeemed(code.id, user.id)) throw new UserError('Ya has canjeado este código.', 409)
  const pro = effectivePlan(user, now) === 'pro'
  if (pro && user.stripe_subscription) throw new UserError('Ya tienes una suscripción Pro activa: no hace falta canjear este código.', 409)
  if (pro && !user.plan_until) throw new UserError('Tu plan Pro no tiene fecha de fin: no hace falta canjear este código.', 409)
  await redeemCode(data, code, user.id)
  const base = pro && user.plan_until && user.plan_until > now ? user.plan_until : now
  const until = base + code.grant_days * DAY_MS
  await data.users.setPlan(user.id, { plan: 'pro', until })
  return until
}
