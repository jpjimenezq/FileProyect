import { randomUUID } from 'node:crypto'
import { UserError } from './exec.js'
import { day } from './plans.js'

/**
 * Almacén en memoria con la misma interfaz que store/supabase.js, para probar sin Supabase real.
 * Cada usuario recibe un token «tok-<correo>» que sirve como access_token en la cabecera Bearer.
 */
export function fakeData() {
  const profiles = new Map()
  const usage = new Map()
  const codes = new Map()
  const redemptions = new Set()
  const auditRows = []

  const addUser = (email, extra = {}) => {
    const user = { id: randomUUID(), email, full_name: null, role: 'user', plan: 'free', plan_until: null, stripe_customer: null, stripe_subscription: null, banned: false, created_at: new Date().toISOString(), last_seen_at: null, ...extra }
    profiles.set(user.id, user)
    return { user, token: `tok-${email}` }
  }
  const byEmail = (email) => [...profiles.values()].find((u) => u.email === email)

  const data = {
    mode: 'supabase',
    admin: true,
    addUser,
    profiles,
    codes,
    auditRows,
    users: {
      byId: async (id) => profiles.get(id),
      byCustomer: async (c) => [...profiles.values()].find((u) => u.stripe_customer === c),
      fromToken: async (token) => (token.startsWith('tok-') ? byEmail(token.slice(4)) ?? null : null),
      setPlan: async (id, { plan, until = null, customer = null, subscription = null }) => {
        const u = profiles.get(id)
        Object.assign(u, { plan, plan_until: until }, customer ? { stripe_customer: customer } : {}, subscription ? { stripe_subscription: subscription } : {})
      },
      update: async (id, patch) => Object.assign(profiles.get(id), patch),
      list: async ({ search = '', page = 1, pageSize = 20 }) => {
        const all = [...profiles.values()].filter((u) => `${u.email} ${u.full_name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
        return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length }
      },
      remove: async (id) => { profiles.delete(id); usage.delete(`u:${id}`) },
    },
    usage: {
      get: async (actor, kind, period) => usage.get(`${actor}|${kind}|${period}`) ?? 0,
      add: async (actor, kind, period, n) => usage.set(`${actor}|${kind}|${period}`, (usage.get(`${actor}|${kind}|${period}`) ?? 0) + n),
      prune: async () => {},
    },
    discounts: {
      list: async () => [...codes.values()],
      byId: async (id) => codes.get(id),
      byCode: async (code) => [...codes.values()].find((c) => c.code === String(code).toUpperCase()),
      create: async (row) => {
        if ([...codes.values()].some((c) => c.code === row.code)) throw new UserError('Ya existe un código con ese nombre.', 409)
        const c = { id: randomUUID(), redeemed: 0, active: true, stripe_coupon_id: null, stripe_promotion_code_id: null, created_at: new Date().toISOString(), ...row }
        codes.set(c.id, c)
        return c
      },
      update: async (id, patch) => Object.assign(codes.get(id), patch),
      hasRedeemed: async (id, userId) => redemptions.has(`${id}|${userId}`),
      // misma lógica que la función SQL redeem_discount
      redeem: async (id, userId) => {
        const c = codes.get(id)
        if (redemptions.has(`${id}|${userId}`)) return 'already'
        if (!c || !c.active || (c.max_redemptions != null && c.redeemed >= c.max_redemptions) || (c.expires_at && Date.parse(c.expires_at) <= Date.now())) return 'unavailable'
        redemptions.add(`${id}|${userId}`)
        c.redeemed++
        return 'ok'
      },
    },
    audit: {
      add: async ({ actor, action, target = null, data: d = {} }) => { auditRows.unshift({ id: auditRows.length + 1, actor_id: actor?.id ?? null, actor_email: actor?.email ?? null, action, target, data: d, created_at: new Date().toISOString() }) },
      list: async ({ page = 1, pageSize = 30 }) => ({ items: auditRows.slice((page - 1) * pageSize, page * pageSize), total: auditRows.length }),
    },
    stats: async () => {
      const now = Date.now()
      const users = [...profiles.values()]
      return {
        users: users.length,
        pro: users.filter((u) => u.plan === 'pro' && (!u.plan_until || u.plan_until > now)).length,
        new7d: users.filter((u) => Date.parse(u.created_at) > now - 7 * 86400_000).length,
        activeCodes: [...codes.values()].filter((c) => c.active).length,
        jobsToday: [...usage].filter(([k]) => k.endsWith(`|jobs|d:${day()}`)).reduce((n, [, v]) => n + v, 0),
        activeToday: 0,
      }
    },
    close: async () => {},
  }
  return data
}
