import { useEffect, useMemo, useState } from 'react'
import { Image as ImageIcon, Type } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { ImagePicker, useObjectUrl } from '../components/ImagePicker'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { addStamp, stampCenter } from '../lib/pdf/layout'
import type { StampPages, StampPosition } from '../lib/pdf/layout'
import { pdfBlob } from '../lib/pdf/ops'

const PAGE_W = 595
const PAGE_H = 842
const POSITIONS: StampPosition[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']
const PRESETS = ['APROBADO', 'BORRADOR', 'CONFIDENCIAL', 'COPIA', 'URGENTE', 'PAGADO']
const COLORS = ['#16a34a', '#d32f2f', '#2563eb', '#16152b']

let measure: HTMLCanvasElement | undefined
const textWidth = (text: string, size: number) => {
  measure ??= document.createElement('canvas')
  const ctx = measure.getContext('2d')!
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`
  return ctx.measureText(text).width
}

interface PreviewProps {
  mode: 'text' | 'image'
  text: string
  imageUrl?: string
  size: number
  color: string
  opacity: number
  rotation: number
  position: StampPosition
  frame: boolean
  imageScale: number
  onPick: (p: StampPosition) => void
}

/** Hoja con 9 puntos para elegir la posición; el sello se ve en la posición elegida */
function Preview(p: PreviewProps) {
  const [ratio, setRatio] = useState(1)
  useEffect(() => {
    if (!p.imageUrl) return
    const img = new Image()
    img.onload = () => setRatio(img.naturalHeight / img.naturalWidth)
    img.src = p.imageUrl
  }, [p.imageUrl])

  const W = 210
  const k = W / PAGE_W
  const geo = useMemo(() => {
    const w = p.mode === 'text' ? textWidth(p.text || ' ', p.size) : PAGE_W * p.imageScale
    const h = p.mode === 'text' ? p.size * 0.72 : w * ratio
    const pad = p.frame && p.mode === 'text' ? p.size * 0.45 : 0
    const t = (p.rotation * Math.PI) / 180
    const fw = w + pad * 2
    const fh = h + pad * 2
    const bw = Math.abs(fw * Math.cos(t)) + Math.abs(fh * Math.sin(t))
    const bh = Math.abs(fw * Math.sin(t)) + Math.abs(fh * Math.cos(t))
    return { w, h, fw, fh, c: stampCenter(p.position, PAGE_W, PAGE_H, bw, bh, 24) }
  }, [p.mode, p.text, p.size, p.rotation, p.position, p.frame, p.imageScale, ratio])

  const show = p.mode === 'text' ? p.text.trim().length > 0 : Boolean(p.imageUrl)
  return (
    <div className="relative mx-auto overflow-hidden rounded border border-ink/30 bg-white shadow-md" style={{ width: W, height: PAGE_H * k }}>
      <div className="absolute inset-x-5 top-8 flex flex-col gap-2">
        {[100, 95, 100, 80, 100, 90, 100, 100, 70, 100, 85, 100, 92, 60].map((w, i) => <span key={i} className="block h-[4px] rounded bg-ink/10" style={{ width: `${w}%` }} />)}
      </div>
      {/* puntos para elegir la posición */}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
        {POSITIONS.map((pos) => (
          <button key={pos} type="button" aria-label={`Posición ${pos}`} aria-pressed={p.position === pos} onClick={() => p.onPick(pos)} className="flex items-center justify-center">
            <span className={`h-2.5 w-2.5 rounded-full border-2 ${p.position === pos ? 'border-brand bg-brand' : 'border-dashed border-ink/30 hover:border-brand'}`} />
          </button>
        ))}
      </div>
      {show && (
        <div
          className="pointer-events-none absolute flex items-center justify-center font-bold"
          style={{
            left: geo.c.x * k, top: (PAGE_H - geo.c.y) * k, width: geo.fw * k, height: geo.fh * k,
            transform: `translate(-50%, -50%) rotate(${-p.rotation}deg)`, opacity: p.opacity, color: p.color,
            border: p.frame && p.mode === 'text' ? `${Math.max(1.5, 2.5 * k)}px solid ${p.color}` : undefined, fontSize: p.size * k, lineHeight: 1, whiteSpace: 'nowrap',
          }}
        >
          {p.mode === 'text' ? p.text : <img src={p.imageUrl} alt="" style={{ width: geo.w * k, maxWidth: 'none' }} />}
        </div>
      )}
    </div>
  )
}

function StampWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const [mode, setMode] = useState<'text' | 'image'>('text')
  const [text, setText] = useState('APROBADO')
  const [image, setImage] = useState<File>()
  const [size, setSize] = useState(36)
  const [color, setColor] = useState('#16a34a')
  const [opacity, setOpacity] = useState(0.85)
  const [rotation, setRotation] = useState(-12)
  const [position, setPosition] = useState<StampPosition>('tr')
  const [pages, setPages] = useState<StampPages>('first')
  const [frame, setFrame] = useState(true)
  const [imageScale, setImageScale] = useState(0.25)
  const imageUrl = useObjectUrl(image)
  const ready = mode === 'text' ? text.trim().length > 0 : !!image

  return (
    <Workspace
      main={
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
          <PdfCard file={file} showPages onRemove={reset} />
          <div>
            <p className="mb-2 text-center text-sm font-semibold">Haz clic en un punto para colocarlo</p>
            <Preview mode={mode} text={text} imageUrl={imageUrl} size={size} color={color} opacity={opacity} rotation={rotation} position={position} frame={frame} imageScale={imageScale} onPick={setPosition} />
          </div>
        </div>
      }
      side={
        <>
          <Segmented<'text' | 'image'> label="Tipo de sello" value={mode} onChange={setMode} options={[{ value: 'text', label: 'Texto', icon: Type }, { value: 'image', label: 'Imagen', icon: ImageIcon }]} />

          {mode === 'text' ? (
            <>
              <Field label="Texto del sello">
                <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} />
                <span className="flex flex-wrap gap-1.5">
                  {PRESETS.map((t) => <button key={t} type="button" onClick={() => setText(t)} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold hover:border-brand hover:text-brand">{t}</button>)}
                  <button type="button" onClick={() => setText(new Date().toLocaleDateString('es-ES'))} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold hover:border-brand hover:text-brand">Fecha de hoy</button>
                </span>
              </Field>
              <Field label={`Tamaño: ${size}`}><input type="range" min={12} max={90} value={size} onChange={(e) => setSize(Number(e.target.value))} /></Field>
              <Field label="Color">
                <span className="flex gap-2">
                  {COLORS.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-ink' : 'border-white shadow'}`} style={{ background: c }} />)}
                  <input type="color" aria-label="Otro color" className="h-8 w-8 rounded-full border border-line" value={color} onChange={(e) => setColor(e.target.value)} />
                </span>
              </Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={frame} onChange={(e) => setFrame(e.target.checked)} /> Con marco, como un sello</label>
            </>
          ) : (
            <>
              <Field label="Imagen del sello"><ImagePicker file={image} onChange={setImage} /></Field>
              <Field label={`Tamaño: ${Math.round(imageScale * 100)}% del ancho de la hoja`}><input type="range" min={0.05} max={0.8} step={0.05} value={imageScale} onChange={(e) => setImageScale(Number(e.target.value))} /></Field>
            </>
          )}

          <Field label="Inclinación">
            <Segmented<number> label="Inclinación" value={rotation} onChange={setRotation} options={[{ value: 0, label: 'Recta' }, { value: -12, label: 'Inclinada' }, { value: 90, label: 'Vertical' }]} />
          </Field>
          <Field label={`Transparencia: ${Math.round((1 - opacity) * 100)}%`}><input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></Field>
          <Field label="En qué páginas">
            <select className={inputCls} value={pages} onChange={(e) => setPages(e.target.value as StampPages)}>
              <option value="first">Solo la primera</option>
              <option value="last">Solo la última</option>
              <option value="all">Todas</option>
              <option value="odd">Las impares</option>
              <option value="even">Las pares</option>
            </select>
          </Field>
        </>
      }
      action={{
        label: 'Estampar',
        disabled: !ready,
        onClick: () => run(async () => [{
          name: `${baseName(file)}_sello.pdf`,
          blob: pdfBlob(await addStamp(file, { text: mode === 'text' ? text : undefined, image: mode === 'image' ? image : undefined, size, color, opacity, rotation, position, margin: 24, pages, frame: frame && mode === 'text', imageScale })),
        }]),
      }}
    />
  )
}

export default function Stamp() {
  return <ToolFrame id="stamp" accept=".pdf">{(ctx) => <StampWork {...ctx} />}</ToolFrame>
}
