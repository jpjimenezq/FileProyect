import { OPS, Util } from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist'
import { darkPixels, invertPixels } from './effects'

export interface PageInfo {
  page: PDFPageProxy
  viewport: PageViewport
  /** número de página, desde 1 */
  n: number
}

/** Efecto sobre una página ya dibujada en un canvas; devuelve el canvas que se guardará */
export type PageEffect = (canvas: HTMLCanvasElement, info: PageInfo) => HTMLCanvasElement | Promise<HTMLCanvasElement>

/** Dibuja una página sobre fondo blanco (pdf.js deja transparente lo que no tiene contenido) */
export async function renderWhite(pdf: PDFDocumentProxy, n: number, scale: number) {
  const page = await pdf.getPage(n)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return { canvas, info: { page, viewport, n } as PageInfo }
}

/** Antes y después de aplicar un efecto a la primera página, para enseñarlo antes de procesar todo el PDF */
export async function renderEffectPreview(pdf: PDFDocumentProxy, scale: number, effect: PageEffect) {
  const { canvas, info } = await renderWhite(pdf, 1, scale)
  const before = document.createElement('canvas')
  before.width = canvas.width
  before.height = canvas.height
  before.getContext('2d')!.drawImage(canvas, 0, 0)
  const after = await effect(canvas, info)
  return { before, after }
}

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Dónde hay imágenes en la página (en píxeles del canvas). Se recorren las operaciones de dibujo de pdf.js
 * siguiendo la matriz de transformación. Las imágenes que cubren casi toda la hoja (un escaneo) no cuentan:
 * en ese caso la imagen *es* la página.
 */
export async function imageRegions(info: PageInfo, canvasW: number, canvasH: number, maxCoverage = 0.7): Promise<Rect[]> {
  const ops = await info.page.getOperatorList()
  let ctm = info.viewport.transform as number[]
  const stack: number[][] = []
  const out: Rect[] = []
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
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      // la imagen ocupa el cuadrado unidad (0,0)-(1,1) del espacio actual
      const [a, b, c, d, e, f] = ctm
      const xs = [e, a + e, c + e, a + c + e]
      const ys = [f, b + f, d + f, b + d + f]
      const x = Math.max(0, Math.min(...xs))
      const y = Math.max(0, Math.min(...ys))
      const w = Math.min(canvasW, Math.max(...xs)) - x
      const h = Math.min(canvasH, Math.max(...ys)) - y
      if (w > 2 && h > 2 && (w * h) / (canvasW * canvasH) < maxCoverage) out.push({ x, y, w, h })
    }
  }
  return out
}

export type InvertMode = 'dark' | 'negative'

/**
 * - 'negative': invierte todos los colores.
 * - 'dark': modo oscuro. Da la vuelta a la luminosidad (fondo claro → oscuro, texto oscuro → claro) conservando el tono
 *   de los colores, y con `keepImages` deja las imágenes como estaban.
 */
export function invertEffect(mode: InvertMode, keepImages: boolean): PageEffect {
  return async (canvas, info) => {
    const ctx = canvas.getContext('2d')!
    const original = keepImages && mode === 'dark' ? document.createElement('canvas') : undefined
    if (original) {
      original.width = canvas.width
      original.height = canvas.height
      original.getContext('2d')!.drawImage(canvas, 0, 0)
    }
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    if (mode === 'negative') invertPixels(data.data)
    else darkPixels(data.data)
    ctx.putImageData(data, 0, 0)
    if (original) {
      for (const r of await imageRegions(info, canvas.width, canvas.height)) ctx.drawImage(original, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h)
    }
    return canvas
  }
}
