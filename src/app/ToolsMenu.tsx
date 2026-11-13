import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, ChevronDown, LayoutGrid } from 'lucide-react'
import { categories, tools } from '../tools/catalog'
import { ToolIcon } from './ToolIcon'

/**
 * Menú de herramientas: categorías a la izquierda y, al elegir una, sus herramientas a la derecha.
 * En móvil las categorías pasan a una fila deslizable sobre la lista.
 */
export function ToolsMenu() {
  const [open, setOpen] = useState(false)
  const [cat, setCat] = useState(categories[0].id)
  const root = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const current = categories.find((c) => c.id === cat)!
  const list = tools.filter((t) => t.category === cat)

  return (
    <div ref={root}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold hover:bg-ink/5 ${open ? 'bg-ink/5' : ''}`}
      >
        <LayoutGrid size={16} /> <span className="hidden sm:inline">Herramientas</span>
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="fixed inset-x-0 top-16 z-50 px-3 pt-2 sm:px-4">
          <div className="mx-auto max-h-[calc(100vh-5.5rem)] max-w-5xl overflow-hidden overflow-y-auto rounded-3xl border border-line bg-white shadow-2xl shadow-ink/15 lg:grid lg:grid-cols-[15rem_1fr] lg:overflow-visible">
            <div className="flex gap-1.5 overflow-x-auto border-b border-line bg-paper p-3 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:p-4" role="tablist" aria-label="Categorías">
              {categories.map((c) => {
                const on = c.id === cat
                const n = tools.filter((t) => t.category === c.id).length
                return (
                  <button
                    key={c.id}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setCat(c.id)}
                    onMouseEnter={() => setCat(c.id)}
                    className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${on ? 'bg-white shadow-sm' : 'text-ink/65 hover:bg-white/70'}`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="whitespace-nowrap">{c.name}</span>
                    <span className="ml-auto hidden text-xs font-medium text-ink/35 lg:block">{n}</span>
                  </button>
                )
              })}
              <Link to="/#herramientas" className="mt-auto hidden items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand hover:bg-white/70 lg:flex">
                Ver todas <ArrowRight size={14} />
              </Link>
            </div>

            <div className="p-4 lg:p-6">
              <p className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
                <span className="h-3 w-3 rounded-full" style={{ background: current.color }} /> {current.name}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {list.map((t) => (
                  <Link key={t.id} to={t.path} className="flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-brand/10">
                    <ToolIcon tool={t} size={42} />
                    <span className="min-w-0">
                      <span className="block font-semibold leading-tight">{t.name}</span>
                      <span className="block line-clamp-2 text-[13px] leading-snug text-ink/55">{t.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
