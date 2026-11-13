import { PDFDocument, PDFName } from 'pdf-lib'
import type { Progress } from './ops'

/** Todas las páginas una debajo de otra en una sola página larga (todas con el ancho de la más ancha) */
export async function toSinglePage(file: File, onProgress?: Progress) {
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false })
  // pdf-lib no incrusta páginas sin contenido (hojas en blanco)
  for (const p of src.getPages()) if (!p.node.Contents()) p.node.set(PDFName.of('Contents'), src.context.register(src.context.stream('')))
  const out = await PDFDocument.create()
  const embedded = await out.embedPdf(src, src.getPageIndices())
  const width = Math.max(...embedded.map((p) => p.width))
  const heights = embedded.map((p) => p.height * (width / p.width))
  const total = heights.reduce((a, b) => a + b, 0)
  // los visores tienen un límite de 14.400 pt por lado
  if (total > 14400) throw new Error('El documento es demasiado largo para una sola página (máximo unas 17 páginas A4).')
  const page = out.addPage([width, total])
  let y = total
  embedded.forEach((p, i) => {
    y -= heights[i]
    page.drawPage(p, { x: 0, y, width, height: heights[i] })
    onProgress?.((i + 1) / embedded.length)
  })
  return out.save()
}

// ── Ajuste de imagen ────────────────────────────────────────────────────
export interface Adjust {
  /** 1 = sin cambio */
  brightness: number
  /** 1 = sin cambio */
  contrast: number
  gray: boolean
}

/** Misma fórmula que los filtros CSS brightness() y contrast(), para que la vista previa coincida */
export function adjustPixels(rgba: Uint8ClampedArray | Uint8Array, a: Adjust) {
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) lut[v] = (v * a.brightness - 128) * a.contrast + 128
  for (let i = 0; i < rgba.length; i += 4) {
    if (a.gray) {
      const g = rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722
      rgba[i] = rgba[i + 1] = rgba[i + 2] = g
    }
    rgba[i] = lut[rgba[i]]
    rgba[i + 1] = lut[rgba[i + 1]]
    rgba[i + 2] = lut[rgba[i + 2]]
  }
}

export function adjustCanvas(canvas: HTMLCanvasElement, a: Adjust) {
  const ctx = canvas.getContext('2d')!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  adjustPixels(data.data, a)
  ctx.putImageData(data, 0, 0)
  return canvas
}

// ── Recorte automático ──────────────────────────────────────────────────
export interface Box { x: number; y: number; w: number; h: number }

/** Rectángulo (fracciones 0-1, origen arriba a la izquierda) que contiene todos los píxeles con tinta; null si no hay */
export function inkBounds(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 235): Box | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = rgba[i + 3] / 255
      const lum = (rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11) * a + 255 * (1 - a)
      if (lum < threshold) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  return { x: x0 / width, y: y0 / height, w: (x1 - x0 + 1) / width, h: (y1 - y0 + 1) / height }
}

/** Une varios recuadros y añade un margen (fracción de la hoja), sin salirse de ella */
export function unionBox(boxes: Box[], pad = 0.015): Box | null {
  if (!boxes.length) return null
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad)
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const x1 = Math.min(1, Math.max(...boxes.map((b) => b.x + b.w)) + pad)
  const y1 = Math.min(1, Math.max(...boxes.map((b) => b.y + b.h)) + pad)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
