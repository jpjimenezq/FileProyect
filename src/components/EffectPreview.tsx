import { useEffect, useRef, useState } from 'react'
import { Maximize2, X } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Notice } from './ui'
import { renderEffectPreview } from '../lib/pdf/raster'
import type { PageEffect } from '../lib/pdf/raster'

/** Aviso común de las herramientas que convierten las páginas en imágenes */
export function RasterNotice() {
  return <Notice kind="info">El texto dejará de poder seleccionarse.</Notice>
}

type Show = 'both' | 'Antes' | 'Después'

function BeforeAfter({ pdf, effect, width, onOpen, show = 'both' }: { pdf?: PDFDocumentProxy; effect: PageEffect; width: number; onOpen?: (which: Show) => void; show?: Show }) {
  const before = useRef<HTMLCanvasElement>(null)
  const after = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (!pdf) return
    let alive = true
    setBusy(true)
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(1)
        const scale = (width * 2) / page.getViewport({ scale: 1 }).width
        const result = await renderEffectPreview(pdf, scale, effect)
        if (!alive) return
        for (const [ref, canvas] of [[before, result.before], [after, result.after]] as const) {
          const target = ref.current
          if (!target) continue
          target.width = canvas.width
          target.height = canvas.height
          target.getContext('2d')!.drawImage(canvas, 0, 0)
        }
      } finally {
        if (alive) setBusy(false)
      }
    }, onOpen ? 250 : 0)
    return () => { alive = false; clearTimeout(timer) }
  }, [pdf, effect, width, onOpen, show])

  return (
    <div className="flex flex-wrap items-start justify-center gap-5">
      {([['Antes', before], ['Después', after]] as const).filter(([label]) => show === 'both' || show === label).map(([label, ref]) => (
        <figure key={label} className="flex flex-col items-center gap-1.5">
          <figcaption className="text-sm font-semibold">{label}</figcaption>
          <div className="relative rounded border border-ink/20 bg-white shadow-md" style={{ width }}>
            {onOpen ? (
              <button type="button" onClick={() => onOpen(label)} title="Ver más grande" aria-label={`Ver «${label}» más grande`} className="group relative block w-full cursor-zoom-in">
                <canvas ref={ref} className="block h-auto w-full" />
                <span className="absolute right-1.5 top-1.5 rounded-md bg-ink/70 p-1 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Maximize2 size={14} /></span>
              </button>
            ) : (
              <canvas ref={ref} className="block h-auto w-full" />
            )}
            {busy && label === 'Después' && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-ink/60">Calculando…</span>}
          </div>
        </figure>
      ))}
    </div>
  )
}

/**
 * Antes y después de la primera página con el efecto elegido. Se recalcula (con una pequeña espera) cada vez
 * que cambia `effect`. Al hacer clic en una miniatura se abre un visor grande con las dos versiones.
 */
export function EffectPreview({ pdf, effect, width = 205 }: { pdf?: PDFDocumentProxy; effect: PageEffect; width?: number }) {
  const [big, setBig] = useState(false)
  const [bigShow, setBigShow] = useState<Show>('both')
  const [vw, setVw] = useState(1200)

  const openBig = (which: Show) => {
    setVw(window.innerWidth)
    setBigShow(which)
    setBig(true)
  }
  const bigWidth = bigShow === 'both' ? Math.max(260, Math.min(680, Math.floor((vw - 140) / 2))) : Math.max(280, Math.min(900, vw - 120))

  useEffect(() => {
    if (!big) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(false) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [big])

  return (
    <>
      <BeforeAfter pdf={pdf} effect={effect} width={width} onOpen={pdf ? openBig : undefined} />
      {big && (
        <div role="dialog" aria-modal="true" aria-label="Comparación ampliada" className="fixed inset-0 z-[70] flex flex-col items-center gap-3 bg-ink/85 p-4 backdrop-blur-sm" onClick={() => setBig(false)}>
          <div className="flex w-full max-w-[1500px] items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
            <div role="group" aria-label="Qué ver" className="flex rounded-full bg-white/15 p-1 text-sm font-semibold text-white">
              {([['both', 'Ambos'], ['Antes', 'Antes'], ['Después', 'Después']] as const).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={bigShow === v} onClick={() => setBigShow(v)} className={`rounded-full px-4 py-1.5 transition ${bigShow === v ? 'bg-white text-ink' : 'hover:bg-white/15'}`}>{l}</button>
              ))}
            </div>
            <button type="button" onClick={() => setBig(false)} aria-label="Cerrar" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"><X size={20} /></button>
          </div>
          <div className="thin-scroll min-h-0 w-fit max-w-full flex-1 overflow-auto rounded-3xl bg-paper" onClick={(e) => e.stopPropagation()}>
            <div className="p-6"><BeforeAfter pdf={pdf} effect={effect} width={bigWidth} show={bigShow} /></div>
          </div>
        </div>
      )}
    </>
  )
}
