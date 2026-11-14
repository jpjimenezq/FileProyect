import { useEffect, useMemo, useState } from 'react'
import { Grid3x3, Image as ImageIcon, Square, Type } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { ImagePicker, useObjectUrl } from '../components/ImagePicker'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import { ColorField, Slider } from '../components/ui'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { addWatermark, pdfBlob, watermarkPositions } from '../lib/pdf/ops'
import type { TileDensity, WatermarkLayout } from '../lib/pdf/ops'

// Hoja A4 en puntos: la vista previa usa la misma función de posiciones que el PDF final
const PAGE_W = 595
const PAGE_H = 842

interface PreviewProps {
  mode: 'text' | 'image'
  text: string
  imageUrl?: string
  size: number
  color: string
  opacity: number
  rotation: number
  imageScale: number
  layout: WatermarkLayout
  density: TileDensity
}

let measureCanvas: HTMLCanvasElement | undefined
const measureText = (text: string, size: number) => {
  measureCanvas ??= document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')!
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`
  return { w: ctx.measureText(text).width, h: size * 0.72 }
}

/** Hoja de ejemplo con la marca de agua tal y como quedará */
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
  const marks = useMemo(() => {
    const dims = p.mode === 'text' ? measureText(p.text || ' ', p.size) : { w: PAGE_W * p.imageScale, h: PAGE_W * p.imageScale * ratio }
    return { dims, at: watermarkPositions(PAGE_W, PAGE_H, dims.w, dims.h, p.rotation, p.layout, p.density) }
  }, [p.mode, p.text, p.size, p.imageScale, ratio, p.rotation, p.layout, p.density])

  const show = p.mode === 'text' ? p.text.trim().length > 0 : Boolean(p.imageUrl)

  return (
    <div className="relative mx-auto overflow-hidden rounded border border-ink/30 bg-white shadow-md" style={{ width: W, height: PAGE_H * k }}>
      <div className="absolute inset-x-5 top-8 flex flex-col gap-2">
        {[100, 95, 100, 80, 100, 90, 100, 100, 70, 100, 85, 100, 92, 60].map((w, i) => <span key={i} className="block h-[4px] rounded bg-ink/10" style={{ width: `${w}%` }} />)}
      </div>
      <div className="pointer-events-none absolute inset-0">
        {show && marks.at.map((m, i) => (
          <span
            key={i}
            className="absolute whitespace-nowrap font-bold"
            style={{ left: m.x * k, top: (PAGE_H - m.y) * k, transform: `translate(-50%, -50%) rotate(${-p.rotation}deg)`, opacity: p.opacity, fontSize: p.size * k, color: p.color, lineHeight: 1 }}
          >
            {p.mode === 'text' ? p.text : <img src={p.imageUrl} alt="" style={{ width: marks.dims.w * k, maxWidth: 'none' }} />}
          </span>
        ))}
      </div>
    </div>
  )
}

function WatermarkWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const [mode, setMode] = useState<'text' | 'image'>('text')
  const [text, setText] = useState('CONFIDENCIAL')
  const [image, setImage] = useState<File>()
  const [size, setSize] = useState(60)
  const [color, setColor] = useState('#d32f2f')
  const [opacity, setOpacity] = useState(0.3)
  const [rotation, setRotation] = useState(45)
  const [imageScale, setImageScale] = useState(0.5)
  const [layout, setLayout] = useState<WatermarkLayout>('single')
  const [density, setDensity] = useState<TileDensity>('normal')
  const imageUrl = useObjectUrl(image)

  const ready = mode === 'text' ? text.trim().length > 0 : !!image

  return (
    <Workspace
      main={
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
          <PdfCard file={file} showPages onRemove={reset} />
          <div>
            <p className="mb-2 text-center text-sm font-semibold">Así se verá en cada página</p>
            <Preview mode={mode} text={text} imageUrl={imageUrl} size={size} color={color} opacity={opacity} rotation={rotation} imageScale={imageScale} layout={layout} density={density} />
          </div>
        </div>
      }
      side={
        <>
          <Segmented<'text' | 'image'>
            label="Tipo de marca"
            value={mode}
            onChange={setMode}
            options={[{ value: 'text', label: 'Texto', icon: Type }, { value: 'image', label: 'Imagen', icon: ImageIcon }]}
          />

          {mode === 'text' ? (
            <>
              <Field label="Texto de la marca"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} /></Field>
              <Slider label="Tamaño" value={size} onChange={setSize} min={14} max={140} unit="pt" />
              <ColorField label="Color" value={color} onChange={setColor} />
            </>
          ) : (
            <>
              <Field label="Imagen de la marca"><ImagePicker file={image} onChange={setImage} /></Field>
              <Slider label="Tamaño (ancho de la hoja)" value={imageScale} onChange={setImageScale} min={0.05} max={1} step={0.05} format={(v) => String(Math.round(v * 100))} unit="%" />
            </>
          )}

          <Field label="Colocación">
            <Segmented<WatermarkLayout>
              label="Colocación"
              value={layout}
              onChange={(next) => {
                setLayout(next)
                // repetida necesita marcas más pequeñas para que quepan varias en la hoja
                if (next === 'tile') { setSize((s) => Math.min(s, 28)); setImageScale((s) => Math.min(s, 0.25)) }
              }}
              options={[
                { value: 'single', label: 'Una sola', icon: Square, desc: 'Una marca en el centro de la hoja.' },
                { value: 'tile', label: 'Repetida', icon: Grid3x3, desc: 'Se repite por toda la hoja, como un estampado.' },
              ]}
            />
          </Field>
          {layout === 'tile' && (
            <Field label="Separación entre marcas">
              <Segmented<TileDensity>
                label="Separación"
                value={density}
                onChange={setDensity}
                options={[{ value: 'wide', label: 'Amplia' }, { value: 'normal', label: 'Normal' }, { value: 'tight', label: 'Cercana' }]}
              />
            </Field>
          )}

          <Slider label="Transparencia" value={Number((1 - opacity).toFixed(2))} onChange={(t) => setOpacity(Number((1 - t).toFixed(2)))} min={0} max={0.95} step={0.05} format={(v) => String(Math.round(v * 100))} unit="%" />
          <Field label="Inclinación">
            <div className="grid grid-cols-4 gap-1.5">
              {[[0, 'Recta'], [45, 'Diagonal'], [-45, 'Inversa'], [90, 'Vertical']].map(([deg, name]) => (
                <button key={deg} type="button" onClick={() => setRotation(Number(deg))} title={String(name)} className={`flex flex-col items-center gap-1 rounded-xl border-2 py-1.5 text-xs font-medium ${rotation === deg ? 'border-brand bg-brand/10 text-brand' : 'border-line hover:border-ink/30'}`}>
                  <span className="flex h-6 items-center"><span className="block h-1 w-6 rounded bg-current" style={{ transform: `rotate(${-Number(deg)}deg)` }} /></span>
                  {name}
                </button>
              ))}
            </div>
          </Field>
        </>
      }
      action={{
        label: 'Añadir marca de agua',
        disabled: !ready,
        onClick: () => run(async () => [{
          name: `${baseName(file)}_marca.pdf`,
          blob: pdfBlob(await addWatermark(file, { text: mode === 'text' ? text : undefined, image: mode === 'image' ? image : undefined, size, color, opacity, rotation, imageScale, layout, density })),
        }]),
      }}
    />
  )
}

export default function Watermark() {
  return <ToolFrame id="watermark" accept=".pdf">{(ctx) => <WatermarkWork {...ctx} />}</ToolFrame>
}
