import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { LANGUAGES } from '../../lib/doc/codeExtensions'

/** Lista desplegable de lenguajes del bloque de código */
export function LanguagePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  const current = LANGUAGES.find(([, id]) => id === value)?.[0] ?? 'Automático'

  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="Lenguaje del código" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 pointer-coarse:h-10 rounded-full bg-ink pl-3 pr-2 text-sm font-semibold text-white hover:bg-brand">
        {current}<ChevronDown size={14} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Lenguajes" className="thin-scroll absolute left-0 top-full z-50 mt-1.5 max-h-72 w-52 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-xl">
          {LANGUAGES.map(([name, id]) => (
            <li key={id} role="option" aria-selected={id === value}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(id); setOpen(false) }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${id === value ? 'bg-brand/10 font-semibold text-brand' : 'hover:bg-ink/5'}`}>
                {name}{id === value && <Check size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
