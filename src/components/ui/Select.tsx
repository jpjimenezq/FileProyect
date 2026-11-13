import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { cx } from './cx'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Texto de la etiqueta; si falta, pasa aria-label */
  label?: string
  /** Frase de ayuda bajo el selector */
  hint?: string
  /** Las <option> */
  children: ReactNode
}

/** Selector nativo con el estilo de la marca (la flecha y el borde vienen de index.css) */
export function Select({ label, hint, className, id, children, ...rest }: Props) {
  const auto = useId()
  const sid = id ?? auto
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={sid} className="text-sm font-semibold">{label}</label>}
      <select id={sid} className={cx('w-full', className)} aria-describedby={hint ? `${sid}-hint` : undefined} {...rest}>{children}</select>
      {hint && <p id={`${sid}-hint`} className="text-xs text-ink/55">{hint}</p>}
    </div>
  )
}
