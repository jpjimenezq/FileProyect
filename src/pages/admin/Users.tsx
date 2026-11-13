import { useEffect, useState } from 'react'
import { Crown, Search, ShieldCheck, ShieldOff, Trash2, UserCheck, UserX, Users as UsersIcon, X } from 'lucide-react'
import { ApiError, apiJson } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Button, Notice, PagePager } from '../../components/ui'
import { Segmented } from '../../components/Illustrate'
import { Chip, Empty, ErrorBox, PageHead, Skeleton, card, endOfDayIso, relative, shortDate, toYmd, todayYmd, useApi } from './shared'

export interface AdminUser {
  id: string
  email: string
  full_name: string | null
  role: 'user' | 'admin'
  plan: 'free' | 'pro'
  effective_plan: 'free' | 'pro'
  plan_until: string | null
  banned: boolean
  subscribed: boolean
  stripe_customer: string | null
  created_at: string
  last_seen_at: string | null
}
interface Page { items: AdminUser[]; page: number; pageSize: number; total: number }

const PAGE_SIZE = 15

function Chips({ u }: { u: AdminUser }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip tone={u.effective_plan === 'pro' ? 'lime' : 'ink'}>{u.effective_plan === 'pro' ? 'Pro' : 'Gratis'}</Chip>
      {u.role === 'admin' && <Chip tone="brand">Admin</Chip>}
      {u.banned && <Chip tone="red">Bloqueado</Chip>}
      {u.subscribed && <Chip tone="green">Con suscripción</Chip>}
    </div>
  )
}

const nameOf = (u: AdminUser) => u.full_name || u.email.split('@')[0]

function UserPanel({ user, isSelf, onClose, onChanged, onDeleted }: { user: AdminUser; isSelf: boolean; onClose: () => void; onChanged: (u: AdminUser) => void; onDeleted: (u: AdminUser) => void }) {
  const [plan, setPlan] = useState<'free' | 'pro'>(user.plan)
  const [until, setUntil] = useState(toYmd(user.plan_until))
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState<string>()
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string }>()

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    setMsg(undefined)
    try { await fn() } catch (e) { setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : 'No se pudo completar la acción.' }) } finally { setBusy(undefined) }
  }
  const patch = (name: string, body: Record<string, unknown>, ok: string) => run(name, async () => {
    const updated = await apiJson<AdminUser>('PATCH', `/api/admin/users/${user.id}`, body)
    onChanged(updated)
    setPlan(updated.plan)
    setUntil(toYmd(updated.plan_until))
    setMsg({ kind: 'success', text: ok })
  })
  const savePlan = () => patch('plan', plan === 'pro' ? { plan: 'pro', plan_until: until ? endOfDayIso(until) : null } : { plan: 'free' }, plan === 'pro' ? 'Plan Pro guardado.' : 'Ahora es un usuario gratuito.')
  const remove = () => run('delete', async () => {
    await apiJson('DELETE', `/api/admin/users/${user.id}`)
    onDeleted(user)
  })
  const planChanged = plan !== user.plan || (plan === 'pro' && until !== toYmd(user.plan_until))

  return (
    <div className="fixed inset-0 z-[60] flex" role="dialog" aria-modal="true" aria-label={`Gestionar a ${user.email}`}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-paper shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line bg-white p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-base font-bold text-lime">{nameOf(user)[0].toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{nameOf(user)}{isSelf && <span className="ml-2 text-xs font-medium text-ink/50">(tú)</span>}</h2>
            <p className="truncate text-sm text-ink/60">{user.email}</p>
            <div className="mt-2"><Chips u={user} /></div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-2 hover:bg-ink/5"><X size={20} /></button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {msg && <Notice kind={msg.kind} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}
          <p className="text-xs text-ink/55">Alta {shortDate(user.created_at)} · Visto {relative(user.last_seen_at)}</p>

          <section className={`${card} flex flex-col gap-3 p-4`}>
            <h3 className="text-base font-bold">Plan</h3>
            <Segmented<'free' | 'pro'> label="Plan" value={plan} onChange={setPlan} options={[{ value: 'free', label: 'Gratis' }, { value: 'pro', label: 'Pro', icon: Crown }]} />
            {plan === 'pro' && (
              <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold">
                Pro hasta <span className="font-normal text-ink/55">(opcional; vacío = sin fecha de fin)</span></span>
                <input type="date" value={until} min={todayYmd()} onChange={(e) => setUntil(e.target.value)} />
              </label>
            )}
            {user.subscribed && <p className="text-xs text-ink/55">Tiene una suscripción de pago: el plan lo gestiona Stripe.</p>}
            <Button variant="primary" loading={busy === 'plan'} disabled={!planChanged} onClick={savePlan}>Guardar plan</Button>
          </section>

          <section className={`${card} flex flex-col gap-2.5 p-4`}>
            <h3 className="text-base font-bold">Permisos</h3>
            <Button icon={user.role === 'admin' ? ShieldOff : ShieldCheck} loading={busy === 'role'} onClick={() => patch('role', { role: user.role === 'admin' ? 'user' : 'admin' }, user.role === 'admin' ? 'Ya no es administrador.' : 'Ahora es administrador.')}>
              {user.role === 'admin' ? 'Quitar administrador' : 'Hacer administrador'}
            </Button>
            <Button variant={user.banned ? 'secondary' : 'danger'} icon={user.banned ? UserCheck : UserX} loading={busy === 'ban'} onClick={() => patch('ban', { banned: !user.banned }, user.banned ? 'Cuenta desbloqueada.' : 'Cuenta bloqueada.')}>
              {user.banned ? 'Desbloquear cuenta' : 'Bloquear cuenta'}
            </Button>
          </section>

          <section className="flex flex-col gap-2.5 rounded-3xl border border-red-200 bg-white p-4">
            <h3 className="text-base font-bold text-red-700">Borrar cuenta</h3>
            <p className="text-sm text-ink/65">Se elimina la cuenta y sus datos. No se puede deshacer. Escribe <b className="break-all">{user.email}</b> para confirmar.</p>
            <input type="email" aria-label="Correo para confirmar" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={user.email} autoComplete="off" />
            <Button variant="danger" icon={Trash2} loading={busy === 'delete'} disabled={confirm.trim().toLowerCase() !== user.email.toLowerCase()} onClick={remove}>Borrar para siempre</Button>
          </section>
        </div>
      </div>
    </div>
  )
}

