import { UserError } from '../exec.js'
import { day } from '../plans.js'

const TOKEN_TTL_MS = 60_000
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString())

/** Una respuesta de PostgREST con error se convierte en excepción (el manejador global responde 500 sin filtrar detalles) */
function must({ data, error }) {
  if (error) throw Object.assign(new Error(`Supabase: ${error.message}`), { code: error.code })
  return data
}

/** Fila de profiles → el usuario con la forma que ya usan las rutas (plan_until en milisegundos, como en SQLite) */
const toUser = (p) => p && {
  id: p.id,
  email: p.email,
  full_name: p.full_name,
  role: p.role,
  plan: p.plan,
  plan_until: p.plan_until ? Date.parse(p.plan_until) : null,
  stripe_customer: p.stripe_customer_id,
  stripe_subscription: p.stripe_subscription_id,
  banned: p.banned,
  created_at: p.created_at,
  last_seen_at: p.last_seen_at,
}

/**
 * Datos de usuarios, cuotas, códigos de descuento y auditoría sobre Supabase (service role: salta RLS).
 * `client` es un cliente de @supabase/supabase-js; `adminEmails` los correos que pasan a role 'admin' al verse.
 */
export function supabaseData(client, { adminEmails = [] } = {}) {
  const admins = new Set(adminEmails)
  const profiles = () => client.from('profiles')

  // Caché corta token → usuario: evita ir a Supabase en cada petición. Se invalida al modificar al usuario aquí.
  const cache = new Map()
  const drop = (id) => { for (const [token, hit] of cache) if (hit.user.id === id) cache.delete(token) }

  const profile = async (id) => toUser(must(await profiles().select('*').eq('id', id).maybeSingle()))

  const users = {
    byId: profile,
    byCustomer: async (customer) => toUser(must(await profiles().select('*').eq('stripe_customer_id', customer).limit(1).maybeSingle())),

    async fromToken(token) {
      const hit = cache.get(token)
      if (hit && hit.exp > Date.now()) return hit.user
      cache.delete(token)
      const { data, error } = await client.auth.getUser(token)
      if (error || !data?.user) return null
      const au = data.user
      let user = await profile(au.id)
      if (!user) {
        // usuario anterior al trigger de perfiles
        must(await profiles().upsert({ id: au.id, email: au.email, full_name: au.user_metadata?.full_name ?? au.user_metadata?.name ?? null }, { onConflict: 'id', ignoreDuplicates: true }))
        user = await profile(au.id)
      }
      const patch = { last_seen_at: new Date().toISOString() }
      if (au.email && admins.has(au.email.toLowerCase()) && user.role !== 'admin') patch.role = 'admin'
      must(await profiles().update(patch).eq('id', au.id))
      user = { ...user, ...patch }
      if (cache.size > 2000) for (const [t, h] of cache) if (h.exp <= Date.now()) cache.delete(t)
      cache.set(token, { user, exp: Date.now() + TOKEN_TTL_MS })
      return user
    },

    async setPlan(id, { plan, until = null, customer = null, subscription = null }) {
      const patch = { plan, plan_until: iso(until) }
      if (customer) patch.stripe_customer_id = customer
      if (subscription) patch.stripe_subscription_id = subscription
      must(await profiles().update(patch).eq('id', id))
      drop(id)
    },

    /** Edición desde el panel: plan, plan_until (ms o null), role, banned, full_name */
    async update(id, patch) {
      const row = {}
      for (const k of ['plan', 'role', 'banned', 'full_name']) if (k in patch) row[k] = patch[k]
      if ('plan_until' in patch) row.plan_until = iso(patch.plan_until)
      const data = must(await profiles().update(row).eq('id', id).select('*').maybeSingle())
      drop(id)
      return toUser(data)
    },

    async list({ search = '', page = 1, pageSize = 20 }) {
      let q = profiles().select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
      // se quitan los caracteres con significado en el filtro de PostgREST
      const s = search.replace(/[,()%*\\"']/g, ' ').trim()
      if (s) q = q.or(`email.ilike.%${s}%,full_name.ilike.%${s}%`)
      const res = await q
      must(res)
      return { items: res.data.map(toUser), total: res.count ?? 0 }
    },

    /** Borra el usuario en auth (el perfil y los canjes caen en cascada) y sus contadores de uso */
    async remove(id) {
      const { error } = await client.auth.admin.deleteUser(id)
      if (error) throw new Error(`Supabase: ${error.message}`)
      must(await client.from('usage').delete().eq('actor', `u:${id}`))
      drop(id)
    },
  }

  const usage = {
    get: async (actor, kind, period) => must(await client.from('usage').select('amount').eq('actor', actor).eq('kind', kind).eq('period', period).maybeSingle())?.amount ?? 0,
    add: async (actor, kind, period, amount) => must(await client.rpc('add_usage', { p_actor: actor, p_kind: kind, p_period: period, p_amount: amount })),
    prune: async (olderThanDay) => must(await client.from('usage').delete().lt('period', `d:${olderThanDay}`).like('period', 'd:%')),
  }

  const codes = () => client.from('discount_codes')
  const discounts = {
    list: async () => must(await codes().select('*').order('created_at', { ascending: false })),
    byId: async (id) => must(await codes().select('*').eq('id', id).maybeSingle()),
    byCode: async (code) => must(await codes().select('*').eq('code', String(code).toUpperCase()).maybeSingle()),
    async create(row) {
      const res = await codes().insert(row).select('*').single()
      if (res.error?.code === '23505') throw new UserError('Ya existe un código con ese nombre.', 409)
      return must(res)
    },
    update: async (id, patch) => must(await codes().update(patch).eq('id', id).select('*').maybeSingle()),
    hasRedeemed: async (id, userId) => Boolean(must(await client.from('redemptions').select('code_id').eq('code_id', id).eq('user_id', userId).maybeSingle())),
    /** 'ok' | 'already' | 'unavailable' (inactivo, caducado o agotado): lo decide la base de datos en una sola transacción */
    redeem: async (id, userId) => must(await client.rpc('redeem_discount', { p_code_id: id, p_user_id: userId })),
  }

  const audit = {
    add: async ({ actor, action, target = null, data = {} }) =>
      must(await client.from('admin_audit').insert({ actor_id: actor?.id ?? null, actor_email: actor?.email ?? null, action, target, data })),
    async list({ page = 1, pageSize = 30 }) {
      const res = await client.from('admin_audit').select('*', { count: 'exact' }).order('id', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
      must(res)
      return { items: res.data, total: res.count ?? 0 }
    },
  }

  async function stats() {
    const head = (q) => q.then((r) => (must(r), r.count ?? 0))
    const now = new Date().toISOString()
    const [total, pro, new7d, activeCodes, today] = await Promise.all([
      head(profiles().select('id', { count: 'exact', head: true })),
      head(profiles().select('id', { count: 'exact', head: true }).eq('plan', 'pro').or(`plan_until.is.null,plan_until.gt.${now}`)),
      head(profiles().select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())),
      head(codes().select('id', { count: 'exact', head: true }).eq('active', true).or(`expires_at.is.null,expires_at.gt.${now}`)),
      client.from('usage').select('actor,amount').eq('kind', 'jobs').eq('period', `d:${day()}`).limit(10000),
    ])
    const rows = must(today)
    return { users: total, pro, new7d, activeCodes, jobsToday: rows.reduce((n, r) => n + Number(r.amount), 0), activeToday: rows.length }
  }

  return { mode: 'supabase', admin: true, users, usage, discounts, audit, stats, close: async () => {} }
}
