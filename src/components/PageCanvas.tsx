import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderPage } from '../lib/pdf/render'

export interface PageInfo {
  width: number
  height: number
  /** px de pantalla por cada pt del PDF */
  scale: number
}

interface Props {
  pdf: PDFDocumentProxy
  pageNum: number
  width: number
  /** Capa superpuesta (posición absoluta sobre la página) */
  children?: (info: PageInfo) => ReactNode
  overlayRef?: React.Ref<HTMLDivElement>
  /** Recibe el lienzo donde se dibuja la página (para leer sus colores) */
  canvasRef?: (el: HTMLCanvasElement | null) => void
  overlayProps?: React.HTMLAttributes<HTMLDivElement>
}

/** Página renderizada a tamaño fijo con una capa encima para anotar */
export function PageCanvas({ pdf, pageNum, width, children, overlayRef, overlayProps, canvasRef }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [pts, setPts] = useState<{ w: number; h: number }>()

  useEffect(() => {
    let alive = true
    pdf.getPage(pageNum).then((p) => {
      const v = p.getViewport({ scale: 1 })
      if (alive) setPts({ w: v.width, h: v.height })
    })
    return () => { alive = false }
  }, [pdf, pageNum])

  useEffect(() => {
    if (canvas.current && pts) renderPage(pdf, pageNum, canvas.current, width * 2).catch(() => console.warn('No se pudo renderizar la página'))
  }, [pdf, pageNum, width, pts])

  if (!pts) return <div style={{ width, height: width * 1.3 }} className="animate-pulse bg-gray-200" />
  const height = (pts.h / pts.w) * width
  const info = { width, height, scale: width / pts.w }

  return (
    <div className="relative shrink-0 select-none bg-white shadow-lg" style={{ width, height }}>
      <canvas ref={(el) => { canvas.current = el; canvasRef?.(el) }} className="absolute inset-0 h-full w-full" />
      <div ref={overlayRef} className="absolute inset-0 touch-none overflow-hidden" {...overlayProps}>
        {children?.(info)}
      </div>
    </div>
  )
}
