import { useEffect, useId, useRef } from 'react'
import { paintRange } from './useRangeFill'

interface Props {
  value: number
  onChange: (v: number) => void
  label: string
  min: number
  max: number
  step?: number
  /** Unidad tras el valor: "%", "pt"… */
  unit?: string
  /** Cómo se escribe el valor (por defecto, el número tal cual); útil para mostrar 0.5 como 50 % */
  format?: (v: number) => string
  disabled?: boolean
}

/** Deslizador con etiqueta y valor visible */
export function Slider({ value, onChange, label, min, max, step = 1, unit, format, disabled }: Props) {
  const id = useId()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) paintRange(ref.current) }, [value, min, max])
  const shown = format ? format(value) : String(value)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={id} className="font-semibold">{label}</label>
        <output htmlFor={id} className="tabular-nums text-ink/60">{shown}{unit ? ` ${unit}` : ''}</output>
      </div>
      <input
        ref={ref}
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={`${shown}${unit ? ` ${unit}` : ''}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
