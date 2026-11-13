import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Progress } from './ops'

export interface TextPiece {
  str: string
  x: number
  y: number
  size: number
}

interface Line {
  y: number
  size: number
  text: string
}

const BULLET = /^[•·▪‣◦●*–-]\s+/

/** Agrupa fragmentos de texto en líneas (de arriba abajo, de izquierda a derecha) */
function toLines(pieces: TextPiece[]): Line[] {
  const sorted = pieces.filter((p) => p.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; size: number; parts: TextPiece[] }[] = []
  for (const p of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - p.y) < Math.max(2, p.size * 0.4)) last.parts.push(p)
    else lines.push({ y: p.y, size: p.size, parts: [p] })
  }
  return lines.map((l) => {
    l.parts.sort((a, b) => a.x - b.x)
    return { y: l.y, size: Math.max(...l.parts.map((p) => p.size)), text: l.parts.map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim() }
  })
}

const mode = (values: number[]) => {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(Math.round(v), (counts.get(Math.round(v)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12
}

/** Markdown de cada página (el tamaño de letra "normal" se calcula sobre todo el documento) */
export function piecesToMarkdownPages(pages: TextPiece[][], plain = false): string[] {
  const body = mode(pages.flat().map((p) => p.size))

  return pages.map((pieces) => {
    const out: string[] = []
    const lines = toLines(pieces)
    let paragraph = ''
    const flush = () => { if (paragraph) { out.push(paragraph, ''); paragraph = '' } }

    lines.forEach((line, i) => {
      const prev = lines[i - 1]
      const ratio = line.size / body
      const heading = line.text.length < 120 && ratio >= 1.12 ? (ratio >= 1.6 ? '#' : ratio >= 1.3 ? '##' : '###') : ''
      if (heading) { flush(); out.push(plain ? line.text : `${heading} ${line.text}`, ''); return }
      if (BULLET.test(line.text)) { flush(); out.push(`${plain ? '•' : '-'} ${line.text.replace(BULLET, '')}`); return }
      if (/^\d+[.)]\s+/.test(line.text)) { flush(); out.push(line.text); return }
      const gap = prev ? prev.y - line.y : 0
      if (prev && gap > line.size * 1.9) flush()
      paragraph = paragraph.endsWith('-') ? paragraph.slice(0, -1) + line.text : paragraph ? `${paragraph} ${line.text}` : line.text
    })
    flush()
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  })
}

/** Convierte las páginas (ya extraídas como fragmentos) en Markdown con heurísticas de tamaño de letra */
export function piecesToMarkdown(pages: TextPiece[][]): string {
  return piecesToMarkdownPages(pages).join('\n\n').trim() + '\n'
}

export async function extractPieces(pdf: PDFDocumentProxy, onProgress?: Progress) {
  const pages: TextPiece[][] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent()
    pages.push(
      content.items.flatMap((it) => ('str' in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], size: Math.hypot(it.transform[2], it.transform[3]) }] : [])),
    )
    onProgress?.(n / pdf.numPages)
  }
  return pages
}

export async function pdfToMarkdown(pdf: PDFDocumentProxy, onProgress?: Progress) {
  return piecesToMarkdown(await extractPieces(pdf, onProgress))
}

/** Un texto Markdown por página, para enviarlo a la IA conservando la correspondencia con el PDF */
export async function pdfPageTexts(pdf: PDFDocumentProxy, onProgress?: Progress) {
  return piecesToMarkdownPages(await extractPieces(pdf, onProgress))
}

/** Texto plano de cada página (sin marcas de Markdown) */
export async function pdfPlainTextPages(pdf: PDFDocumentProxy, onProgress?: Progress) {
  return piecesToMarkdownPages(await extractPieces(pdf, onProgress), true)
}
