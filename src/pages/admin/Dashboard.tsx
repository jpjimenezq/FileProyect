import { Link } from 'react-router-dom'
import { Activity, Crown, Plus, Ticket, UserPlus, Users, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../../components/ui'
import { ErrorBox, PageHead, Skeleton, card, useApi } from './shared'

interface Stats { users: number; pro: number; new7d: number; activeCodes: number; jobsToday: number; activeToday: number }

const CARDS: { key: keyof Stats; label: string; icon: LucideIcon; tone: string }[] = [
  { key: 'users', label: 'Usuarios', icon: Users, tone: 'bg-brand/10 text-brand' },
  { key: 'pro', label: 'Usuarios Pro', icon: Crown, tone: 'bg-lime/60 text-ink' },
  { key: 'new7d', label: 'Nuevos (7 días)', icon: UserPlus, tone: 'bg-brand/10 text-brand' },
  { key: 'activeToday', label: 'Activos hoy', icon: Activity, tone: 'bg-emerald-50 text-emerald-700' },
  { key: 'jobsToday', label: 'Trabajos hoy', icon: Zap, tone: 'bg-amber-50 text-amber-700' },
  { key: 'activeCodes', label: 'Códigos activos', icon: Ticket, tone: 'bg-brand/10 text-brand' },
]

export default function Dashboard() {
  const { data, error, loading, reload } = useApi<Stats>('/api/admin/stats')
  return (
    <>
      <PageHead title="Resumen" hint="Cómo va FileProyect ahora mismo.">
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/codigos?nuevo=1"><Button variant="primary" icon={Plus}>Crear código</Button></Link>
          <Link to="/admin/usuarios"><Button icon={Users}>Ver usuarios</Button></Link>
        </div>
      </PageHead>
      {error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          {CARDS.map(({ key, label, icon: Icon, tone }) => (
            <div key={key} className={`${card} p-4 sm:p-5`}>
              <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={20} aria-hidden /></span>
              {loading && !data ? <Skeleton className="h-9 w-16" /> : <p className="font-display text-3xl font-bold tabular-nums sm:text-4xl" style={{ fontFamily: 'var(--font-display)' }}>{data?.[key].toLocaleString('es-ES')}</p>}
              <p className="mt-1 text-sm text-ink/60">{label}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
