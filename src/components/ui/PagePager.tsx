import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from './cx'

interface Props {
  /** Página actual (empieza en 1) */
  page: number
  total: number
  onChange: (page: number) => void
  className?: string
}

const btn = 'flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-inherit'

/** «‹ Página 2 de 5 ›» con botones de 40 px */
export function PagePager({ page, total, onChange, className }: Props) {
  return (
    <nav aria-label="Páginas" className={cx('flex items-center justify-center gap-3', className)}>
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior"><ChevronLeft size={20} /></button>
      <span className="min-w-28 text-center text-sm font-medium tabular-nums" aria-live="polite">Página {page} de {total}</span>
      <button type="button" className={btn} disabled={page >= total} onClick={() => onChange(page + 1)} aria-label="Página siguiente"><ChevronRight size={20} /></button>
    </nav>
  )
}
