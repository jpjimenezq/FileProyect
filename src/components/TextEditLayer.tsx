import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PenLine, Trash2 } from 'lucide-react'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type { PageInfo } from './PageCanvas'
import type { EditItem, Item, RemoveGraphic } from '../lib/pdf/annotate'
import type { Graphic, GraphicsInfo } from '../lib/pdf/graphics'
import { FAMILY_CSS, analyzeBox, canvasMeasure, joinRuns, runsFromDom } from '../lib/pdf/textedit'
import type { EditRun } from '../lib/pdf/textedit'
import { layoutBlock } from '../lib/pdf/paragraphs'
import type { LayoutLine, TextBlock } from '../lib/pdf/paragraphs'

const uid = () => Math.random().toString(36).slice(2)

// Medidas de las fuentes de pantalla (Arial, Times, Courier) para colocar la línea base dentro de la caja de una línea
const ASC = 0.905
const DESC = 0.212

interface Active { block: TextBlock; runs: EditRun[]; bg: string; existing?: EditItem; point: { x: number; y: number } }

const runStyle = (r: EditRun, scale: number): CSSProperties => ({
  fontFamily: FAMILY_CSS[r.family], fontWeight: r.bold ? 700 : 400, fontStyle: r.italic ? 'italic' : 'normal', fontSize: r.size * scale, color: r.color,
})

/** Arriba de una caja de línea (alto `lineHeight`) para que su línea base caiga en `baseline` (px) */
const topFor = (baseline: number, size: number, lineHeight: number) => baseline - ((lineHeight - size * (ASC + DESC)) / 2 + size * ASC)

/** Tapa del bloque original: oculta el texto de la página mientras se edita o una vez editado */
function Cover({ l, bg, info }: { l: { x: number; y: number; w: number; h: number }; bg: string; info: PageInfo }) {
  const pad = 1 * info.scale
  return <div className="pointer-events-none absolute" style={{ left: l.x * info.width - pad, top: l.y * info.height - pad, width: l.w * info.width + pad * 2, height: l.h * info.height + pad * 2, background: bg }} />
}

/** El texto ya editado, línea a línea tal como se guardará */
function StaticText({ item, info }: { item: EditItem; info: PageInfo }) {
  return (
    <>
      {item.layout.map((ln: LayoutLine, i) => {
        const size = Math.max(...ln.runs.map((r) => r.size), 1)
        return (
          <div
            key={i}
            className="pointer-events-none"
            style={{
              position: 'absolute', left: item.x * info.width, top: topFor(ln.baseline * info.height, size * info.scale, size * info.scale), lineHeight: `${size * info.scale}px`,
              whiteSpace: 'pre', wordSpacing: ln.ws ? `${ln.ws * info.scale}px` : undefined, transform: item.k !== 1 ? `scaleX(${item.k})` : undefined, transformOrigin: '0 0',
            }}
          >
            {ln.runs.map((r, j) => <span key={j} style={runStyle(r, info.scale)}>{r.text}</span>)}
          </div>
        )
      })}
    </>
  )
}

/** El texto del bloque, editable allí mismo con la letra, el tamaño y el color de la página */
function Editor({ active, info, onDone }: { active: Active; info: PageInfo; onDone: (runs: EditRun[] | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const cancelled = useRef(false)
  const finished = useRef(false)
  const { block } = active

  useLayoutEffect(() => {
    const el = ref.current!
    el.replaceChildren(...active.runs.map((r, i) => {
      const span = document.createElement('span')
      span.dataset.run = String(i)
      span.textContent = r.text
      Object.assign(span.style, { fontFamily: FAMILY_CSS[r.family], fontWeight: r.bold ? '700' : '400', fontStyle: r.italic ? 'italic' : 'normal', fontSize: `${r.size * info.scale}px`, color: r.color, lineHeight: '0' })
      return span
    }))
    el.focus()
    // el cursor queda donde se hizo clic
    const sel = window.getSelection()
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
    let range: Range | null = null
    if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(active.point.x, active.point.y)
    else if (doc.caretPositionFromPoint) {
      const p = doc.caretPositionFromPoint(active.point.x, active.point.y)
      if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset) }
    }
    if (!range || !el.contains(range.startContainer)) { range = document.createRange(); range.selectNodeContents(el); range.collapse(false) }
    range.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = () => {
    if (finished.current) return
    finished.current = true
    onDone(cancelled.current ? null : runsFromDom(ref.current!, active.runs))
  }

  const size = block.size * info.scale
  const lineHeight = block.multi ? block.lineGap * info.scale : size
  const style: CSSProperties = {
    position: 'absolute', left: block.x * info.width, top: topFor(block.baselines[0] * info.height, size, lineHeight), lineHeight: `${lineHeight}px`,
    background: active.bg, transform: block.k !== 1 ? `scaleX(${block.k})` : undefined, transformOrigin: '0 0',
    ...(block.multi
      ? { whiteSpace: 'pre-wrap', width: (block.w * info.width) / block.k, textAlign: block.justify ? 'justify' : 'left', textAlignLast: 'left', overflowWrap: 'anywhere' }
      : { whiteSpace: 'pre' }),
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label="Texto del párrafo"
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); ref.current?.blur() }
        else if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; ref.current?.blur() }
        e.stopPropagation()
      }}
      onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s*[\r\n]+\s*/g, ' ')) }}
      onDrop={(e) => e.preventDefault()}
      className="z-10 cursor-text outline outline-2 outline-offset-2 outline-brand"
      style={style}
    />
  )
}

