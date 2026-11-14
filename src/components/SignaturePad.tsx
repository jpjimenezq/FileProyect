import { useRef, useState } from 'react'
import { Pencil, Type } from 'lucide-react'
import { inputCls } from './ToolFrame'
import { Segmented } from './Illustrate'
import { Button } from './ui'

/** Crea una firma (dibujada o escrita) y la devuelve como PNG transparente en data URL */
export function SignaturePad({ onDone }: { onDone: (dataUrl: string, ratio: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [typed, setTyped] = useState('')
  const [empty, setEmpty] = useState(true)

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * canvas.current!.width, y: ((e.clientY - r.top) / r.height) * canvas.current!.height }
  }
  const ctx = () => {
    const c = canvas.current!.getContext('2d')!
    c.lineWidth = 4
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.strokeStyle = '#111'
    return c
  }

  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const { x, y } = pos(e)
    const c = ctx()
    c.beginPath()
    c.moveTo(x, y)
    c.lineTo(x + 0.1, y)
    c.stroke()
    setEmpty(false)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const { x, y } = pos(e)
    const c = ctx()
    c.lineTo(x, y)
    c.stroke()
  }
  const clear = () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setEmpty(true); setTyped('') }

  const use = () => {
    const c = canvas.current!
    if (mode === 'type') {
      const g = c.getContext('2d')!
      g.clearRect(0, 0, c.width, c.height)
      g.fillStyle = '#111'
      g.font = 'italic 96px "Brush Script MT", "Segoe Script", cursive'
      g.textBaseline = 'middle'
      g.fillText(typed, 16, c.height / 2, c.width - 32)
    }
    // recorta los márgenes vacíos
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (data.data[(y * c.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    if (x1 <= x0) return
    const out = document.createElement('canvas')
    out.width = x1 - x0 + 8
    out.height = y1 - y0 + 8
    out.getContext('2d')!.putImageData(data, 4 - x0, 4 - y0)
    onDone(out.toDataURL('image/png'), out.height / out.width)
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Cómo crear la firma"
        value={mode}
        onChange={(m) => { setMode(m); clear() }}
        options={[{ value: 'draw', label: 'Dibujar', icon: Pencil }, { value: 'type', label: 'Escribir', icon: Type }]}
      />
      {mode === 'type' && (
        <>
          <input className={inputCls} placeholder="Tu nombre" aria-label="Tu nombre" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <div className="flex h-24 items-center overflow-hidden rounded-2xl border-2 border-ink/25 bg-white px-4 text-[44px] italic leading-none text-ink" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>
            {typed || <span className="text-base not-italic text-ink/45" style={{ fontFamily: 'inherit' }}>Así se verá tu firma</span>}
          </div>
        </>
      )}
      <div className={`relative ${mode === 'draw' ? '' : 'hidden'}`}>
        <canvas
          ref={canvas}
          width={600}
          height={200}
          aria-label="Lienzo para dibujar tu firma"
          onPointerDown={mode === 'draw' ? down : undefined}
          onPointerMove={mode === 'draw' ? move : undefined}
          onPointerUp={() => { drawing.current = false }}
          onPointerCancel={() => { drawing.current = false }}
          className="block aspect-[3/1] w-full cursor-crosshair touch-none rounded-2xl border-2 border-ink/25 bg-white"
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink/45">Firma aquí con el dedo o el ratón</span>}
        <span className="pointer-events-none absolute inset-x-5 bottom-8 border-b border-dashed border-ink/20" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={clear}>Borrar</Button>
        <Button variant="primary" disabled={mode === 'draw' ? empty : !typed.trim()} onClick={use}>Usar firma</Button>
      </div>
    </div>
  )
}
