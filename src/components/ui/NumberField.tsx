import { useId } from 'react'
import { Minus, Plus } from 'lucide-react'

interface Props {
  value: number
  onChange: (v: number) => void
  label?: string
  /** Texto de accesibilidad cuando no hay label visible */
  ariaLabel?: string
  min?: number
  max?: number
  step?: number
  /** Unidad que se muestra dentro del campo: "pt", "%", "mm"… */
  unit?: string
  disabled?: boolean
  className?: string
}

const clamp = (v: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
/** Evita colas como 0.30000000000000004 al sumar pasos decimales */
const tidy = (v: number) => Number(v.toFixed(6))

/** Campo numérico con botones − / + y unidad opcional; siempre entrega un número dentro de min–max */
export function NumberField({ value, onChange, label, ariaLabel, min, max, step = 1, unit, disabled, className }: Props) {
  const id = useId()
  const bump = (dir: 1 | -1) => onChange(clamp(tidy(value + dir * step), min, max))
  const btn = 'flex w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink/70 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink/70'
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      {label && <label htmlFor={id} className="text-sm font-semibold">{label}</label>}
      <div className="flex h-10 items-stretch gap-1.5">
        <button type="button" className={btn} aria-label="Disminuir" disabled={disabled || (min !== undefined && value <= min)} onClick={() => bump(-1)}><Minus size={16} /></button>
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            aria-label={label ? undefined : ariaLabel}
            value={Number.isFinite(value) ? value : ''}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => { const n = e.target.valueAsNumber; if (!Number.isNaN(n)) onChange(n) }}
            onBlur={(e) => { const n = e.target.valueAsNumber; onChange(clamp(Number.isNaN(n) ? (min ?? 0) : n, min, max)) }}
            className={`h-full w-full text-center ${unit ? 'pr-8' : ''}`}
          />
          {unit && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-ink/50">{unit}</span>}
        </div>
        <button type="button" className={btn} aria-label="Aumentar" disabled={disabled || (max !== undefined && value >= max)} onClick={() => bump(1)}><Plus size={16} /></button>
      </div>
    </div>
  )
}
