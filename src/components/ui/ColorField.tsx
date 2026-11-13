import { useEffect, useId, useState } from 'react'
import { cx } from './cx'

/** Colores frecuentes en marcas de agua, sellos y anotaciones */
export const COMMON_COLORS = ['#16152b', '#e11d48', '#f97316', '#eab308', '#16a34a', '#0ea5e9', '#5b4bff', '#9ca3af'] as const

interface Props {
  value: string
  onChange: (hex: string) => void
  label?: string
  /** Paleta propia; por defecto, COMMON_COLORS. Pasa [] para ocultarla */
  palette?: readonly string[]
  disabled?: boolean
}

const HEX = /^#[0-9a-f]{6}$/i

/** Color con muestra, valor hex editable y paleta rápida */
export function ColorField({ value, onChange, label, palette = COMMON_COLORS, disabled }: Props) {
  const id = useId()
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = (raw: string) => {
    const t = (raw.startsWith('#') ? raw : `#${raw}`).toLowerCase()
    if (HEX.test(t)) onChange(t)
    else setText(value)
  }
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={`${id}-hex`} className="text-sm font-semibold">{label}</label>}
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label ? `${label}: elegir color` : 'Elegir color'} value={HEX.test(value) ? value : '#000000'} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="shrink-0" />
        <input
          id={`${id}-hex`}
          type="text"
          value={text}
          maxLength={7}
          spellCheck={false}
          disabled={disabled}
          aria-label={label ? undefined : 'Color en hexadecimal'}
          onChange={(e) => { setText(e.target.value); if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase()) }}
          onBlur={(e) => commit(e.target.value)}
          className="min-w-0 flex-1 font-mono uppercase"
        />
      </div>
      {palette.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colores frecuentes">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              aria-label={`Color ${c}`}
              aria-pressed={value.toLowerCase() === c}
              onClick={() => onChange(c)}
              style={{ background: c }}
              className={cx('h-6 w-6 rounded-full border border-ink/15 transition hover:scale-110 pointer-coarse:h-8 pointer-coarse:w-8', value.toLowerCase() === c && 'ring-2 ring-brand ring-offset-2')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
