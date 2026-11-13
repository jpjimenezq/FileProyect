import type { LucideIcon } from 'lucide-react'

export interface SegOption<T extends string | number> {
  value: T
  label: string
  icon?: LucideIcon
  /** Frase corta que se muestra bajo las pestañas cuando esta opción está elegida */
  desc?: string
}

/** Pestañas compactas (icono + nombre) con una sola línea de explicación debajo de la elegida */
export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; label?: string }) {
  const current = options.find((o) => o.value === value)
  // más de 4 opciones: filas de 3 centradas (5 = 3 + 2) para que ninguna quede descolocada
  const many = options.length > 4
  // flechas del teclado: cambian de opción como en cualquier grupo de radios
  const onKey = (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + dir + options.length) % options.length]
    onChange(next.value)
    ;(e.currentTarget.querySelectorAll('[role=radio]')[options.indexOf(next)] as HTMLElement | undefined)?.focus()
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label={label} onKeyDown={onKey} className={many ? 'flex flex-wrap justify-center gap-1.5' : 'grid gap-1.5'} style={many ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const on = o.value === value
          const Icon = o.icon
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || !current ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={`flex flex-col items-center justify-center gap-1 min-h-[3.25rem] min-w-0 break-words rounded-lg border-2 px-1.5 py-2 text-center text-[13px] font-medium leading-tight transition pointer-coarse:min-h-14 ${many ? 'basis-[calc((100%-0.75rem)/3)]' : ''} ${on ? 'border-brand bg-white text-brand shadow-sm' : 'border-transparent bg-paper text-ink/60 hover:bg-ink/5'}`}
            >
              {Icon && <Icon size={20} strokeWidth={1.8} />}
              {o.label}
            </button>
          )
        })}
      </div>
      {current?.desc && <p className="text-xs leading-snug text-ink/60">{current.desc}</p>}
    </div>
  )
}
