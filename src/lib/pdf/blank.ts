import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderPage } from './render'

/** Sensibilidad: fracción mínima de píxeles "con tinta" para que una página cuente como con contenido */
export const BLANK_THRESHOLD = { strict: 0.0002, normal: 0.002, lenient: 0.01 }
export type BlankLevel = keyof typeof BLANK_THRESHOLD

/** Fracción de píxeles oscuros (luminancia < 215) de una imagen RGBA */
export function inkRatio(rgba: Uint8ClampedArray | Uint8Array): number {
  let ink = 0
  const total = rgba.length / 4
  for (let i = 0; i < rgba.length; i += 4) {
    // un píxel transparente cuenta como blanco
    const a = rgba[i + 3] / 255
    const lum = (rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11) * a + 255 * (1 - a)
    if (lum < 215) ink++
  }
  return total ? ink / total : 0
}

/** Analiza todas las páginas y devuelve la fracción de tinta de cada una */
export async function pageInk(pdf: PDFDocumentProxy, onProgress?: (fraction: number) => void) {
  const canvas = document.createElement('canvas')
  const out: number[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    await renderPage(pdf, n, canvas, 220)
    const ctx = canvas.getContext('2d')!
    // se pinta primero un fondo blanco: pdf.js deja las zonas sin contenido transparentes
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    out.push(inkRatio(data.data))
    onProgress?.(n / pdf.numPages)
  }
  return out
}
