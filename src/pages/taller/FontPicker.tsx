import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { FONT_GROUPS } from '../../lib/doc/fonts'

/** Selector de letra con buscador; cada nombre se muestra con su propia letra */
export function FontPicker({ value, onPick }: { value: string; onPick: (font: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase()
    return FONT_GROUPS.map(([g, list]) => [g, list.filter((f) => f.toLowerCase().includes(t))] as const).filter(([, l]) => l.length)
  }, [q])

  const pick = (f: string) => { onPick(f); setOpen(false); setQ('') }

  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="Tipo de letra" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-44 items-center justify-between gap-1 rounded-lg border border-line bg-white px-2.5 text-sm hover:border-brand">
        <span className="truncate" style={{ fontFamily: value || 'Arial' }}>{value || 'Arial'}</span>
        <ChevronDown size={14} className="shrink-0 text-ink/50" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          <label className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Search size={15} className="text-ink/40" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar entre ${FONT_GROUPS.reduce((n, [, l]) => n + l.length, 0)} tipos de letra…`} className="min-w-0 flex-1 text-sm outline-none" />
          </label>
          <div role="listbox" aria-label="Tipos de letra" className="thin-scroll max-h-80 overflow-y-auto py-1">
            {!groups.length && <p className="px-4 py-6 text-center text-sm text-ink/50">No hay ninguna con ese nombre.</p>}
            {groups.map(([group, list]) => (
              <div key={group}>
                <p className="sticky top-0 bg-paper/95 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">{group}</p>
                {list.map((f) => (
                  <button key={f} role="option" aria-selected={f === value} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(f)}
                    style={{ fontFamily: f, contentVisibility: 'auto', containIntrinsicSize: '0 36px' }}
                    className={`block w-full truncate px-4 py-2 text-left text-base hover:bg-brand/10 ${f === value ? 'bg-brand/10 text-brand' : ''}`}>{f}</button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