interface Props {
  info: PageInfo
  blocks: TextBlock[]
  /** Elementos de la página actual (los de texto editado se dibujan aquí) */
  items: Item[]
  setItems: Dispatch<SetStateAction<Item[]>>
  page: number
  /** Si está elegida la herramienta de editar texto: los párrafos se pueden pulsar */
  enabled: boolean
  canvas: HTMLCanvasElement | null
  /** Rayas, formas e imágenes de la página */
  graphics?: GraphicsInfo
  /** Escribir sobre una raya (el texto empieza al comienzo de la raya) */
  onWrite?: (g: Graphic) => void
}

const WHAT_LABEL = { line: 'Raya', shape: 'Forma', image: 'Imagen' } as const

export function TextEditLayer({ info, blocks, items, setItems, page, enabled, canvas, graphics, onWrite }: Props) {
  const [active, setActive] = useState<Active>()
  const [picked, setPicked] = useState<string>()
  const removed = items.filter((i): i is RemoveGraphic => i.kind === 'remove' && i.page === page)
  const edits = items.filter((i): i is EditItem => i.kind === 'edit' && i.page === page)

  const start = (block: TextBlock, existing: EditItem | undefined, e: React.MouseEvent) => {
    let bg = existing?.bg ?? '#ffffff'
    let color = '#000000'
    if (!existing && canvas) {
      try {
        const ctx = canvas.getContext('2d')!
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const found = analyzeBox(data.data, canvas.width, canvas.height, { x: block.x * canvas.width, y: block.y * canvas.height, w: block.w * canvas.width, h: block.h * canvas.height })
        bg = found.bg
        color = found.color
      } catch { /* lienzo no legible: fondo blanco y texto negro */ }
    }
    const runs = existing ? existing.runs : block.runs.map((r) => ({ ...r, color }))
    setActive({ block, runs: runs.length ? runs : [{ ...block.runs[0], color, text: '' }], bg, existing, point: { x: e.clientX, y: e.clientY } })
  }

  const done = (runs: EditRun[] | null) => {
    const a = active
    setActive(undefined)
    if (!a || !runs) return
    const { block, existing } = a
    if (joinRuns(runs) === block.text) {
      if (existing) setItems((all) => all.filter((i) => i.id !== existing.id))
      return
    }
    const item: EditItem = {
      id: existing?.id ?? uid(), page, kind: 'edit', line: block.id, x: block.x, y: block.y, w: block.w, h: block.h, k: block.k, W: block.W, H: block.H,
      bg: a.bg, orig: block.text, runs, layout: layoutBlock(block, runs, canvasMeasure), cut: block.cut,
    }
    setItems((all) => (existing ? all.map((i) => (i.id === existing.id ? item : i)) : [...all, item]))
  }

  const blockOf = (e: EditItem) => blocks.find((b) => b.id === e.line)

  const sampleBg = (g: { x: number; y: number; w: number; h: number }) => {
    if (!canvas) return '#ffffff'
    try {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      return analyzeBox(data.data, canvas.width, canvas.height, { x: g.x * canvas.width, y: g.y * canvas.height, w: g.w * canvas.width, h: g.h * canvas.height }).bg
    } catch { return '#ffffff' }
  }

  /** Quita el dibujo elegido de la página */
  const removeGraphic = (g: Graphic) => {
    if (!graphics) return
    const item: RemoveGraphic = {
      id: uid(), page, kind: 'remove', what: g.kind, x: g.x, y: g.y, w: g.w, h: g.h, bg: sampleBg(g),
      gfx: { via: g.via, ord: g.ord, paintsTotal: graphics.paintsTotal, drawsTotal: graphics.drawsTotal },
    }
    setItems((all) => [...all, item])
    setPicked(undefined)
  }

  // Supr o Retroceso quitan el dibujo elegido
  useEffect(() => {
    if (!picked || !graphics) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return
      const g = graphics.items.find((x) => x.id === picked)
      if (g) { e.preventDefault(); removeGraphic(g) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, graphics])

  const visible = (graphics?.items ?? []).filter((g) => !removed.some((r) => r.gfx.via === g.via && r.gfx.ord === g.ord))

  return (
    <>
      {edits.map((e) => (
        <div key={e.id}>
          <Cover l={e} bg={e.bg} info={info} />
          {active?.existing?.id !== e.id && <StaticText item={e} info={info} />}
          {enabled && active?.existing?.id !== e.id && blockOf(e) && (
            <div className="absolute cursor-text hover:bg-brand/5" style={{ left: e.x * info.width, top: e.y * info.height, width: Math.max(e.w, 0.02) * info.width, height: e.h * info.height }} onClick={(ev) => start(blockOf(e)!, e, ev)} />
          )}
        </div>
      ))}

      {enabled && blocks.filter((b) => !edits.some((e) => e.line === b.id) && active?.block.id !== b.id).map((b) => (
        <div
          key={b.id}
          role="button"
          aria-label={`Editar «${b.text.slice(0, 80)}»`}
          className="absolute cursor-text rounded-[2px] outline-1 outline-offset-1 outline-brand/0 transition hover:bg-brand/5 hover:outline hover:outline-brand/60 pointer-coarse:outline pointer-coarse:outline-brand/25"
          style={{ left: b.x * info.width, top: b.y * info.height, width: b.w * info.width, height: b.h * info.height }}
          onClick={(ev) => start(b, undefined, ev)}
        />
      ))}

      {enabled && visible.map((g) => {
        const on = picked === g.id
        const left = g.x * info.width
        const top = g.y * info.height
        const w = g.w * info.width
        const h = g.h * info.height
        const bar = 6 // grosor de la zona donde se puede pulsar una raya o un borde
        const edges = g.kind === 'shape' && !g.filled && w > 24 && h > 24
        const hit = 'absolute cursor-pointer'
        const ring = on ? 'outline outline-2 outline-offset-1 outline-brand' : 'outline-1 outline-offset-1 outline-brand/0 hover:outline hover:outline-dashed hover:outline-brand/70'
        const pick = (ev: React.MouseEvent) => {
          ev.stopPropagation()
          setPicked(on ? undefined : g.id)
        }
        return (
          <div key={g.id}>
            {edges ? (
              <>
                <div className={`${hit} ${ring}`} style={{ left, top: top - bar / 2, width: w, height: bar }} onClick={pick} />
                <div className={`${hit} ${ring}`} style={{ left, top: top + h - bar / 2, width: w, height: bar }} onClick={pick} />
                <div className={`${hit} ${ring}`} style={{ left: left - bar / 2, top, width: bar, height: h }} onClick={pick} />
                <div className={`${hit} ${ring}`} style={{ left: left + w - bar / 2, top, width: bar, height: h }} onClick={pick} />
              </>
            ) : (
              <div
                role="button"
                aria-label={`${WHAT_LABEL[g.kind]}: pulsa para elegirla`}
                className={`${hit} ${ring} ${g.kind === 'line' ? '' : 'hover:bg-brand/5'}`}
                style={{ left: left - (g.kind === 'line' && w < h ? bar / 2 : 0), top: top - (g.kind === 'line' && h < w ? bar / 2 : 0), width: g.kind === 'line' && w < h ? Math.max(w, bar) : w, height: g.kind === 'line' && h < w ? Math.max(h, bar) : h }}
                onClick={pick}
              />
            )}
            {on && (
              <div className="absolute z-20 flex gap-1.5" style={{ left: Math.max(0, Math.min(left + w - 8, info.width - (g.kind === 'line' && onWrite ? 230 : 92))), top: Math.max(0, top - 32) }}>
                {g.kind === 'line' && onWrite && (
                  <button type="button" onClick={(ev) => { ev.stopPropagation(); setPicked(undefined); onWrite(g) }} className="flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white shadow-lg hover:bg-brand-dark">
                    <PenLine size={13} /> Escribir sobre la raya
                  </button>
                )}
                <button type="button" onClick={(ev) => { ev.stopPropagation(); removeGraphic(g) }} className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white shadow-lg hover:bg-red-600">
                  <Trash2 size={13} /> Quitar {WHAT_LABEL[g.kind].toLowerCase()}
                </button>
              </div>
            )}
          </div>
        )
      })}

      {active && (
        <>
          <Cover l={active.block} bg={active.bg} info={info} />
          <Editor key={active.block.id} active={active} info={info} onDone={done} />
        </>
      )}
    </>
  )
}
