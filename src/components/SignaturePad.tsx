import { useRef, useState } from 'react'
import { inputCls } from './ToolFrame'

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
    c.lineWidth = 3
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
  const clear = () => { canvas.current!.getContext('2d')!.clearRect(0, 0, 400, 160); setEmpty(true); setTyped('') }

  const use = () => {
    const c = canvas.current!
    if (mode === 'type') {
      const g = c.getContext('2d')!
      g.clearRect(0, 0, c.width, c.height)
      g.fillStyle = '#111'
      g.font = 'italic 64px "Brush Script MT", "Segoe Script", cursive'
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
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 text-sm font-medium">
        {(['draw', 'type'] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); clear() }} className={`rounded-md py-1.5 ${mode === m ? 'bg-white shadow' : 'text-gray-600'}`}>{m === 'draw' ? 'Dibujar' : 'Escribir'}</button>
        ))}
      </div>
      {mode === 'type' && <input className={inputCls} placeholder="Tu nombre" value={typed} onChange={(e) => setTyped(e.target.value)} />}
      <canvas
        ref={canvas}
        width={400}
        height={160}
        onPointerDown={mode === 'draw' ? down : undefined}
        onPointerMove={mode === 'draw' ? move : undefined}
        onPointerUp={() => { drawing.current = false }}
        className={`w-full touch-none rounded-lg border border-dashed border-gray-400 bg-white ${mode === 'draw' ? 'cursor-crosshair' : 'hidden'}`}
      />
      <div className="flex gap-2 text-sm">
        <button className="flex-1 rounded-lg border border-gray-300 py-1.5 hover:bg-gray-50" onClick={clear}>Borrar</button>
        <button className="flex-1 rounded-lg bg-gray-800 py-1.5 text-white disabled:opacity-40" disabled={mode === 'draw' ? empty : !typed.trim()} onClick={use}>Usar firma</button>
      </div>
    </div>
  )
}
