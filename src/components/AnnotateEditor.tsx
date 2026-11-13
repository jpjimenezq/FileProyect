import { useFitWidth } from '../lib/useFitWidth'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Highlighter, ImagePlus, MousePointer2, Pencil, Square, Trash2, Type, EyeOff, PenLine, TextCursorInput, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageCanvas } from './PageCanvas'
import type { PageInfo } from './PageCanvas'
import { SignaturePad } from './SignaturePad'
import { TextEditLayer } from './TextEditLayer'
import { Field, Workspace, inputCls } from './ToolFrame'
import type { FrameCtx, Output } from './ToolFrame'
import { baseName } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import type { EditItem, Item, RemoveGraphic } from '../lib/pdf/annotate'
import { analyzeGraphics } from '../lib/pdf/graphics'
import type { Graphic, GraphicsInfo } from '../lib/pdf/graphics'
import { applyAnnotations, unsupportedChars } from '../lib/pdf/annotate'
import { extractLines, joinRuns } from '../lib/pdf/textedit'
import { groupParagraphs } from '../lib/pdf/paragraphs'
import type { TextBlock } from '../lib/pdf/paragraphs'
import { usePdf } from '../lib/usePdf'

export type EditorTool = 'select' | 'edittext' | 'text' | 'rect' | 'highlight' | 'pen' | 'image' | 'signature' | 'redact'

const META: Record<EditorTool, { label: string; icon: LucideIcon }> = {
  select: { label: 'Seleccionar', icon: MousePointer2 },
  edittext: { label: 'Editar texto', icon: TextCursorInput },
  text: { label: 'Texto', icon: Type },
  rect: { label: 'Rectángulo', icon: Square },
  highlight: { label: 'Resaltar', icon: Highlighter },
  pen: { label: 'Dibujar', icon: Pencil },
  image: { label: 'Imagen', icon: ImagePlus },
  signature: { label: 'Firma', icon: PenLine },
  redact: { label: 'Censurar', icon: EyeOff },
}

/** Una línea que dice qué hacer con la herramienta elegida */
const GUIDE: Record<EditorTool, string> = {
  select: 'Haz clic en un elemento para moverlo, cambiarlo o borrarlo.',
  edittext: 'Haz clic en un párrafo y escribe ahí mismo (Enter termina, Esc cancela). Pulsa una raya, una forma o una imagen para elegirla y quitarla.',
  text: 'Haz clic en la página donde quieras escribir.',
  rect: 'Arrastra sobre la página para dibujar un rectángulo.',
  highlight: 'Arrastra sobre el texto que quieras resaltar.',
  pen: 'Mantén pulsado y dibuja a mano alzada.',
  image: 'Elige una imagen y haz clic en la página para colocarla.',
  signature: 'Crea tu firma y haz clic en la página para colocarla.',
  redact: 'Arrastra sobre lo que quieras ocultar. El texto tapado se elimina del archivo.',
}

const COLORS: Partial<Record<EditorTool, string>> = { text: '#111111', rect: '#d32f2f', highlight: '#ffeb3b', pen: '#1565c0', redact: '#000000' }
const PAGE_WIDTH = 560
const uid = () => Math.random().toString(36).slice(2)
const clamp = (n: number) => Math.min(1, Math.max(0, n))

interface Props extends FrameCtx {
  tools: EditorTool[]
  actionLabel: string
  suffix: string
  apply: (file: File, items: Item[], progress: (f: number) => void) => Promise<Uint8Array>
}

type Drag =
  | { mode: 'draw'; id: string; sx: number; sy: number }
  | { mode: 'move'; id: string; dx: number; dy: number }
  | { mode: 'resize'; id: string }

