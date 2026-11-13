import { useFitWidth } from '../lib/useFitWidth'
import { useRef, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { PageCanvas } from '../components/PageCanvas'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { cropPages } from '../lib/pdf/annotate'
import { inkBounds, unionBox } from '../lib/pdf/misc'
import { renderPage } from '../lib/pdf/render'
import { pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

type Box = { x: number; y: number; w: number; h: number }
const clamp = (n: number) => Math.min(1, Math.max(0, n))

function CropWork({ files, run }: FrameCtx) {
  const pageWidth = useFitWidth(560)
  const file = files[0]
  const { pdf, error } = usePdf(file)
  const [box, setBox] = useState<Box>()
  const overlay = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [notFound, setNotFound] = useState(false)

  /** Busca dónde hay contenido en las primeras páginas y propone un recorte que lo abarca todo */
  const detect = async () => {
    if (!pdf) return
    setDetecting(true)
    setNotFound(false)
    const canvas = document.createElement('canvas')
    const boxes: Box[] = []
    for (let n = 1; n <= Math.min(pdf.numPages, 12); n++) {
      await renderPage(pdf, n, canvas, 300)
      const b = inkBounds(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
      if (b) boxes.push(b)
    }
    const found = unionBox(boxes)
    setNotFound(!found)
    if (found) setBox(found)
    setDetecting(false)
  }

  const point = (e: React.PointerEvent) => {
    const r = overlay.current!.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }
  }

  return (
    <Workspace
      main={
        error ? <p className="text-center text-red-600">{error}</p> : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-gray-600">Arrastra sobre la página para elegir la zona que se conserva. Se aplicará a todas las páginas.</p>
            <div className="max-w-full overflow-auto">
              {pdf && (
                <PageCanvas
                  pdf={pdf}
                  pageNum={1}
                  width={pageWidth}
                  overlayRef={overlay}
                  overlayProps={{
                    className: 'absolute inset-0 cursor-crosshair touch-none overflow-hidden',
                    onPointerDown: (e) => { overlay.current!.setPointerCapture(e.pointerId); start.current = point(e); setBox(undefined) },
                    onPointerMove: (e) => {
                      if (!start.current) return
                      const p = point(e)
                      setBox({ x: Math.min(p.x, start.current.x), y: Math.min(p.y, start.current.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) })
                    },
                    onPointerUp: () => { start.current = null; setBox((b) => (b && (b.w < 0.03 || b.h < 0.03) ? undefined : b)) },
                  }}
                >
                  {() => box && (
                    <div className="pointer-events-none absolute border-2 border-brand bg-brand/10" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
                  )}
                </PageCanvas>
              )}
            </div>
          </div>
        )
      }
      side={
        <>
          <button onClick={detect} disabled={!pdf || detecting} className="flex items-center justify-center gap-2 rounded-xl border-2 border-brand py-2.5 text-sm font-semibold text-brand hover:bg-brand/10 disabled:opacity-50"><Wand2 size={16} /> {detecting ? 'Buscando contenido…' : 'Detectar contenido automáticamente'}</button>
          <p className="text-sm text-ink/65">{box ? `Zona elegida: ${Math.round(box.w * 100)}% × ${Math.round(box.h * 100)}% de la página.` : notFound ? 'No se encontró contenido en las páginas.' : 'Dibuja la zona sobre la página o deja que la detectemos.'}</p>
        </>
      }
      action={{
        label: 'Recortar PDF',
        disabled: !box,
        onClick: () => run(async () => [{ name: `${baseName(file)}_recortado.pdf`, blob: pdfBlob(await cropPages(file, box!)) }]),
      }}
    />
  )
}

export default function Crop() {
  return <ToolFrame id="crop" accept=".pdf">{(ctx) => <CropWork {...ctx} />}</ToolFrame>
}