export default function Users() {
  const { user: me } = useAuth()
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string>()
  const [flash, setFlash] = useState<string>()

  useEffect(() => {
    const t = setTimeout(() => { setSearch(input.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [input])

  const { data, error, loading, reload, setData } = useApi<Page>(`/api/admin/users?search=${encodeURIComponent(search)}&page=${page}&pageSize=${PAGE_SIZE}`)
  const selected = data?.items.find((u) => u.id === selectedId)
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const onChanged = (u: AdminUser) => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === u.id ? u : x)) }))
  const onDeleted = (u: AdminUser) => {
    setSelectedId(undefined)
    setFlash(`Se borró la cuenta de ${u.email}.`)
    reload()
  }

  return (
    <>
      <PageHead title="Usuarios" hint={data ? `${data.total.toLocaleString('es-ES')} ${data.total === 1 ? 'cuenta' : 'cuentas'}` : undefined} />
      {flash && <Notice kind="success" className="mb-3" onClose={() => setFlash(undefined)}>{flash}</Notice>}
      <div className="relative mb-4">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40" aria-hidden />
        <input type="search" aria-label="Buscar usuarios" placeholder="Buscar por correo o nombre…" value={input} onChange={(e) => setInput(e.target.value)} className="w-full !pl-10" />
      </div>

      {error && !data ? <ErrorBox error={error} onRetry={reload} /> : !data ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <>
          {error && <Notice kind="error" className="mb-3" action={{ label: 'Reintentar', onClick: reload }}>{error.message}</Notice>}
          {data.items.length === 0 ? (
            <Empty icon={<UsersIcon size={22} />}>{search ? <>Ningún usuario coincide con «{search}».</> : 'Todavía no hay usuarios.'}</Empty>
          ) : (
            <div className={loading ? 'opacity-60 transition' : 'transition'}>
              <div className={`${card} hidden overflow-hidden md:block`}>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-paper/60 text-xs uppercase tracking-wide text-ink/50">
                    <tr><th className="px-4 py-3 font-semibold">Usuario</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 font-semibold">Alta</th><th className="px-4 py-3 font-semibold">Visto</th><th /></tr>
                  </thead>
                  <tbody>
                    {data.items.map((u) => (
                      <tr key={u.id} className="border-b border-line/70 last:border-0 hover:bg-paper/50">
                        <td className="max-w-[16rem] px-4 py-3"><p className="truncate font-semibold">{nameOf(u)}</p><p className="truncate text-xs text-ink/55">{u.email}</p></td>
                        <td className="px-4 py-3"><Chips u={u} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink/65">{shortDate(u.created_at)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink/65">{relative(u.last_seen_at)}</td>
                        <td className="px-4 py-3 text-right"><Button size="sm" onClick={() => setSelectedId(u.id)}>Gestionar</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col gap-2.5 md:hidden">
                {data.items.map((u) => (
                  <li key={u.id}>
                    <button onClick={() => setSelectedId(u.id)} className={`${card} flex w-full flex-col gap-2 p-4 text-left transition hover:border-brand`}>
                      <span className="min-w-0"><span className="block truncate font-semibold">{nameOf(u)}</span><span className="block truncate text-xs text-ink/55">{u.email}</span></span>
                      <Chips u={u} />
                      <span className="text-xs text-ink/50">Alta {shortDate(u.created_at)} · Visto {relative(u.last_seen_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pages > 1 && <PagePager className="mt-5" page={page} total={pages} onChange={setPage} />}
        </>
      )}
      {selected && <UserPanel key={selected.id} user={selected} isSelf={selected.email === me?.email} onClose={() => setSelectedId(undefined)} onChanged={onChanged} onDeleted={onDeleted} />}
    </>
  )
}
