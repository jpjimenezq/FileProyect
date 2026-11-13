import { OPS, Util } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'

export interface HLine { y: number; x1: number; x2: number }
export interface VLine { x: number; y1: number; y2: number }
export interface Rulings { h: HLine[]; v: VLine[] }

const STROKES = new Set<number>([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
const FILLS = new Set<number>([OPS.fill, OPS.eoFill])
const TOL = 0.6
const apply = (m: number[], x: number, y: number): number[] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** Líneas horizontales y verticales dibujadas en la página (bordes de tablas, filetes y rectángulos finos) */
export async function extractRulings(page: PDFPageProxy): Promise<Rulings> {
  const ops = await page.getOperatorList()
  let ctm = [1, 0, 0, 1, 0, 0]
  const stack: number[][] = []
  const h: HLine[] = []
  const v: VLine[] = []

  const addSegment = (ax: number, ay: number, bx: number, by: number) => {
    if (Math.abs(ay - by) <= TOL && Math.abs(ax - bx) > 3) h.push({ y: (ay + by) / 2, x1: Math.min(ax, bx), x2: Math.max(ax, bx) })
    else if (Math.abs(ax - bx) <= TOL && Math.abs(ay - by) > 3) v.push({ x: (ax + bx) / 2, y1: Math.min(ay, by), y2: Math.max(ay, by) })
  }

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i] as unknown
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args as number[])
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm)
      const m = (args as number[][] | null)?.[0]
      if (m) ctm = Util.transform(ctm, m)
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm
    else if (fn === OPS.constructPath) {
      const [paint, data] = args as [number, ArrayLike<number>[]]
      const stroke = STROKES.has(paint)
      const fill = FILLS.has(paint) || paint === OPS.fillStroke || paint === OPS.eoFillStroke || paint === OPS.closeFillStroke || paint === OPS.closeEOFillStroke
      if (!stroke && !fill) continue
      const path = data?.[0]
      if (!path) continue
      // subtrazados: [0, x, y, 1, x, y, ..., 4]
      const subpaths: number[][][] = []
      let cur: number[][] = []
      let closed = false
      for (let k = 0; k < path.length;) {
        const code = path[k++]
        if (code === 0) { if (cur.length) subpaths.push(cur); cur = []; closed = false; cur.push(apply(ctm, path[k], path[k + 1])); k += 2 }
        else if (code === 1) { cur.push(apply(ctm, path[k], path[k + 1])); k += 2 }
        else if (code === 2) { k += 6; cur = [] }
        else if (code === 3) { k += 4; cur = [] }
        else if (code === 4) { closed = true }
        else break
        void closed
      }
      if (cur.length) subpaths.push(cur)
      for (const pts of subpaths) {
        if (pts.length < 2) continue
        const xs = pts.map((p) => p[0])
        const ys = pts.map((p) => p[1])
        const w = Math.max(...xs) - Math.min(...xs)
        const hgt = Math.max(...ys) - Math.min(...ys)
        if (stroke) {
          for (let k = 0; k + 1 < pts.length; k++) addSegment(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1])
          if (pts.length > 2) addSegment(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1])
        } else if (hgt <= 2.5 && w > 6) h.push({ y: (Math.min(...ys) + Math.max(...ys)) / 2, x1: Math.min(...xs), x2: Math.max(...xs) })
        else if (w <= 2.5 && hgt > 6) v.push({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y1: Math.min(...ys), y2: Math.max(...ys) })
        // un relleno grande es un fondo de color, no un borde
      }
    }
  }
  return { h, v }
}
