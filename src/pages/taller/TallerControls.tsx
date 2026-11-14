import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { ColorField } from '../../components/ui'

/** Cierra un desplegable con Escape o al hacer clic fuera */
function useDismiss(open: boolean, close: () => void, box: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open, close, box])
}

export interface MiniOption<T extends string | number> { value: T; label: string }

/** Lista desplegable compacta (32 px; 40 px en táctil) con teclado: ↑ ↓ Inicio Fin Intro Esc */
export function MiniSelect<T extends string | number>({ label, value, options, onChange, className = 'w-28', placeholder }: {
  label: string; value: T | undefined; options: MiniOption<T>[]; onChange: (v: T) => void; className?: string; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const close = () => setOpen(false)
  useDismiss(open, close, box)

  const selected = options.findIndex((o) => o.value === value)
  const show = (i: number) => { setActive(i); list.current?.children[i]?.scrollIntoView({ block: 'nearest' }) }
  const openList = () => { setActive(Math.max(0, selected)); setOpen(true) }
  const pick = (i: number) => { onChange(options[i].value); setOpen(false) }

  // al abrir, deja a la vista la opción elegida
  useEffect(() => { if (open) list.current?.children[Math.max(0, selected)]?.scrollIntoView({ block: 'nearest' }) }, [open, selected])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') { close(); return }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList() }
      return
    }
    const last = options.length - 1
    if (e.key === 'ArrowDown') { e.preventDefault(); show(Math.min(active + 1, last)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); show(Math.max(active - 1, 0)) }
    else if (e.key === 'Home') { e.preventDefault(); show(0) }
    else if (e.key === 'End') { e.preventDefault(); show(last) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active) }
  }

  const text = options[selected]?.label ?? placeholder ?? ''
  return (
    <div ref={box} className="relative">
      <button type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-label={label} aria-controls={open ? `${label}-lista` : undefined}
        aria-activedescendant={open ? `${label}-op${active}` : undefined}
        onClick={() => (open ? close() : openList())} onKeyDown={onKey} onBlur={close}
        className={`flex h-8 items-center justify-between gap-1 rounded-lg border border-line bg-white px-2.5 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-10 ${className}`}>
        <span className="truncate">{text}</span>
        <ChevronDown size={14} className="shrink-0 text-ink/50" />
      </button>
      {open && (
        <ul ref={list} id={`${label}-lista`} role="listbox" aria-label={label} className="thin-scroll absolute left-0 top-full z-50 mt-1.5 max-h-72 min-w-full w-max overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-xl">
          {options.map((o, i) => (
            <li key={String(o.value)} id={`${label}-op${i}`} role="option" aria-selected={i === selected}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm pointer-coarse:py-2.5 ${i === selected ? 'font-semibold text-brand' : ''} ${i === active ? 'bg-brand/10' : ''}`}>
              {o.label}{i === selected && <Check size={15} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Botón de color con una pequeña ventana: paleta, «Otro» y, si hace falta, quitar el color */
export function ColorPopover({ title, icon, value, palette, onPick, onClear, clearLabel = 'Quitar color' }: {
  title: string; icon: ReactNode; value: string; palette?: readonly string[]; onPick: (hex: string) => void; onClear?: () => void; clearLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)
  const pop = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), box)
  // si la ventana se saldría por la derecha, se desplaza hacia la izquierda lo justo
  useLayoutEffect(() => {
    if (!open || !box.current) return
    const left = box.current.getBoundingClientRect().left
    const w = pop.current?.offsetWidth ?? 256
    setShift(Math.max(-left + 8, Math.min(0, document.documentElement.clientWidth - 8 - (left + w))))
  }, [open])
  return (
    <div ref={box} className="relative">
      <button type="button" title={title} aria-label={title} aria-haspopup="dialog" aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}
        className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-sm transition pointer-coarse:h-10 pointer-coarse:min-w-10 ${open ? 'bg-ink/10' : 'hover:bg-ink/10'}`}>
        {icon}
      </button>
      {open && (
        <div ref={pop} role="dialog" aria-label={title} onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault() }}
          className={`absolute top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-white p-3 shadow-xl`} style={{ left: shift }}>
          <ColorField label={title} value={value} palette={palette} onChange={(c) => { onPick(c) }} />
          {onClear && (
            <button type="button" onClick={() => { onClear(); setOpen(false) }} className="mt-2.5 w-full rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:border-brand hover:text-brand pointer-coarse:py-2.5">{clearLabel}</button>
          )}
        </div>
      )}
    </div>
  )
}
