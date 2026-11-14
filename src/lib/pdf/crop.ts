import { PDFDocument } from 'pdf-lib'
import { visualToPdf } from './annotate'

/** Recuadro normalizado (0-1) sobre la página tal como se ve: origen arriba a la izquierda */
export type CropBox = { x: number; y: number; w: number; h: number }
/** Márgenes en milímetros que se quitan de cada lado */
export type Margins = { top: number; right: number; bottom: number; left: number }

const MM_PER_PT = 25.4 / 72
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const round1 = (n: number) => Math.round(n * 10) / 10

/** Tamaño de una página (en puntos del PDF) a milímetros */
export const ptToMm = (pt: number) => pt * MM_PER_PT

/** Márgenes en mm que deja un recuadro; sin recuadro, todos a 0 */
export function boxToMargins(box: CropBox | undefined, size: { w: number; h: number }): Margins {
  const b = box ?? { x: 0, y: 0, w: 1, h: 1 }
  return {
    left: round1(b.x * size.w),
    top: round1(b.y * size.h),
    right: round1((1 - b.x - b.w) * size.w),
    bottom: round1((1 - b.y - b.h) * size.h),
  }
}

/** Recuadro que resulta de quitar esos márgenes (mm); se queda siempre dentro de la página y con un mínimo de tamaño */
export function marginsToBox(m: Margins, size: { w: number; h: number }, min = 0.03): CropBox {
  let l = clamp01(m.left / size.w)
  let r = clamp01(m.right / size.w)
  let t = clamp01(m.top / size.h)
  let b = clamp01(m.bottom / size.h)
  if (l + r > 1 - min) { const k = (1 - min) / (l + r); l *= k; r *= k }
  if (t + b > 1 - min) { const k = (1 - min) / (t + b); t *= k; b *= k }
  return { x: l, y: t, w: 1 - l - r, h: 1 - t - b }
}

/** Recorta las páginas indicadas (números desde 1); sin lista, todas */
export async function cropSelectedPages(file: File, box: CropBox, pages?: number[]) {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const only = pages ? new Set(pages) : undefined
  doc.getPages().forEach((page, i) => {
    if (only && !only.has(i + 1)) return
    const a = visualToPdf(page, box.x, box.y)
    const b = visualToPdf(page, box.x + box.w, box.y + box.h)
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const width = Math.abs(a.x - b.x)
    const height = Math.abs(a.y - b.y)
    page.setMediaBox(x, y, width, height)
    page.setCropBox(x, y, width, height)
  })
  return doc.save()
}
