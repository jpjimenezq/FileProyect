import { useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props<T> {
  items: T[]
  keyOf: (item: T, index: number) => string | number
  onChange: (items: T[]) => void
  render: (item: T, index: number) => ReactNode
  /** Ancho mínimo de cada columna (por defecto 13rem) */
  minCol?: string
}

/** Dónde quedaría al soltar: una posición entre dos elementos (0 = al principio, n = al final) */
export function insertionIndex(overIndex: number, pointerX: number, rect: { left: number; width: number }) {
  return pointerX < rect.left + rect.width / 2 ? overIndex : overIndex + 1
}

/** Mueve el elemento `from` a la posición de inserción `at` (contada antes de quitarlo) */
export function moveTo<T>(items: T[], from: number, at: number): T[] {
  const to = at > from ? at - 1 : at
  if (to === from) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Marca del hueco donde caerá lo que se arrastra: una línea con puntas, centrada entre dos elementos (la rejilla separa 1rem) */
function DropMark({ side }: { side: 'left' | 'right' }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-y-3 z-20 w-[3px] animate-pulse rounded-full bg-gradient-to-b from-brand via-brand/70 to-brand ${side === 'left' ? '-left-2' : '-right-2'} ${side === 'left' ? '-translate-x-1/2' : 'translate-x-1/2'} shadow-[0_0_12px_2px_rgba(91,75,255,0.35)] before:absolute before:-top-1.5 before:left-1/2 before:h-3 before:w-3 before:-translate-x-1/2 before:rounded-full before:border-2 before:border-white before:bg-brand after:absolute after:-bottom-1.5 after:left-1/2 after:h-3 after:w-3 after:-translate-x-1/2 after:rounded-full after:border-2 after:border-white after:bg-brand`}
    />
  )
}

/** Rejilla reordenable con arrastrar y soltar: al arrastrar, una barra marca el hueco entre dos elementos donde caerá */
export function SortableGrid<T>({ items, keyOf, onChange, render, minCol = '13rem' }: Props<T>) {
  const [from, setFrom] = useState<number>()
  const [at, setAt] = useState<number>()

  const reset = () => { setFrom(undefined); setAt(undefined) }
  const drop = () => {
    if (from !== undefined && at !== undefined) onChange(moveTo(items, from, at))
    reset()
  }
  const over = (e: DragEvent<HTMLDivElement>, i: number) => {
    if (from === undefined) return
    e.preventDefault()
    setAt(insertionIndex(i, e.clientX, e.currentTarget.getBoundingClientRect()))
  }
  // si queda donde ya estaba no se muestra nada
  const noop = from !== undefined && at !== undefined && (at === from || at === from + 1)

  return (
    <div style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${minCol}, 100%), 1fr))` }} className="grid justify-items-center gap-4" onDrop={(e) => { e.preventDefault(); drop() }} onDragOver={(e) => { if (from !== undefined) e.preventDefault() }}>
      {items.map((item, i) => (
        <div
          key={keyOf(item, i)}
          draggable
          onDragStart={(e) => { setFrom(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }}
          onDragOver={(e) => over(e, i)}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop() }}
          onDragEnd={reset}
          className={`relative flex w-full cursor-grab justify-center rounded-lg p-1 transition-opacity ${from === i ? 'opacity-40' : ''}`}
        >
          {!noop && at === i && <DropMark side="left" />}
          {!noop && at === items.length && i === items.length - 1 && <DropMark side="right" />}
          {render(item, i)}
          {items.length > 1 && (
            <div className="absolute left-2 top-2 z-30 hidden gap-1 pointer-coarse:flex">
              <button type="button" aria-label="Mover antes" disabled={i === 0} onClick={() => onChange(moveTo(items, i, i - 1))} className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/80 text-white disabled:opacity-30"><ChevronLeft size={16} /></button>
              <button type="button" aria-label="Mover después" disabled={i === items.length - 1} onClick={() => onChange(moveTo(items, i, i + 2))} className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/80 text-white disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
