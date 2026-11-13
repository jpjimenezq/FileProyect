import { UserError } from './exec.js'
import { effectivePlan } from './plans.js'
import { billingEnabled, createStripePromo, setStripePromoActive } from './billing.js'
import { validateDiscountPatch, validateNewDiscount } from './discounts.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString())

/** Forma del usuario en la API de administración (fechas en ISO 8601) */
const adminUser = (u) => ({
  id: u.id,
  email: u.email,
  full_name: u.full_name ?? null,
  role: u.role,
  plan: u.plan,
  effective_plan: effectivePlan(u),
  plan_until: iso(u.plan_until),
  banned: Boolean(u.banned),
  subscribed: Boolean(u.stripe_subscription),
  stripe_customer: u.stripe_customer ?? null,
  created_at: u.created_at,
  last_seen_at: u.last_seen_at ?? null,
})

const pageOf = (q, size = 20) => {
  const page = Math.max(1, Math.min(100_000, Math.floor(Number(q.page)) || 1))
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(q.pageSize)) || size))
  return { page, pageSize }
}

function checkId(id) {
  if (!UUID.test(String(id))) throw new UserError('Identificador no válido.', 400)
  return String(id)
}

/** Valida el cuerpo de PATCH /users/:id y lo devuelve en el formato del almacén (plan_until en ms) */
function validateUserPatch(body = {}) {
  const patch = {}
  if ('plan' in body) {
    if (!['free', 'pro'].includes(body.plan)) throw new UserError('El plan debe ser free o pro.')
    patch.plan = body.plan
  }
  if ('plan_until' in body) {
    if (body.plan_until === null || body.plan_until === '') patch.plan_until = null
    else {
      const t = Date.parse(body.plan_until)
      if (Number.isNaN(t)) throw new UserError('La fecha de fin del plan no es válida.')
      patch.plan_until = t
    }
  }
  if ('role' in body) {
    if (!['user', 'admin'].includes(body.role)) throw new UserError('El rol debe ser user o admin.')
    patch.role = body.role
  }
  if ('banned' in body) {
    if (typeof body.banned !== 'boolean') throw new UserError('«banned» debe ser verdadero o falso.')
    patch.banned = body.banned
  }
  if ('full_name' in body) {
    const name = body.full_name == null ? null : String(body.full_name).trim()
    if (name && name.length > 100) throw new UserError('El nombre admite como máximo 100 caracteres.')
    patch.full_name = name || null
  }
  if (!Object.keys(patch).length) throw new UserError('No hay nada que cambiar.')
  // pasar a free sin indicar fecha limpia la fecha anterior
  if (patch.plan === 'free' && !('plan_until' in patch)) patch.plan_until = null
  return patch
}

/**
 * API de administración bajo /api/admin/*. Solo role 'admin' (403 si no, 401 sin sesión).
 * Cada acción que cambia algo queda en admin_audit con quién, qué y sobre qué.
 */
export function registerAdmin(app, { data, requireUser }) {
  const adminOnly = async (req) => {
    if (!data.admin) throw new UserError('El panel de administración requiere Supabase en este servidor.', 404)
    const user = await requireUser(req)
    if (user.role !== 'admin') throw new UserError('Solo para administradores.', 403)
    return user
  }
  const audit = (actor, action, target, details = {}) => data.audit.add({ actor, action, target, data: details })

  app.get('/api/admin/stats', async (req) => {
    await adminOnly(req)
    return data.stats()
  })

  app.get('/api/admin/users', async (req) => {
    await adminOnly(req)
    const { page, pageSize } = pageOf(req.query)
    const { items, total } = await data.users.list({ search: String(req.query.search ?? '').slice(0, 100), page, pageSize })
    return { items: items.map(adminUser), page, pageSize, total }
  })

  app.patch('/api/admin/users/:id', async (req) => {
    const actor = await adminOnly(req)
    const id = checkId(req.params.id)
    const patch = validateUserPatch(req.body)
    // para no quedarse sin administradores ni bloquearse a uno mismo
    if (id === actor.id && (patch.role === 'user' || patch.banned === true)) throw new UserError('No puedes quitarte el rol de administrador ni bloquearte a ti mismo.', 409)
    if (!(await data.users.byId(id))) throw new UserError('Usuario no encontrado.', 404)
    const user = await data.users.update(id, patch)
    await audit(actor, 'user.update', id, { email: user.email, changes: { ...patch, ...('plan_until' in patch ? { plan_until: iso(patch.plan_until) } : {}) } })
    return adminUser(user)
  })

  app.delete('/api/admin/users/:id', async (req) => {
    const actor = await adminOnly(req)
    const id = checkId(req.params.id)
    if (id === actor.id) throw new UserError('No puedes borrar tu propia cuenta desde el panel.', 409)
    const user = await data.users.byId(id)
    if (!user) throw new UserError('Usuario no encontrado.', 404)
    await data.users.remove(id)
    await audit(actor, 'user.delete', id, { email: user.email })
    return { ok: true }
  })

  app.get('/api/admin/discounts', async (req) => {
    await adminOnly(req)
    return { items: await data.discounts.list() }
  })

  app.post('/api/admin/discounts', async (req, reply) => {
    const actor = await adminOnly(req)
    const row = validateNewDiscount(req.body)
    if (await data.discounts.byCode(row.code)) throw new UserError('Ya existe un código con ese nombre.', 409)
    // percent/amount se registran también en Stripe si está configurado; si no, se crearán al usarse por primera vez
    if (row.kind !== 'grant' && billingEnabled()) Object.assign(row, await createStripePromo(row))
    const created = await data.discounts.create({ ...row, created_by: actor.id })
    await audit(actor, 'discount.create', created.id, { code: created.code, kind: created.kind })
    return reply.status(201).send(created)
  })

  app.patch('/api/admin/discounts/:id', async (req) => {
    const actor = await adminOnly(req)
    const id = checkId(req.params.id)
    const patch = validateDiscountPatch(req.body)
    const current = await data.discounts.byId(id)
    if (!current) throw new UserError('Código no encontrado.', 404)
    if (patch.expires_at && Date.parse(patch.expires_at) <= Date.now() && patch.expires_at !== current.expires_at) throw new UserError('La caducidad debe estar en el futuro.')
    const updated = await data.discounts.update(id, patch)
    if ('active' in patch && current.stripe_promotion_code_id && billingEnabled()) {
      await setStripePromoActive(current.stripe_promotion_code_id, patch.active).catch((e) => req.log.error(e, 'No se pudo actualizar el código en Stripe'))
    }
    await audit(actor, 'discount.update', id, { code: current.code, changes: patch })
    return updated
  })

  app.get('/api/admin/audit', async (req) => {
    await adminOnly(req)
    const { page, pageSize } = pageOf(req.query, 30)
    const { items, total } = await data.audit.list({ page, pageSize })
    return { items, page, pageSize, total }
  })
}
