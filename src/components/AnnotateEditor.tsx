import { useFitWidth } from '../lib/useFitWidth'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Highlighter, ImagePlus, Loader2, MousePointer2, Pencil, Square, Trash2, Type, EyeOff, PenLine, TextCursorInput, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageCanvas } from './PageCanvas'
import type { PageInfo } from './PageCanvas'
import { SignaturePad } from './SignaturePad'
import { ImagePicker } from './ImagePicker'
import { Button, ColorField, NumberField, Notice, PagePager, Slider } from './ui'
import { TextEditLayer } from './TextEditLayer'
import { Workspace, inputCls } from './ToolFrame'
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
  select: 'Pulsa un elemento para moverlo, cambiarlo o borrarlo.',
  edittext: 'Pulsa un párrafo y escribe ahí mismo; pulsa una raya o forma para quitarla.',
  text: 'Pulsa en la página donde quieras escribir.',
  rect: 'Arrastra sobre la página para dibujar un rectángulo.',
  highlight: 'Arrastra sobre el texto que quieras resaltar.',
  pen: 'Mantén pulsado y dibuja a mano alzada.',
  image: 'Elige una imagen y pulsa la página donde va.',
  signature: 'Crea tu firma y pulsa la página donde va.',
  redact: 'Arrastra sobre lo que quieras ocultar. El texto tapado se elimina del archivo.',
}

type Paint = 'text' | 'rect' | 'highlight' | 'pen'
const DEFAULT_COLORS: Record<Paint, string> = { text: '#111111', rect: '#d32f2f', highlight: '#ffeb3b', pen: '#2563eb' }
const PALETTE = ['#111111', '#d32f2f', '#16a34a', '#2563eb', '#ffeb3b', '#ffffff']
const isPaint = (t: string): t is Paint => t === 'text' || t === 'rect' || t === 'highlight' || t === 'pen'
const plural = (n: number) => (n === 0 ? 'Aún no hay elementos' : n === 1 ? '1 elemento' : `${n} elementos`)

