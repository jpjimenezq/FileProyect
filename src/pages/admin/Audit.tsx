import { useState } from 'react'
import { ChevronDown, History } from 'lucide-react'
import { PagePager } from '../../components/ui'
import { Empty, ErrorBox, PageHead, Skeleton, card, fullDate, relative, shortDate, useApi } from './shared'

interface Entry { id?: number; actor_email: string | null; action: string; target: string | null; data: Record<string, unknown> | null; created_at: string }
interface Page { items: Entry[]; page: number; pageSize: number; total: number }

const who = (e: Entry) => (e.actor_email?.startsWith('script') ? 'Un script' : (e.actor_email ?? 'Alguien').split('@')[0])

/** Frase en español para cada acción del registro */
function describe(e: Entry): { who: string; text: string } {
  const d = (e.data ?? {}) as Record<string, unknown>
  const email = String(d.email ?? 'un usuario')
  const code = String(d.code ?? 'un código')
  const ch = (d.changes ?? {}) as Record<string, unknown>
  const parts: string[] = []
  if (e.action === 'user.update') {
    if (ch.plan === 'pro') parts.push(`dio Pro a ${email}${typeof ch.plan_until === 'string' ? ` hasta el ${shortDate(ch.plan_until)}` : ''}`)
    else if (ch.plan === 'free') parts.push(`pasó a ${email} al plan Gratis`)
    else if ('plan_until' in ch) parts.push(ch.plan_until ? `cambió a ${shortDate(String(ch.plan_until))} el fin de Pro de ${email}` : `quitó la fecha de fin de Pro a ${email}`)
    if (ch.role === 'admin') parts.push(`hizo administrador a ${email}`)
    if (ch.role === 'user') parts.push(`quitó el rol de administrador a ${email}`)
    if (ch.banned === true) parts.push(`bloqueó a ${email}`)
    if (ch.banned === false) parts.push(`desbloqueó a ${email}`)
    if ('full_name' in ch) parts.push(`cambió el nombre de ${email}`)
    return { who: who(e), text: parts.join(' y ') || `modificó a ${email}` }
  }
  if (e.action === 'user.grant_admin') return { who: who(e), text: `hizo administrador a ${email}` }
  if (e.action === 'user.revoke_admin') return { who: who(e), text: `quitó el rol de administrador a ${email}` }
  if (e.action === 'user.delete') return { who: who(e), text: `borró la cuenta de ${email}` }
  if (e.action === 'discount.create') return { who: who(e), text: `creó el código ${code}` }
  if (e.action === 'discount.update') {
    if (ch.active === true) return { who: who(e), text: `activó el código ${code}` }
    if (ch.active === false) return { who: who(e), text: `desactivó el código ${code}` }
    return { who: who(e), text: `editó el código ${code}` }
  }
  return { who: who(e), text: e.action }
}

function Item({ e }: { e: Entry }) {
  const [open, setOpen] = useState(false)
  const { who: w, text } = describe(e)
  const hasData = e.data && Object.keys(e.data).length > 0
  return (
    <li className={`${card} p-4`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-lime">{w[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm"><b>{w}</b> {text}</p>
          <p className="text-xs text-ink/50" title={fullDate(e.created_at)}>{relative(e.created_at)}</p>
        </div>
        {hasData && (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Ver detalle" className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5">
            <ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {open && <pre className="mt-3 overflow-x-auto rounded-xl bg-paper p-3 text-xs leading-relaxed">{JSON.stringify({ accion: e.action, objetivo: e.target, fecha: fullDate(e.created_at), datos: e.data }, null, 2)}</pre>}
    </li>
  )
}

export default function Audit() {
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useApi<Page>(`/api/admin/audit?page=${page}`)
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  return (
    <>
      <PageHead title="Actividad" hint="Lo que han hecho los administradores, lo último primero." />
      {error && !data ? <ErrorBox error={error} onRetry={reload} /> : !data ? (
        <div className="flex flex-col gap-2.5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : data.items.length === 0 ? (
        <Empty icon={<History size={22} />}>Todavía no hay actividad.</Empty>
      ) : (
        <>
          <ul className={`flex flex-col gap-2.5 ${loading ? 'opacity-60' : ''}`}>{data.items.map((e, i) => <Item key={e.id ?? `${e.created_at}-${i}`} e={e} />)}</ul>
          {pages > 1 && <PagePager className="mt-5" page={page} total={pages} onChange={setPage} />}
        </>
      )}
    </>
  )
}
