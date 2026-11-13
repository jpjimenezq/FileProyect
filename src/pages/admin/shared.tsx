import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, apiJson } from '../../lib/api'
import { Notice } from '../../components/ui'
import { cx } from '../../components/ui/cx'

/** GET JSON con estados de carga y error; conserva los datos anteriores mientras llegan los nuevos */
export function useApi<T>(url: string) {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ data: s.data, loading: true }))
    apiJson<T>('GET', url).then(
      (data) => alive && setState({ data, loading: false }),
      (e) => alive && setState((s) => ({ data: s.data, error: e instanceof ApiError ? e : new ApiError('Error inesperado.'), loading: false })),
    )
    return () => { alive = false }
  }, [url, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((fn: (d: T) => T) => setState((s) => (s.data ? { ...s, data: fn(s.data) } : s)), [])
  return { ...state, reload, setData }
}

/** Error de una pantalla del panel, con «Reintentar» (y explicación si el servidor no usa Supabase) */
export function ErrorBox({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.status === 404 && /supabase/i.test(error.message)) {
    return <Notice kind="warn">El panel necesita que el servidor funcione con Supabase. Configura <code>SUPABASE_URL</code> y <code>SUPABASE_SERVICE_ROLE_KEY</code> y reinícialo.</Notice>
  }
  return <Notice kind="error" action={{ label: 'Reintentar', onClick: onRetry }}>{error.message}</Notice>
}

export const card = 'rounded-3xl border border-line bg-white'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-xl bg-ink/[0.06]', className)} />
}

type Tone = 'brand' | 'lime' | 'red' | 'amber' | 'ink' | 'green'
const TONES: Record<Tone, string> = {
  brand: 'bg-brand/10 text-brand',
  lime: 'bg-lime/60 text-ink',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-800',
  green: 'bg-emerald-50 text-emerald-800',
  ink: 'bg-ink/[0.07] text-ink/70',
}

export function Chip({ tone = 'ink', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone])}>{children}</span>
}

export function PageHead({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {hint && <p className="mt-1 text-sm text-ink/60">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className={cx(card, 'flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-ink/60')}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-paper text-ink/40">{icon}</span>
      {children}
    </div>
  )
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
/** «hace 3 horas», «ayer»… */
export function relative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—'
  const diff = (Date.parse(iso) - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return 'ahora mismo'
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['minute', 60], ['hour', 3600], ['day', 86400], ['month', 2592000], ['year', 31536000]]
  let best = units[0]
  for (const u of units) if (abs >= u[1]) best = u
  return rtf.format(Math.round(diff / best[1]), best[0])
}

export const fullDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** «2026-12-31» del campo de fecha → final de ese día en ISO (hora local) */
export const endOfDayIso = (ymd: string) => new Date(`${ymd}T23:59:59`).toISOString()
export const toYmd = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const todayYmd = () => toYmd(new Date().toISOString())