/** true cuando hay sitio para el panel lateral (escritorio) */
function useWide() {
  const q = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}
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
  const [pendingImg, setPendingImg] = useState<{ src: string; ratio: number }>()
  const [pendingSig, setPendingSig] = useState<{ src: string; ratio: number }>()
  const [imageFile, setImageFile] = useState<File>()
  const [changingSig, setChangingSig] = useState(false)
  const [colors, setColors] = useState(DEFAULT_COLORS)
  const [textSize, setTextSize] = useState(16)
  const [penWidth, setPenWidth] = useState(2)
  const wide = useWide()
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
      setItems((a) => [...a, { id, page, kind: 'text', x, y, text: 'Texto', size: textSize, color: colors.text }])
      setSelected(id)
      setTool('select')
    } else if (tool === 'image' || tool === 'signature') {
      const pending = tool === 'image' ? pendingImg : pendingSig
      if (!pending) return
      setItems((a) => [...a, { id, page, kind: 'image', x: Math.min(x, 0.7), y: Math.min(y, 0.9), w: 0.3, ratio: pending.ratio, src: pending.src }])
      setSelected(id)
      setTool('select')
    } else if (tool === 'rect' || tool === 'highlight' || tool === 'redact') {
      overlay.current!.setPointerCapture(e.pointerId)
      drag.current = { mode: 'draw', id, sx: x, sy: y }
      setItems((a) => [...a, { id, page, kind: tool, x, y, w: 0, h: 0, color: tool === 'redact' ? '#000000' : colors[tool] }])
      setSelected(id)
    } else if (tool === 'pen') {
      overlay.current!.setPointerCapture(e.pointerId)
      drag.current = { mode: 'draw', id, sx: x, sy: y }
      setItems((a) => [...a, { id, page, kind: 'pen', points: [[x, y]], color: colors.pen, width: penWidth }])
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
    const outline = it.id === selected ? 'outline outline-2 outline-offset-1 outline-brand' : ''
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
      <span onPointerDown={(e) => grabHandle(e, it)} className="absolute -bottom-2 -right-2 h-3.5 w-3.5 cursor-nwse-resize pointer-coarse:-bottom-3 pointer-coarse:-right-3 pointer-coarse:h-6 pointer-coarse:w-6 rounded-sm border border-white bg-brand" />
    )
    if (it.kind === 'text') {
      return (
        <div key={it.id} onPointerDown={(e) => grab(e, it)} style={{ ...style, fontSize: it.size * info.scale, color: it.color, lineHeight: 1.2, whiteSpace: 'pre' }} className={`absolute cursor-move font-sans ${outline}`}>
          {it.text || <span className="text-ink/45">Escribe aquí</span>}
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
    setImageFile(f)
    setPendingImg(f ? await readImage(f) : undefined)
  }

  const pageItems = items.filter((i) => i.page === page)
  const edits = items.filter((i): i is EditItem => i.kind === 'edit')
  const removals = items.filter((i): i is RemoveGraphic => i.kind === 'remove')
  const lost = [...new Set(edits.flatMap((e) => unsupportedChars(joinRuns(e.runs))))]
  const toolButtons = ['select' as const, ...tools.filter((t) => t !== 'select')]

  // lo que se está ajustando: el elemento elegido o, si no hay, los valores con que se creará el siguiente
  const target = sel && (tool === 'select' || sel.kind === tool) ? sel : undefined
  const optKind: Paint | undefined = target ? (isPaint(target.kind) ? target.kind : undefined) : isPaint(tool) ? tool : undefined
  const setColor = (kind: Paint, c: string) => {
    setColors((all) => ({ ...all, [kind]: c }))
    if (target?.kind === kind) patch(target.id, { color: c })
  }
  const sizeNow = target?.kind === 'text' ? target.size : textSize
  const widthNow = target?.kind === 'pen' ? target.width : penWidth
  const colorNow = optKind ? (target && 'color' in target ? target.color : colors[optKind]) : '#000000'

  const toolbar = (
    <div role="toolbar" aria-label="Herramientas" className={wide ? 'grid grid-cols-2 gap-1.5' : 'flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'}>
      {toolButtons.map((t) => {
        const { label, icon: Icon } = META[t]
        const on = tool === t
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            onClick={() => setTool(t)}
            className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition ${wide ? '' : 'shrink-0'} ${on ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-white text-ink/80 hover:border-brand hover:text-brand'}`}
          >
            <Icon size={16} /> {label}
          </button>
        )
      })}
    </div>
  )

  const sigStep = tool === 'signature' && (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
      <li className={`flex items-center gap-1.5 ${pendingSig ? 'text-ink/55' : 'text-brand'}`}>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white ${pendingSig ? 'bg-lime !text-ink' : 'bg-brand'}`}>{pendingSig ? <CheckCircle2 size={13} /> : 1}</span> Crea tu firma
      </li>
      <li aria-hidden className="text-ink/45">→</li>
      <li className={`flex items-center gap-1.5 ${pendingSig ? 'text-brand' : 'text-ink/55'}`}>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white ${pendingSig ? 'bg-brand' : 'bg-ink/30'}`}>2</span> Toca la página donde va
      </li>
    </ol>
  )

  const controls = (
    <>
      {tool !== 'signature' && <p className="text-xs leading-snug text-ink/60">{GUIDE[tool]}</p>}

      {tool === 'edittext' && (
        <>
          {blocks[page] && !blocks[page].length && <Notice kind="warn">Esta página no tiene texto editable. Si es un escaneo, usa antes OCR.</Notice>}
          {!blocks[page] && pdf && <p className="flex items-center gap-2 text-xs text-ink/60"><Loader2 size={14} className="animate-spin text-brand" /> Leyendo el texto de la página…</p>}
          {removals.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {removals.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-xl border border-line bg-paper p-2 text-xs">
                  <span className="flex-1 font-medium">{{ line: 'Raya', shape: 'Forma', image: 'Imagen' }[r.what]} quitada (página {r.page})</span>
                  <button onClick={() => remove(r.id)} aria-label="Deshacer este cambio" title="Deshacer este cambio" className="rounded-md p-1.5 hover:bg-white"><Undo2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {edits.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {edits.map((e) => (
                <li key={e.id} className="flex items-start gap-2 rounded-xl border border-line bg-paper p-2 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink/45 line-through" title={e.orig}>{e.orig}</span>
                    <span className="block truncate font-medium" title={joinRuns(e.runs)}>{joinRuns(e.runs) || '(borrado)'}</span>
                  </span>
                  <button onClick={() => remove(e.id)} aria-label="Deshacer este cambio" title="Deshacer este cambio" className="rounded-md p-1.5 hover:bg-white"><Undo2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {lost.length > 0 && <Notice kind="warn">Estas letras no se pueden guardar en este PDF y saldrán como «?»: {lost.join(' ')}</Notice>}
          <p className="text-[11px] leading-snug text-ink/45">El texto nuevo usa la fuente estándar más parecida (Helvetica, Times o Courier).</p>
        </>
      )}

      {tool === 'image' && (
        <div className="flex flex-col gap-2">
          <ImagePicker file={imageFile} onChange={onImageFile} />
          {pendingImg && <p className="text-sm font-medium text-brand">Pulsa la página para colocarla.</p>}
        </div>
      )}

      {tool === 'signature' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand/25 bg-brand/5 p-3">
          {sigStep}
          {pendingSig && !changingSig ? (
            <div className="flex items-center gap-3 rounded-xl bg-white p-2">
              <span className="flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white"><img src={pendingSig.src} alt="Tu firma" className="max-h-full max-w-full" /></span>
              <span className="min-w-0 flex-1 text-xs font-medium text-ink/70">Firma lista. Toca la página donde va.</span>
              <Button size="sm" variant="secondary" onClick={() => setChangingSig(true)}>Cambiar</Button>
            </div>
          ) : (
            <SignaturePad onDone={(src, ratio) => { setPendingSig({ src, ratio }); setChangingSig(false) }} />
          )}
        </div>
      )}

      {optKind && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{target ? 'Elemento elegido' : `Ajustes de ${META[tool].label.toLowerCase()}`}</span>
            {target && <Button size="sm" variant="danger" icon={Trash2} onClick={() => remove(target.id)}>Eliminar</Button>}
          </div>
          {target?.kind === 'text' && (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Texto
              <textarea autoFocus={wide} rows={2} className={inputCls} value={target.text} onChange={(e) => patch(target.id, { text: e.target.value })} />
            </label>
          )}
          {optKind === 'text' && (
            <NumberField label="Tamaño" unit="pt" min={6} max={120} value={sizeNow} onChange={(n) => { setTextSize(n); if (target?.kind === 'text') patch(target.id, { size: n }) }} />
          )}
          <ColorField label="Color" palette={PALETTE} value={colorNow} onChange={(c) => setColor(optKind, c)} />
          {optKind === 'pen' && (
            <Slider label="Grosor" min={1} max={12} value={widthNow} onChange={(n) => { setPenWidth(n); if (target?.kind === 'pen') patch(target.id, { width: n }) }} />
          )}
        </div>
      )}

      {!optKind && target && (
        <Button size="sm" variant="danger" icon={Trash2} onClick={() => remove(target.id)}>Eliminar elemento</Button>
      )}
    </>
  )

  return (
    <Workspace
      main={
        error ? <Notice kind="error">{error}</Notice> : (
          <div className="flex flex-col items-center gap-3">
            {!wide && (
              <div className="sticky top-16 z-20 -mx-2 w-[calc(100%+1rem)] border-b border-line bg-white/95 px-2 pt-1 backdrop-blur">
                {toolbar}
              </div>
            )}
            {!wide && <div className="flex w-full flex-col gap-3">{controls}</div>}
            <PagePager page={page} total={numPages || 1} onChange={setPage} />
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
          {wide && toolbar}
          {wide && controls}
          <p className="text-xs font-medium text-ink/60">{plural(items.length)}</p>
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
