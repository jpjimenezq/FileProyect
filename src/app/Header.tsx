import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, Search, UserRound, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Logo } from './Logo'
import { useOpenPalette } from './Palette'
import { ToolsMenu } from './ToolsMenu'

const navLink = ({ isActive }: { isActive: boolean }) => `rounded-full px-3.5 py-2 text-sm font-semibold hover:bg-ink/5 ${isActive ? 'bg-ink/5 text-brand' : ''}`

/** En pantallas pequeñas, Taller, Precios y la cuenta van en un menú desplegable */
function MobileMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  const item = 'flex items-center rounded-xl px-4 py-3 text-base font-semibold hover:bg-ink/5'
  return (
    <div ref={box} className="sm:hidden">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Cerrar el menú' : 'Abrir el menú'} className="rounded-full p-2 hover:bg-ink/5">{open ? <X size={20} /> : <Menu size={20} />}</button>
      {open && (
        <div className="fixed inset-x-0 top-16 z-50 px-3 pt-2">
          <nav aria-label="Menú" className="mx-auto flex max-w-md flex-col rounded-3xl border border-line bg-white p-2 shadow-2xl shadow-ink/15">
            <Link to="/taller" className={item}>Taller</Link>
            <Link to="/precios" className={item}>Precios</Link>
            <Link to="/cuenta" className={item}>{signedIn ? 'Mi cuenta' : 'Entrar'}</Link>
          </nav>
        </div>
      )}
    </div>
  )
}

export function Header() {
  const { me } = useAuth()
  const openPalette = useOpenPalette()
  const user = me?.user

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <Link to="/" aria-label="FileProyect, inicio"><Logo /></Link>

        <button
          onClick={openPalette}
          className="ml-2 hidden flex-1 items-center gap-3 rounded-full border border-line bg-white px-4 py-2 text-left text-sm text-ink/50 shadow-sm transition hover:border-brand lg:flex lg:max-w-md"
        >
          <Search size={16} />
          <span className="flex-1">Buscar herramienta…</span>
          <kbd className="rounded-md border border-line px-1.5 py-0.5 text-xs">Ctrl K</kbd>
        </button>

        <nav className="ml-auto flex items-center gap-0.5 sm:gap-1" aria-label="Principal">
          <button onClick={openPalette} className="rounded-full p-2 hover:bg-ink/5 sm:p-2.5 lg:hidden" aria-label="Buscar herramienta"><Search size={20} /></button>
          <ToolsMenu />
          <NavLink to="/taller" className={(s) => `hidden sm:block ${navLink(s)}`}>Taller</NavLink>
          <NavLink to="/precios" className={(s) => `hidden sm:block ${navLink(s)}`}>Precios</NavLink>
          <MobileMenu signedIn={!!user} />
          {user ? (
            <Link to="/cuenta" className="ml-1 flex items-center gap-2 rounded-full bg-ink py-1.5 pl-1.5 pr-4 text-sm font-semibold text-white hover:bg-brand">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lime text-xs font-bold text-ink">{user.email[0].toUpperCase()}</span>
              <span className="hidden sm:inline">{user.plan === 'pro' ? 'Pro' : 'Mi cuenta'}</span>
            </Link>
          ) : (
            <>
              <Link to="/cuenta" className="hidden rounded-full px-3.5 py-2 text-sm font-semibold hover:bg-ink/5 sm:block">Entrar</Link>
              <Link to="/cuenta?registro=1" className="ml-0.5 whitespace-nowrap rounded-full bg-ink px-3 py-2 text-sm sm:ml-1 sm:px-4 font-semibold text-white hover:bg-brand"><span className="hidden sm:inline">Crear cuenta</span><UserRound size={16} className="sm:hidden" /></Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