async function readImage(file: File): Promise<{ src: string; ratio: number }> {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  return { src: c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'), ratio: bmp.height / bmp.width }
}

export function AnnotateEditor({ files, run, tools, actionLabel, suffix, apply }: Props) {
  const pageWidth = useFitWidth(PAGE_WIDTH)
  const file = files[0]
  const { pdf, numPages, error } = usePdf(file)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Item[]>([])
  const [tool, setTool] = useState<EditorTool>(tools[0])
  const [selected, setSelected] = useState<string>()
  const [pending, setPending] = useState<{ src: string; ratio: number }>()
  const [blocks, setBlocks] = useState<Record<number, TextBlock[]>>({})
  const [graphics, setGraphics] = useState<Record<number, GraphicsInfo>>({})
  // Lo que se quita de la página (rayas, formas, imágenes) se ve de verdad: la página se dibuja desde el PDF ya sin ello
  const [preview, setPreview] = useState<File>()
  const removalKey = items.filter((i) => i.kind === 'remove').map((i) => i.id).join(',')
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)

  const shown = usePdf(preview ?? file)
  useEffect(() => {
    const removals = items.filter((i) => i.kind === 'remove')
    if (!removals.length) { setPreview(undefined); return }
    let alive = true
    const timer = setTimeout(() => {
      applyAnnotations(file, removals).then((bytes) => { if (alive) setPreview(new File([bytes as BlobPart], file.name, { type: 'application/pdf' })) }, () => undefined)
    }, 120)
    return () => { alive = false; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removalKey, file])

  /** Pone un texto sobre una raya (para rellenarla): la letra tiene el tamaño del texto de al lado y se apoya en la raya */
  const writeOn = (g: Graphic) => {
    const near = (blocks[page] ?? [])
      .filter((b) => Math.abs(b.baselines[b.baselines.length - 1] - g.y) < 28 / b.H)
      .sort((a, b) => Math.abs(a.baselines[0] - g.y) - Math.abs(b.baselines[0] - g.y))[0]
    const size = near ? Math.round(near.size * 10) / 10 : 11
    const H = near?.H ?? 792
    const id = uid()
    // la línea base del texto queda 2 pt por encima de la raya
    const y = g.y - (2 + size * 0.8) / H
    setItems((a) => [...a, { id, page, kind: 'text', x: g.x + 4 / (near?.W ?? 612), y, text: '', size, color: '#111111' }])
    setSelected(id)
    setTool('select')
  }

  const sel = items.find((i) => i.id === selected)
  const patch = (id: string, change: Partial<Item>) => setItems((all) => all.map((i) => (i.id === id ? ({ ...i, ...change } as Item) : i)))
  const remove = (id: string) => { setItems((all) => all.filter((i) => i.id !== id)); setSelected(undefined) }

  // las líneas de texto de la página se leen la primera vez que se entra en «Editar texto»
  useEffect(() => {
    if (!pdf || tool !== 'edittext' || blocks[page]) return
    let alive = true
    pdf.getPage(page).then(async (p) => {
      const g = await analyzeGraphics(p).catch(() => undefined)
      if (alive && g) setGraphics((all) => ({ ...all, [page]: g }))
      return extractLines(p, page)
    }).then(
      (l) => alive && setBlocks((all) => ({ ...all, [page]: groupParagraphs(l) })),
      () => alive && setBlocks((all) => ({ ...all, [page]: [] })),
    )
    return () => { alive = false }
  }, [pdf, page, tool, blocks])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (selected && (e.key === 'Delete') && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') remove(selected)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const point = (e: React.PointerEvent) => {
    const r = overlay.current!.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }
  }

  const down = (e: React.PointerEvent) => {
    if (tool === 'edittext') return
    const { x, y } = point(e)
    if (tool === 'select') return setSelected(undefined)
    const id = uid()
    if (tool === 'text') {
      setItems((a) => [...a, { id, page, kind: 'text', x, y, text: 'Texto', size: 16, color: COLORS.text! }])
      setSelected(id)
      setTool('select')
    } else if (tool === 'image' || tool === 'signature') {
      if (!pending) return
      setItems((a) => [...a, { id, page, kind: 'image', x: Math.min(x, 0.7), y: Math.min(y, 0.9), w: 0.3, ratio: pending.ratio, src: pending.src }])
      setSelected(id)
      setTool('select')
    } else if (tool === 'rect' || tool === 'highlight' || tool === 'redact') {
      overlay.current!.setPointerCapture(e.pointerId)
      drag.current = { mode: 'draw', id, sx: x, sy: y }
      setItems((a) => [...a, { id, page, kind: tool, x, y, w: 0, h: 0, color: COLORS[tool]! }])
      setSelected(id)
    } else if (tool === 'pen') {
      overlay.current!.setPointerCapture(e.pointerId)
      drag.current = { mode: 'draw', id, sx: x, sy: y }
      setItems((a) => [...a, { id, page, kind: 'pen', points: [[x, y]], color: COLORS.pen!, width: 2 }])
      setSelected(id)
    }
  }

  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const { x, y } = point(e)
    setItems((all) => all.map((it) => {
      if (it.id !== d.id) return it
      if (d.mode === 'draw') {
        if (it.kind === 'pen') return { ...it, points: [...it.points, [x, y]] as [number, number][] }
        if (it.kind === 'rect' || it.kind === 'highlight' || it.kind === 'redact') return { ...it, x: Math.min(x, d.sx), y: Math.min(y, d.sy), w: Math.abs(x - d.sx), h: Math.abs(y - d.sy) }
      } else if (d.mode === 'move' && 'x' in it) {
        return { ...it, x: clamp(x - d.dx), y: clamp(y - d.dy) }
      } else if (d.mode === 'resize') {
        if (it.kind === 'image') return { ...it, w: Math.max(0.03, x - it.x) }
        if (it.kind === 'rect' || it.kind === 'highlight' || it.kind === 'redact') return { ...it, w: Math.max(0.01, x - it.x), h: Math.max(0.01, y - it.y) }
      }
      return it
    }))
  }

  const up = () => {
    const d = drag.current
    drag.current = null
    if (d?.mode === 'draw') {
      // descarta rectángulos sin tamaño (un simple clic)
      setItems((all) => all.filter((i) => !(i.id === d.id && 'w' in i && i.kind !== 'image' && (i.w < 0.005 || i.h < 0.005))))
    }
  }

  const grab = (e: React.PointerEvent, it: Item) => {
    if (tool !== 'select' || !('x' in it) || it.kind === 'edit' || it.kind === 'remove') return
    e.stopPropagation()
    setSelected(it.id)
    overlay.current!.setPointerCapture(e.pointerId)
    const { x, y } = point(e)
    drag.current = { mode: 'move', id: it.id, dx: x - it.x, dy: y - it.y }
  }
  const grabHandle = (e: React.PointerEvent, it: Item) => {
    e.stopPropagation()
    overlay.current!.setPointerCapture(e.pointerId)
    drag.current = { mode: 'resize', id: it.id }
  }

  const renderItem = (it: Item, info: PageInfo) => {
    if (it.kind === 'edit' || it.kind === 'remove') return null
    const outline = it.id === selected ? 'outline outline-2 outline-offset-1 outline-sky-500' : ''
    if (it.kind === 'pen') {
      const pts = it.points.map(([x, y]) => `${x * info.width},${y * info.height}`).join(' ')
      return (
        <svg key={it.id} className="pointer-events-none absolute inset-0" width={info.width} height={info.height}>
          <polyline points={pts} fill="none" stroke={it.color} strokeWidth={it.width * info.scale} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    }
    const style: React.CSSProperties = { left: `${it.x * 100}%`, top: `${it.y * 100}%` }
    const handle = (
      <span onPointerDown={(e) => grabHandle(e, it)} className="absolute -bottom-2 -right-2 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white bg-sky-500" />
    )
    if (it.kind === 'text') {
      return (
        <div key={it.id} onPointerDown={(e) => grab(e, it)} style={{ ...style, fontSize: it.size * info.scale, color: it.color, lineHeight: 1.2, whiteSpace: 'pre' }} className={`absolute cursor-move font-sans ${outline}`}>
          {it.text || <span className="text-gray-400">Escribe aquí</span>}
        </div>
      )
    }
    if (it.kind === 'image') {
      return (
        <div key={it.id} onPointerDown={(e) => grab(e, it)} style={{ ...style, width: `${it.w * 100}%` }} className={`absolute cursor-move ${outline}`}>
          <img src={it.src} alt="" draggable={false} className="w-full" />
          {it.id === selected && handle}
        </div>
      )
    }
    const kindStyle: React.CSSProperties =
      it.kind === 'rect' ? { border: `2px solid ${it.color}` } : it.kind === 'highlight' ? { background: it.color, opacity: 0.4 } : { background: '#000', opacity: 0.85 }
    return (
      <div key={it.id} onPointerDown={(e) => grab(e, it)} style={{ ...style, width: `${it.w * 100}%`, height: `${it.h * 100}%`, ...kindStyle }} className={`absolute cursor-move ${outline}`}>
        {it.id === selected && handle}
      </div>
    )
  }

  const onImageFile = async (f?: File) => {
    if (!f) return
    setPending(await readImage(f))
    setTool('image')
  }

  const pageItems = items.filter((i) => i.page === page)
  const edits = items.filter((i): i is EditItem => i.kind === 'edit')
  const removals = items.filter((i): i is RemoveGraphic => i.kind === 'remove')
  const lost = [...new Set(edits.flatMap((e) => unsupportedChars(joinRuns(e.runs))))]
  const toolButtons = ['select' as const, ...tools.filter((t) => t !== 'select')]

  return (
    <Workspace
      main={
        error ? <p className="text-center text-red-600">{error}</p> : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 text-sm">
              <button aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded p-1 hover:bg-gray-200 disabled:opacity-30"><ChevronLeft /></button>
              <span>Página {page} de {numPages || '…'}</span>
              <button aria-label="Página siguiente" disabled={page >= numPages} onClick={() => setPage(page + 1)} className="rounded p-1 hover:bg-gray-200 disabled:opacity-30"><ChevronRight /></button>
            </div>
            <div className="thin-scroll max-w-full overflow-auto">
              {(shown.pdf ?? pdf) && (
                <PageCanvas
                  pdf={(shown.pdf ?? pdf)!}
                  pageNum={page}
                  width={pageWidth}
                  overlayRef={overlay}
                  canvasRef={setCanvasEl}
                  overlayProps={{ onPointerDown: down, onPointerMove: move, onPointerUp: up, className: `absolute inset-0 touch-none overflow-hidden ${tool === 'select' ? '' : 'cursor-crosshair'}` }}
                >
                  {(info) => (
                    <>
                      {pageItems.map((it) => renderItem(it, info))}
                      <TextEditLayer info={info} blocks={blocks[page] ?? []} graphics={graphics[page]} onWrite={writeOn} items={items} setItems={setItems} page={page} enabled={tool === 'edittext'} canvas={canvasEl} />
                    </>
                  )}
                </PageCanvas>
              )}
            </div>
          </div>
        )
      }
      side={
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {toolButtons.map((t) => {
              const { label, icon: Icon } = META[t]
              return (
                <button key={t} onClick={() => setTool(t)} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${tool === t ? 'border-brand bg-brand/10 text-brand' : 'border-gray-300 hover:bg-gray-50'}`}>
                  <Icon size={16} /> {label}
                </button>
              )
            })}
          </div>

          <p className="text-xs leading-snug text-gray-500">{GUIDE[tool]}</p>

          {tool === 'edittext' && (
            <>
              {blocks[page] && !blocks[page].length && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Esta página no tiene texto que se pueda editar. Si es un escaneo, usa antes la herramienta OCR.</p>}
              {!blocks[page] && pdf && <p className="text-xs text-gray-500">Leyendo el texto de la página…</p>}
              {removals.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {removals.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line bg-paper p-2 text-xs">
                      <span className="flex-1 font-medium">{{ line: 'Raya', shape: 'Forma', image: 'Imagen' }[r.what]} quitada (página {r.page})</span>
                      <button onClick={() => remove(r.id)} aria-label="Deshacer este cambio" title="Deshacer este cambio" className="rounded-md p-1 hover:bg-white"><Undo2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {edits.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {edits.map((e) => (
                    <li key={e.id} className="flex items-start gap-2 rounded-lg border border-line bg-paper p-2 text-xs">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink/45 line-through" title={e.orig}>{e.orig}</span>
                        <span className="block truncate font-medium" title={joinRuns(e.runs)}>{joinRuns(e.runs) || '(borrado)'}</span>
                      </span>
                      <button onClick={() => remove(e.id)} aria-label="Deshacer este cambio" title="Deshacer este cambio" className="rounded-md p-1 hover:bg-white"><Undo2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {lost.length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Estas letras no se pueden guardar en este PDF y saldrán como «?»: {lost.join(' ')}</p>}
              <p className="text-[11px] leading-snug text-gray-400">El texto nuevo se escribe con la fuente estándar más parecida (Helvetica, Times o Courier).</p>
            </>
          )}

          {tool === 'image' && (
            <Field label={pending ? 'Haz clic en la página para colocarla' : 'Elige una imagen'}>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="text-xs font-normal" onChange={(e) => onImageFile(e.target.files?.[0])} />
            </Field>
          )}
          {tool === 'signature' && (
            <>
              <SignaturePad onDone={(src, ratio) => setPending({ src, ratio })} />
              {pending && <p className="text-sm text-green-700">Firma lista: haz clic en la página para colocarla.</p>}
            </>
          )}

          {sel?.kind === 'text' && (
            <>
              <Field label="Texto"><textarea autoFocus rows={3} className={inputCls} value={sel.text} onChange={(e) => patch(sel.id, { text: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tamaño"><input type="number" min={6} max={120} className={inputCls} value={sel.size} onChange={(e) => patch(sel.id, { size: Number(e.target.value) })} /></Field>
                <Field label="Color"><input type="color" className="h-10 w-full rounded-lg border border-gray-300" value={sel.color} onChange={(e) => patch(sel.id, { color: e.target.value })} /></Field>
              </div>
            </>
          )}
          {(sel?.kind === 'rect' || sel?.kind === 'highlight' || sel?.kind === 'pen') && (
            <Field label="Color"><input type="color" className="h-10 w-full rounded-lg border border-gray-300" value={sel.color} onChange={(e) => patch(sel.id, { color: e.target.value })} /></Field>
          )}
          {sel?.kind === 'pen' && (
            <Field label="Grosor"><input type="range" min={1} max={12} value={sel.width} onChange={(e) => patch(sel.id, { width: Number(e.target.value) })} /></Field>
          )}
          {sel && (
            <button onClick={() => remove(sel.id)} className="flex items-center justify-center gap-2 rounded-lg border border-red-300 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={16} /> Eliminar elemento</button>
          )}
          <p className="text-xs text-gray-500">{items.length} elemento(s) en total.</p>
        </>
      }
      action={{
        label: actionLabel,
        disabled: items.length === 0,
        onClick: () => run(async (progress): Promise<Output[]> => [{ name: `${baseName(file)}_${suffix}.pdf`, blob: pdfBlob(await apply(file, items, progress)) }]),
      }}
    />
  )
}
