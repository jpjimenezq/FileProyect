import { useId } from 'react'
import type { ReactNode } from 'react'
import { cx } from './cx'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  /** Frase explicativa bajo la etiqueta */
  description?: string
  disabled?: boolean
  className?: string
}

/** Casilla con etiqueta (clicable) y descripción opcional */
export function Checkbox({ checked, onChange, label, description, disabled, className }: Props) {
  const id = useId()
  return (
    <div className={cx('flex items-start gap-2.5 text-sm pointer-coarse:min-h-10', className)}>
      <input id={id} type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} aria-describedby={description ? `${id}-d` : undefined} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className={cx('flex flex-col', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
        <span className="font-medium">{label}</span>
        {description && <span id={`${id}-d`} className="text-xs text-ink/55">{description}</span>}
      </label>
    </div>
  )
}

/** Interruptor on/off (role="switch") con etiqueta y descripción opcional */
export function Switch({ checked, onChange, label, description, disabled, className }: Props) {
  const id = useId()
  return (
    <div className={cx('flex items-start justify-between gap-3 text-sm pointer-coarse:min-h-10', className)}>
      <label htmlFor={id} className={cx('flex flex-col', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
        <span className="font-medium">{label}</span>
        {description && <span id={`${id}-d`} className="text-xs text-ink/55">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-brand' : 'bg-ink/20')}
      >
        <span aria-hidden className={cx('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}
