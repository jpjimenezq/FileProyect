import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderPage } from '../lib/pdf/render'
import { PdfLightbox, ZoomButton } from './Lightbox'

interface Props {
  pdf: PDFDocumentProxy
  pageNum: number
  width?: number
  rotation?: number
  /** Muestra una lupa para ver la página en grande (por defecto, sí) */
  zoom?: boolean
}

/** Miniatura que se renderiza solo cuando entra en pantalla */
export function PageThumb({ pdf, pageNum, width = 160, rotation = 0, zoom = true }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [open, setOpen] = useState<number>()

  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      io.disconnect()
      if (canvas.current) renderPage(pdf, pageNum, canvas.current, width * 2).catch(() => console.warn('No se pudo renderizar la página', pageNum))
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [pdf, pageNum, width])

  const odd = rotation % 2 !== 0
  return (
    <div ref={box} className="group/zoom relative flex items-center justify-center" style={{ width, height: width * 1.3 }}>
      <canvas
        ref={canvas}
        className="max-h-full max-w-full bg-white shadow transition-transform"
        style={{ transform: `rotate(${rotation * 90}deg)${odd ? ' scale(0.75)' : ''}` }}
      />
      {zoom && <ZoomButton onOpen={() => setOpen(pageNum)} label={`Ver la página ${pageNum} en grande`} />}
      {open && <PdfLightbox pdf={pdf} page={open} onPage={setOpen} onClose={() => setOpen(undefined)} />}
    </div>
  )
}
