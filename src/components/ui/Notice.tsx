import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cx } from './cx'

type Kind = 'info' | 'warn' | 'error' | 'success'

const KINDS: Record<Kind, { icon: LucideIcon; box: string; role: 'alert' | 'status' }> = {
  info: { icon: Info, box: 'border-brand/20 bg-brand/5 text-ink [&_svg]:text-brand', role: 'status' },
  warn: { icon: AlertTriangle, box: 'border-amber-200 bg-amber-50 text-amber-900 [&_svg]:text-amber-600', role: 'status' },
  error: { icon: XCircle, box: 'border-red-200 bg-red-50 text-red-800 [&_svg]:text-red-600', role: 'alert' },
  success: { icon: CheckCircle2, box: 'border-emerald-200 bg-emerald-50 text-emerald-900 [&_svg]:text-emerald-600', role: 'status' },
}

interface Props {
  kind?: Kind
  children: ReactNode
  /** Acción opcional a la derecha del texto (p. ej. «Reintentar») */
  action?: { label: string; onClick: () => void }
  /** Si se pasa, aparece el botón de cerrar */
  onClose?: () => void
  className?: string
}

/** Aviso corto con icono: información, aviso, error o éxito */
export function Notice({ kind = 'info', children, action, onClose, className }: Props) {
  const k = KINDS[kind]
  const Icon = k.icon
  return (
    <div role={k.role} className={cx('flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-sm leading-snug', k.box, className)}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action && (
        <button type="button" onClick={action.onClick} className="shrink-0 rounded-lg px-2 py-0.5 font-semibold underline-offset-2 hover:underline">
          {action.label}
        </button>
      )}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="-m-1.5 shrink-0 rounded-full p-1.5 opacity-60 transition hover:bg-ink/5 hover:opacity-100">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
