import { useId, useRef } from 'react'
import { Pipette } from 'lucide-react'
import { cx } from './cx'

/** Colores frecuentes en marcas de agua, sellos y anotaciones */
export const COMMON_COLORS = ['#16152b', '#d32f2f', '#16a34a', '#2563eb', '#ffeb3b', '#ffffff'] as const

interface Props {
  value: string
  onChange: (hex: string) => void
  label?: string
  /** Paleta propia; por defecto, COMMON_COLORS */
  palette?: readonly string[]
  disabled?: boolean
}

const HEX = /^#[0-9a-f]{6}$/i

/** Fila de muestras + botón «Otro» que abre el selector del sistema (oculto) */
export function ColorField({ value, onChange, label, palette = COMMON_COLORS, disabled }: Props) {
  const id = useId()
  const native = useRef<HTMLInputElement>(null)
  const current = value.toLowerCase()
  const custom = !palette.some((c) => c.toLowerCase() === current)
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span id={`${id}-l`} className="text-sm font-semibold">{label}</span>}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={label ? `${id}-l` : undefined} aria-label={label ? undefined : 'Color'}>
        {palette.map((c) => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            aria-label={`Color ${c}`}
            aria-pressed={current === c.toLowerCase()}
            onClick={() => onChange(c)}
            style={{ background: c }}
            className={cx('h-8 w-8 rounded-full border border-ink/20 transition hover:scale-110 disabled:opacity-40 pointer-coarse:h-10 pointer-coarse:w-10', current === c.toLowerCase() && 'ring-2 ring-brand ring-offset-2')}
          />
        ))}
        {custom && HEX.test(value) && (
          <span aria-label={`Color elegido ${value}`} style={{ background: value }} className="h-8 w-8 rounded-full border border-ink/20 ring-2 ring-brand ring-offset-2 pointer-coarse:h-10 pointer-coarse:w-10" />
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => native.current?.click()}
          className="flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-sm font-medium transition hover:border-brand hover:text-brand disabled:opacity-40 pointer-coarse:min-h-10"
        >
          <Pipette size={14} aria-hidden /> Otro
        </button>
        <input
          ref={native}
          type="color"
          tabIndex={-1}
          aria-label={label ? `${label}: elegir otro color` : 'Elegir otro color'}
          value={HEX.test(value) ? value : '#000000'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
        />
      </div>
    </div>
  )
}
