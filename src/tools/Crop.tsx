import { useFitWidth } from '../lib/useFitWidth'
import { useEffect, useRef, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { PageCanvas } from '../components/PageCanvas'
import { Segmented } from '../components/Illustrate'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Button, NumberField, Notice, PagePager } from '../components/ui'
import { baseName } from '../lib/files'
import { boxToMargins, cropSelectedPages, marginsToBox, ptToMm } from '../lib/pdf/crop'
import type { CropBox as Box, Margins } from '../lib/pdf/crop'
import { inkBounds, unionBox } from '../lib/pdf/misc'
import { renderPage } from '../lib/pdf/render'
import { pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

const clamp = (n: number) => Math.min(1, Math.max(0, n))
const MIN = 0.03

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type Drag =
  | { kind: 'new'; x: number; y: number }
  | { kind: 'move'; dx: number; dy: number; box: Box }
  | { kind: 'resize'; handle: Handle; box: Box }

const HANDLES: { id: Handle; left: string; top: string; cursor: string }[] = [
  { id: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
  { id: 'n', left: '50%', top: '0%', cursor: 'ns-resize' },
  { id: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
  { id: 'e', left: '100%', top: '50%', cursor: 'ew-resize' },
  { id: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
  { id: 's', left: '50%', top: '100%', cursor: 'ns-resize' },
  { id: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
  { id: 'w', left: '0%', top: '50%', cursor: 'ew-resize' },
]

/** Mueve los lados que toca el asa hacia el punto, sin pasar de un tamaño mínimo */
function resize(box: Box, handle: Handle, p: { x: number; y: number }): Box {
  let l = box.x, t = box.y, r = box.x + box.w, b = box.y + box.h
  if (handle.includes('w')) l = Math.min(p.x, r - MIN)
  if (handle.includes('e')) r = Math.max(p.x, l + MIN)
  if (handle.includes('n')) t = Math.min(p.y, b - MIN)
  if (handle.includes('s')) b = Math.max(p.y, t + MIN)
  return { x: l, y: t, w: r - l, h: b - t }
}

function CropWork({ files, run }: FrameCtx) {
  const pageWidth = useFitWidth(560)
  const file = files[0]
  const { pdf, numPages, error } = usePdf(file)
  const [page, setPage] = useState(1)
  const [box, setBox] = useState<Box>()
  const [scope, setScope] = useState<'all' | 'one'>('all')
  const [size, setSize] = useState({ w: 210, h: 297 })
  const overlay = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [notFound, setNotFound] = useState(false)

  // tamaño de la página que se ve, en mm, para los márgenes
  useEffect(() => {
    if (!pdf) return
    let alive = true
    pdf.getPage(page).then((p) => {
      const v = p.getViewport({ scale: 1 })
      if (alive) setSize({ w: ptToMm(v.width), h: ptToMm(v.height) })
    })
    return () => { alive = false }
  }, [pdf, page])

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

  const onDown = (e: React.PointerEvent) => {
    const p = point(e)
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')
    const what = target?.dataset.handle
    overlay.current!.setPointerCapture(e.pointerId)
    if (box && what === 'move') drag.current = { kind: 'move', dx: p.x - box.x, dy: p.y - box.y, box }
    else if (box && what) drag.current = { kind: 'resize', handle: what as Handle, box }
    else { drag.current = { kind: 'new', x: p.x, y: p.y }; setBox(undefined) }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = point(e)
    if (d.kind === 'new') setBox({ x: Math.min(p.x, d.x), y: Math.min(p.y, d.y), w: Math.abs(p.x - d.x), h: Math.abs(p.y - d.y) })
    else if (d.kind === 'resize') setBox(resize(d.box, d.handle, p))
    else setBox({ ...d.box, x: Math.min(1 - d.box.w, Math.max(0, p.x - d.dx)), y: Math.min(1 - d.box.h, Math.max(0, p.y - d.dy)) })
  }
  const onUp = () => {
    drag.current = null
    setBox((b) => (b && (b.w < MIN || b.h < MIN) ? undefined : b))
  }

  const margins = boxToMargins(box, size)
  const setMargin = (side: keyof Margins, v: number) => setBox(marginsToBox({ ...margins, [side]: Math.max(0, v) }, size))
  const field = (side: keyof Margins, label: string) => (
    <NumberField label={label} value={margins[side]} onChange={(v) => setMargin(side, v)} min={0} max={Math.floor(side === 'top' || side === 'bottom' ? size.h : size.w)} step={1} unit="mm" />
  )

  return (
    <Workspace
      main={
        error ? <Notice kind="error">{error}</Notice> : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-ink/60">Arrastra sobre la página para elegir la zona que se conserva. Ajústala con las asas.</p>
            <div className="max-w-full overflow-auto p-3">
              {pdf && (
                <PageCanvas
                  pdf={pdf}
                  pageNum={page}
                  width={pageWidth}
                  overlayRef={overlay}
                  overlayProps={{
                    className: 'absolute inset-0 cursor-crosshair touch-none overflow-visible',
                    onPointerDown: onDown,
                    onPointerMove: onMove,
                    onPointerUp: onUp,
                    onPointerCancel: onUp,
                  }}
                >
                  {() => box && (
                    <div className="absolute" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}>
                      <div data-handle="move" data-testid="crop-box" className="absolute inset-0 cursor-move border-2 border-brand bg-brand/10" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
                      {HANDLES.map((h) => (
                        <span key={h.id} data-handle={h.id} aria-label={`Ajustar recuadro (${h.id})`} className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center" style={{ left: h.left, top: h.top, cursor: h.cursor }}>
                          <span className="pointer-events-none h-3.5 w-3.5 rounded-full border-2 border-brand bg-white shadow" />
                        </span>
                      ))}
                    </div>
                  )}
                </PageCanvas>
              )}
            </div>
            {numPages > 1 && <PagePager page={page} total={numPages} onChange={setPage} />}
          </div>
        )
      }
      side={
        <>
          <Button variant="secondary" icon={Wand2} onClick={detect} disabled={!pdf || detecting} loading={detecting}>{detecting ? 'Buscando contenido…' : 'Detectar contenido'}</Button>
          <p className="text-sm text-ink/65">{box ? `Zona elegida: ${Math.round(box.w * 100)}% × ${Math.round(box.h * 100)}% de la página.` : notFound ? 'No se encontró contenido en las páginas.' : 'Dibuja la zona sobre la página o deja que la detectemos.'}</p>
          {numPages > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Aplicar a</span>
              <Segmented<'all' | 'one'> label="Aplicar a" value={scope} onChange={setScope} options={[{ value: 'all', label: 'Todas las páginas' }, { value: 'one', label: 'Solo esta página' }]} />
            </div>
          )}
          <details className="rounded-xl border border-line bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold">Márgenes en mm</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {field('top', 'Arriba')}
              {field('right', 'Derecha')}
              {field('bottom', 'Abajo')}
              {field('left', 'Izquierda')}
            </div>
          </details>
        </>
      }
      action={{
        label: 'Recortar PDF',
        disabled: !box,
        onClick: () => run(async () => [{ name: `${baseName(file)}_recortado.pdf`, blob: pdfBlob(await cropSelectedPages(file, box!, scope === 'one' && numPages > 1 ? [page] : undefined)) }]),
      }}
    />
  )
}

export default function Crop() {
  return <ToolFrame id="crop" accept=".pdf">{(ctx) => <CropWork {...ctx} />}</ToolFrame>
}
