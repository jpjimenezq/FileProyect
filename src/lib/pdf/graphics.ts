import { OPS, Util } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import { alphaOf } from './showops'

/** Un dibujo de la página que se puede quitar: una raya, una forma o una imagen (medidas normalizadas, 0-1, sobre la página tal como se ve) */
export interface Graphic {
  id: string
  kind: 'line' | 'shape' | 'image'
  x: number
  y: number
  w: number
  h: number
  /** Rellena su caja (un fondo, una imagen) o solo la dibuja con trazo (un borde, una raya) */
  filled: boolean
  /** Cómo se localiza en el contenido de la página: orden entre las instrucciones de cierre de trazado («paint») o entre los «Do» («draw») */
  via: 'paint' | 'draw'
  ord: number
}

/** Un uso de una imagen o de un formulario XObject en la página (instrucción «Do») */
export interface DrawInfo {
  ord: number
  kind: 'image' | 'form'
  /** Identidad del objeto: el mismo valor en varias páginas es el mismo dibujo */
  key: string
  x: number
  y: number
  w: number
  h: number
  alpha: number
}

export interface GraphicsInfo {
  items: Graphic[]
  draws: DrawInfo[]
  /** Cuántas instrucciones de cada tipo tiene el contenido de la página (para comprobar que se lee igual al guardar) */
  paintsTotal: number
  drawsTotal: number
}

type M = number[]
const nums = (a: unknown): number[] => {
  const list = Array.from(a as ArrayLike<unknown>)
  return list.length === 1 && typeof list[0] === 'object' ? Array.from(list[0] as ArrayLike<number>) : (list as number[])
}
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const STROKES = new Set<number>([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
const FILLS = new Set<number>([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
const IMAGES = new Set<number>([OPS.paintImageXObject, OPS.paintImageMaskXObject])

/** Dibujos de la página (rayas, formas e imágenes) con su posición, para elegirlos y quitarlos */
export async function analyzeGraphics(page: PDFPageProxy): Promise<GraphicsInfo> {
  const viewport = page.getViewport({ scale: 1 })
  const W = viewport.width
  const H = viewport.height
  const list = await page.getOperatorList({ annotationMode: 0 } as never)
  let ctm = viewport.transform as M
  const stack: { ctm: M; alpha: number }[] = []
  let alpha = 1
  let depth = 0
  const draws: DrawInfo[] = []
  let paintOrd = 0
  let drawOrd = 0
  const items: Graphic[] = []

  const add = (g: Omit<Graphic, 'id'>, x0: number, y0: number, x1: number, y1: number, kind: Graphic['kind']) => {
    const w = x1 - x0
    const h = y1 - y0
    if (w < 0.5 && h < 0.5) return
    if (w * h > 0.6 * W * H) return // un fondo o una página escaneada entera
    if (kind === 'shape' && w < 3 && h < 3) return
    items.push({ ...g, id: `${g.via}:${g.ord}`, kind, x: x0 / W, y: y0 / H, w: w / W, h: h / H })
  }

  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i]
    const a = list.argsArray[i] as unknown
    if (fn === OPS.save) stack.push({ ctm, alpha })
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; alpha = s.alpha } }
    else if (fn === OPS.setGState) { const al = alphaOf(a); if (al !== undefined) alpha = al }
    else if (fn === OPS.transform) ctm = Util.transform(ctm, nums(a))
    else if (fn === OPS.paintFormXObjectBegin) {
      const ord = drawOrd
      if (depth === 0) drawOrd++
      stack.push({ ctm, alpha })
      const m = (a as unknown[] | null)?.[0]
      if (m) ctm = Util.transform(ctm, nums(m))
      if (depth === 0) {
        const bb = (a as unknown[] | null)?.[1]
        const box = bb ? nums(bb) : undefined
        let rect = { x: 0, y: 0, w: 0, h: 0 }
        if (box && box.length === 4) {
          const pts = [apply(ctm, box[0], box[1]), apply(ctm, box[2], box[1]), apply(ctm, box[0], box[3]), apply(ctm, box[2], box[3])]
          const xs = pts.map((p) => p[0])
          const ys = pts.map((p) => p[1])
          rect = { x: Math.min(...xs) / W, y: Math.min(...ys) / H, w: (Math.max(...xs) - Math.min(...xs)) / W, h: (Math.max(...ys) - Math.min(...ys)) / H }
        }
        const key = `form:${m ? nums(m).map((n) => Math.round(n * 10) / 10).join(',') : ''}:${box ? box.map((n) => Math.round(n)).join(',') : ''}`
        draws.push({ ord, kind: 'form', key, ...rect, alpha })
      }
      depth++
    } else if (fn === OPS.paintFormXObjectEnd) { const s = stack.pop(); if (s) { ctm = s.ctm; alpha = s.alpha } depth = Math.max(0, depth - 1) }
    else if (depth > 0) continue
    else if (IMAGES.has(fn)) {
      const ord = drawOrd++
      const pts = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)]
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      const w = Math.max(...xs) - Math.min(...xs)
      const h = Math.max(...ys) - Math.min(...ys)
      draws.push({ ord, kind: 'image', key: `img:${(a as unknown[])[1]}x${(a as unknown[])[2]}`, x: Math.min(...xs) / W, y: Math.min(...ys) / H, w: w / W, h: h / H, alpha })
      if (w >= 4 && h >= 4) add({ kind: 'image', filled: true, via: 'draw', ord, x: 0, y: 0, w: 0, h: 0 }, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 'image')
    } else if (fn === OPS.constructPath) {
      const ord = paintOrd++
      const [paint, data] = a as [number, ArrayLike<number>[]]
      const stroke = STROKES.has(paint)
      const fill = FILLS.has(paint)
      const path = data?.[0]
      if ((!stroke && !fill) || !path) continue
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      const grow = (x: number, y: number) => {
        const [px, py] = apply(ctm, x, y)
        x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py)
      }
      for (let k = 0; k < path.length;) {
        const code = path[k++]
        if (code === 0 || code === 1) { grow(path[k], path[k + 1]); k += 2 }
        else if (code === 2) { grow(path[k], path[k + 1]); grow(path[k + 2], path[k + 3]); grow(path[k + 4], path[k + 5]); k += 6 }
        else if (code === 3) { grow(path[k], path[k + 1]); grow(path[k + 2], path[k + 3]); k += 4 }
        else if (code !== 4) break
      }
      if (!Number.isFinite(x0)) continue
      const thin = Math.min(x1 - x0, y1 - y0) <= 2.5 && Math.max(x1 - x0, y1 - y0) >= 6
      add({ kind: thin ? 'line' : 'shape', filled: fill && !thin, via: 'paint', ord, x: 0, y: 0, w: 0, h: 0 }, x0, y0, x1, y1, thin ? 'line' : 'shape')
    }
  }
  return { items, draws, paintsTotal: paintOrd, drawsTotal: drawOrd }
}
