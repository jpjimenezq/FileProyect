import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { AddMore } from '../components/Dropzone'
import { ToolFrame } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { renderPage } from '../lib/pdf/render'
import { usePdf } from '../lib/usePdf'

const W = 380

/** Pinta en rojo los píxeles distintos y devuelve el % de la página que cambió */
function diffCanvases(a: HTMLCanvasElement, b: HTMLCanvasElement, out: HTMLCanvasElement) {
  const w = Math.max(a.width, b.width)
  const h = Math.max(a.height, b.height)
  out.width = w
  out.height = h
  const read = (c: HTMLCanvasElement) => {
    const t = document.createElement('canvas')
    t.width = w
    t.height = h
    const g = t.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, w, h)
    g.drawImage(c, 0, 0)
    return g.getImageData(0, 0, w, h)
  }
  const da = read(a)
  const db = read(b)
  const res = new ImageData(w, h)
  let changed = 0
  for (let i = 0; i < da.data.length; i += 4) {
    const lum = (d: ImageData) => d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11
    const la = lum(da)
    if (Math.abs(la - lum(db)) > 40) {
      changed++
      res.data.set([220, 30, 30, 255], i)
    } else {
      const v = 255 - (255 - la) * 0.5
      res.data.set([v, v, v, 255], i)
    }
  }
  out.getContext('2d')!.putImageData(res, 0, 0)
  return (changed / (w * h)) * 100
}

function ComparePage({ a, b, n, enabled, onDone }: { a?: PDFDocumentProxy; b?: PDFDocumentProxy; n: number; enabled: boolean; onDone: () => void }) {
  const ca = useRef<HTMLCanvasElement>(null)
  const cb = useRef<HTMLCanvasElement>(null)
  const cd = useRef<HTMLCanvasElement>(null)
  const [percent, setPercent] = useState<number>()

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const blank = (c: HTMLCanvasElement) => { c.width = W; c.height = Math.round(W * 1.3); const g = c.getContext('2d')!; g.fillStyle = '#f3f4f6'; g.fillRect(0, 0, c.width, c.height) }
    Promise.all([
      a && n <= a.numPages ? renderPage(a, n, ca.current!, W) : blank(ca.current!),
      b && n <= b.numPages ? renderPage(b, n, cb.current!, W) : blank(cb.current!),
    ]).then(
      () => { if (alive) setPercent(diffCanvases(ca.current!, cb.current!, cd.current!)) },
      (e) => console.error('Comparar: error al renderizar la página', n, e),
    ).finally(() => { if (alive) onDone() })
    return () => { alive = false }
  }, [enabled, a, b, n])

  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <p className="mb-3 text-sm font-semibold">
        Página {n} · {percent === undefined ? (enabled ? 'comparando…' : 'en cola…') : percent < 0.01 ? 'sin diferencias' : `${percent.toFixed(2)}% distinto`}
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {[['Original', ca], ['Modificado', cb], ['Diferencias', cd]].map(([label, ref]) => (
          <figure key={label as string}>
            <figcaption className="mb-1 text-xs text-gray-500">{label as string}</figcaption>
            <canvas ref={ref as React.RefObject<HTMLCanvasElement>} className="w-full border border-gray-200" />
          </figure>
        ))}
      </div>
    </div>
  )
}

function CompareWork({ files, setFiles, addFiles }: FrameCtx) {
  const pa = usePdf(files[0])
  const pb = usePdf(files[1] ?? files[0])
  const [unlocked, setUnlocked] = useState(1)
  useEffect(() => { setUnlocked(1) }, [files])

  if (files.length < 2) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <p>Has elegido <b>{files[0].name}</b>. Añade el segundo PDF para compararlos.</p>
        <AddMore accept=".pdf" onFiles={addFiles} label="Añadir segundo PDF" />
      </div>
    )
  }
  const total = Math.max(pa.numPages, pb.numPages)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4 text-sm">
        <span><b>Original:</b> {files[0].name} ({pa.numPages} págs.) · <b>Modificado:</b> {files[1].name} ({pb.numPages} págs.)</span>
        <button className="text-brand hover:underline" onClick={() => setFiles([files[1], files[0]])}>Intercambiar</button>
      </div>
      {pa.pdf && pb.pdf && Array.from({ length: total }, (_, i) => <ComparePage key={`${files[0].name}${files[1].name}${i}`} a={pa.pdf} b={pb.pdf} n={i + 1} enabled={i + 1 <= unlocked} onDone={() => setUnlocked((u) => Math.max(u, i + 2))} />)}
    </div>
  )
}

export default function Compare() {
  return <ToolFrame id="compare" accept=".pdf" multiple>{(ctx) => <CompareWork {...ctx} />}</ToolFrame>
}
