import { Link, NavLink, Outlet } from 'react-router-dom'
import { History, LayoutDashboard, LockKeyhole, ShieldAlert, Ticket, Users } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { Button, Notice } from '../../components/ui'
import { Skeleton, card } from './shared'

const NAV = [
  { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { to: '/admin/codigos', label: 'Códigos', icon: Ticket },
  { to: '/admin/actividad', label: 'Actividad', icon: History },
]

function Gate({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className={`${card} flex flex-col items-center gap-3 p-8 text-center`}>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">{icon}</span>
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="text-sm text-ink/65">{children}</div>
      </div>
    </div>
  )
}

/** Marco del panel: comprueba la sesión y el rol y pone la navegación (lateral en escritorio, pestañas en móvil) */
export function AdminLayout() {
  const { me, user, isAdmin, supabaseOn, offline } = useAuth()

  if (!me && !offline) return <div className="mx-auto max-w-6xl px-4 py-10"><Skeleton className="mb-4 h-9 w-56" /><Skeleton className="h-64 w-full" /></div>
  if (!user) {
    return (
      <Gate icon={<LockKeyhole size={26} />} title="Panel de administración">
        <p className="mb-5">Inicia sesión con una cuenta de administrador para entrar.</p>
        <Link to="/cuenta"><Button variant="primary">Entrar</Button></Link>
      </Gate>
    )
  }
  if (!isAdmin) {
    return (
      <Gate icon={<ShieldAlert size={26} />} title="No tienes acceso">
        <p className="mb-5">Esta zona es solo para administradores.</p>
        <Link to="/"><Button>Volver al inicio</Button></Link>
      </Gate>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="grid gap-6 lg:grid-cols-[13rem_1fr] lg:gap-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 hidden items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink/45 lg:flex" style={{ fontFamily: 'var(--font-display)' }}><ShieldAlert size={14} /> Administración</p>
          <nav aria-label="Administración" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition lg:rounded-xl ${isActive ? 'bg-ink text-white' : 'bg-white text-ink/70 ring-1 ring-line hover:text-ink hover:ring-brand lg:bg-transparent lg:ring-0 lg:hover:bg-ink/5'}`}
              >
                <Icon size={16} aria-hidden /> {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          {!supabaseOn && <Notice kind="warn" className="mb-4">El panel necesita que la web y el servidor funcionen con Supabase (variables <code>VITE_SUPABASE_*</code> y <code>SUPABASE_*</code>).</Notice>}
          {offline && <Notice kind="error" className="mb-4">No se pudo conectar con el servidor.</Notice>}
          <Outlet />
        </div>
      </div>
    </div>
  )
}
