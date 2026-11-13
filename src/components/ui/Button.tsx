import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cx } from './cx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-sm shadow-brand/30 hover:bg-brand-dark',
  secondary: 'border border-line bg-white text-ink hover:border-brand hover:text-brand',
  ghost: 'text-ink/70 hover:bg-ink/5 hover:text-ink',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
}

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant
  size?: 'sm' | 'md'
  /** Icono de lucide a la izquierda del texto */
  icon?: LucideIcon
  /** Muestra un indicador de carga y bloquea el botón */
  loading?: boolean
  children?: ReactNode
}

/** Botón común de las herramientas */
export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, disabled, className, children, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
        size === 'sm' ? 'min-h-8 px-3 text-sm pointer-coarse:min-h-10' : 'min-h-10 px-4 py-2 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : Icon && <Icon size={16} aria-hidden />}
      {children}
    </button>
  )
}
