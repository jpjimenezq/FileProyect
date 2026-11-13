import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PageCanvas } from './PageCanvas'

/** Botón pequeño de lupa que se muestra sobre una miniatura al pasar el ratón (no es un <button>: puede ir dentro de otros) */
export function ZoomButton({ onOpen, label = 'Ver en grande' }: { onOpen: () => void; label?: string }) {
  const open = (e: { preventDefault: () => void; stopPropagation: () => void }) => { e.preventDefault(); e.stopPropagation(); onOpen() }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      draggable={false}
      onClick={open}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(e) }}
      className="absolute bottom-1.5 right-1.5 z-10 flex h-7 w-7 cursor-zoom-in items-center justify-center rounded-full bg-ink/75 text-white opacity-0 shadow transition hover:bg-brand focus-visible:opacity-100 group-hover/zoom:opacity-100 pointer-coarse:opacity-100"
    >
      <Maximize2 size={14} />
    </span>
  )
}

/** Capa a pantalla completa (en el <body>, así no la afectan filas arrastrables ni transformaciones) */
function Overlay({ onClose, children, bar }: { onClose: () => void; children: ReactNode; bar: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return createPortal(
    <div role="dialog" aria-modal="true" className="thin-scroll fixed inset-0 z-[110] flex flex-col items-center overflow-auto bg-ink/80 p-4 backdrop-blur-sm" onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }} onClick={(e) => e.stopPropagation()}>
      {bar}
      {children}
    </div>,
    document.body,
  )
}

export function PdfLightbox({ pdf, page, onPage, onClose }: { pdf: PDFDocumentProxy; page: number; onPage: (n: number) => void; onClose: () => void }) {
  const numPages = pdf.numPages
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onPage(Math.min(numPages, page + 1))
      if (e.key === 'ArrowLeft') onPage(Math.max(1, page - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, numPages, onPage, onClose])

  return (
    <Overlay
      onClose={onClose}
      bar={
        <div className="mb-3 flex items-center gap-3 rounded-full bg-white px-3 py-1.5 text-sm shadow-lg">
          <button aria-label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-full p-1 hover:bg-ink/5 disabled:opacity-30"><ChevronLeft size={18} /></button>
          <span>Página {page} de {numPages}</span>
          <button aria-label="Página siguiente" disabled={page >= numPages} onClick={() => onPage(page + 1)} className="rounded-full p-1 hover:bg-ink/5 disabled:opacity-30"><ChevronRight size={18} /></button>
          <button aria-label="Cerrar" onClick={onClose} className="ml-2 rounded-full p-1 hover:bg-ink/5"><X size={18} /></button>
        </div>
      }
    >
      <PageCanvas pdf={pdf} pageNum={page} width={Math.min(760, window.innerWidth - 32)} />
    </Overlay>
  )
}

export function ImageLightbox({ src, name, turn = 0, onClose }: { src: string; name: string; turn?: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <Overlay
      onClose={onClose}
      bar={
        <div className="mb-3 flex max-w-full items-center gap-3 rounded-full bg-white px-4 py-1.5 text-sm shadow-lg">
          <span className="truncate">{name}</span>
          <button aria-label="Cerrar" onClick={onClose} className="rounded-full p-1 hover:bg-ink/5"><X size={18} /></button>
        </div>
      }
    >
      <img src={src} alt={name} className="max-h-[85vh] max-w-full shrink-0 rounded bg-white object-contain shadow-2xl" style={{ transform: turn ? `rotate(${turn}deg)` : undefined, margin: turn % 180 ? '8vh 0' : undefined }} />
    </Overlay>
  )
}
