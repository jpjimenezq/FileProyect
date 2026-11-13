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
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label={label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length > 4 ? 3 : options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const on = o.value === value
          const Icon = o.icon
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 px-1 py-2 text-center text-[13px] font-medium leading-tight transition ${on ? 'border-brand bg-white text-brand shadow-sm' : 'border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {Icon && <Icon size={20} strokeWidth={1.8} />}
              {o.label}
            </button>
          )
        })}
      </div>
      {current?.desc && <p className="text-xs leading-snug text-gray-500">{current.desc}</p>}
    </div>
  )
}
