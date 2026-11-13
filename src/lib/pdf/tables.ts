import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Progress } from './ops'
import { extractRulings } from './rulings'
import { ruledTables } from './ruledTables'
import type { Rulings } from './rulings'

export interface Piece {
  str: string
  x: number
  y: number
  w: number
  size: number
}

/** Un trozo de una página: una tabla (filas con las mismas columnas) o líneas de texto suelto */
export interface Block {
  kind: 'table' | 'text'
  rows: string[][]
  /** Altura (y del PDF, de abajo a arriba) del primer renglón: sirve para ordenar los bloques de arriba abajo */
  y?: number
}

interface Cell { x: number; end: number; text: string }
const MARKER = /^(?:[•·▪◦○●■□–—*-]|o|\d{1,3}[.)]|[a-zA-Z][.)]|\(\d{1,3}\))$/
interface Line { y: number; size: number; cells: Cell[] }

/** Agrupa los fragmentos de texto en líneas (por altura) y, dentro de cada línea, en celdas (por huecos anchos) */
function toLines(pieces: Piece[]): Line[] {
  const sorted = pieces.filter((p) => p.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Piece[][] = []
  let lastY = Infinity
  for (const p of sorted) {
    if (rows.length && Math.abs(lastY - p.y) < Math.max(2, p.size * 0.4)) rows[rows.length - 1].push(p)
    else { rows.push([p]); lastY = p.y }
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x)
    const cells: Cell[] = []
    for (const p of row) {
      const last = cells[cells.length - 1]
      if (last && p.x - last.end < p.size * 0.9) { last.text += (p.x - last.end > p.size * 0.15 ? ' ' : '') + p.str; last.end = p.x + p.w }
      else cells.push({ x: p.x, text: p.str, end: p.x + p.w })
    }
    // una viñeta o un número de lista («•», «-», «1.», «a)») pegado a su texto no son dos columnas
    if (cells.length > 1 && MARKER.test(cells[0].text.trim())) {
      const [marker, ...rest] = cells
      cells.splice(0, cells.length, { x: marker.x, end: rest[rest.length - 1].end, text: `${marker.text.trim()} ${rest.map((c) => c.text).join(' ')}` })
    }
    return { y: row[0].y, size: Math.max(...row.map((p) => p.size)), cells }
  })
}

/**
 * Columnas de un bloque por «canales» de espacio en blanco: se cuenta cuántas celdas cubren cada punto horizontal y
 * los huecos que casi nadie cubre separan las columnas. Así valen las columnas alineadas a izquierda, a derecha o
 * centradas, y un título ancho que ocupa varias columnas no las funde.
 */
function columnRanges(lines: Line[]): [number, number][] {
  const cells = lines.flatMap((l) => (l.cells.length > 1 ? l.cells : []))
  if (!cells.length) return []
  const min = Math.floor(Math.min(...cells.map((c) => c.x)))
  const max = Math.ceil(Math.max(...cells.map((c) => c.end)))
  const cover = new Int32Array(max - min + 2)
  for (const c of cells) for (let i = Math.floor(c.x) - min; i < Math.ceil(c.end) - min; i++) cover[i]++
  const tolerance = Math.floor(lines.length * 0.15)
  const ranges: [number, number][] = []
  let start = -1
  let gap = 0
  for (let i = 0; i < cover.length; i++) {
    if (cover[i] > tolerance) {
      if (start < 0) start = i
      gap = 0
    } else if (start >= 0) {
      gap++
      if (gap >= 4) { ranges.push([start + min, i - gap + 1 + min]); start = -1; gap = 0 }
    }
  }
  if (start >= 0) ranges.push([start + min, max])
  return ranges
}

function buildTable(lines: Line[]): string[][] {
  const ranges = columnRanges(lines)
  const colOf = (x: number) => {
    const inside = ranges.findIndex(([a, b]) => x >= a - 2 && x <= b + 2)
    if (inside >= 0) return inside
    return ranges.reduce((best, [a], i) => (Math.abs(a - x) < Math.abs(ranges[best][0] - x) ? i : best), 0)
  }
  const out: string[][] = []
  for (const line of lines) {
    if (line.cells.length === 1 && out.length) {
      // línea suelta dentro de la tabla: continuación de una celda de la fila anterior
      const prev = out[out.length - 1]
      const i = colOf(line.cells[0].x)
      if (i > 0 && prev[i]) { prev[i] += ` ${line.cells[0].text}`; continue }
    }
    const row: string[] = new Array(ranges.length).fill('')
    for (const c of line.cells) {
      const i = colOf(c.x)
      row[i] = row[i] ? `${row[i]} ${c.text}` : c.text
    }
    out.push(row)
  }
  const used = ranges.map((_, i) => out.some((r) => r[i] !== ''))
  return out.map((r) => r.filter((_, i) => used[i]))
}

/** Separa lo que parece tabla (varias filas con varias celdas) del texto corrido */
export function piecesToBlocks(pieces: Piece[]): Block[] {
  const lines = toLines(pieces)
  const tab = lines.map((l) => l.cells.length >= 2)
  const blocks: Block[] = []
  const textRun: Line[] = []
  const flushText = () => {
    if (!textRun.length) return
    const rows: string[][] = []
    let prev: Line | undefined
    for (const l of textRun) {
      const text = l.cells.map((c) => c.text).join(' ')
      const sameParagraph = prev && prev.y - l.y <= prev.size * 1.6 && Math.abs(prev.size - l.size) < 1
      if (sameParagraph) rows[rows.length - 1][0] += ` ${text}`
      else rows.push([text])
      prev = l
    }
    blocks.push({ kind: 'text', rows, y: textRun[0].y })
    textRun.length = 0
  }

  let i = 0
  while (i < lines.length) {
    if (!tab[i]) { textRun.push(lines[i]); i++; continue }
    let j = i
    for (;;) {
      if (j + 1 < lines.length && tab[j + 1]) { j++; continue }
      // una línea suelta pegada entre dos filas de la tabla es texto que continúa una celda
      const close = (a: Line, b: Line) => a.y - b.y < a.size * 2.2
      if (j + 2 < lines.length && !tab[j + 1] && tab[j + 2] && close(lines[j], lines[j + 1]) && close(lines[j + 1], lines[j + 2])) { j += 2; continue }
      break
    }
    const slice = lines.slice(i, j + 1)
    const table = slice.filter((l) => l.cells.length >= 2).length >= 2 ? buildTable(slice) : undefined
    // sin al menos dos columnas reales no es una tabla (fórmulas, líneas sueltas…): se queda como texto
    if (table && Math.max(...table.map((r) => r.length)) >= 2) {
      flushText()
      blocks.push({ kind: 'table', rows: table, y: slice[0].y })
    } else {
      for (const l of slice) textRun.push(l)
    }
    i = j + 1
  }
  flushText()
  return blocks
}

/** Una página: tablas con bordes (por sus líneas), tablas sin bordes (por alineación) y texto, de arriba abajo */
export function pageToBlocks(pieces: Piece[], rulings?: Rulings): Block[] {
  const { blocks: ruled, rest } = rulings ? ruledTables(pieces, rulings) : { blocks: [], rest: pieces }
  return [...ruled, ...piecesToBlocks(rest)].sort((a, b) => (b.y ?? 0) - (a.y ?? 0))
}

/** Filas y columnas de toda la página, en orden (las tablas con sus columnas y el texto en una sola) */
export function piecesToGrid(pieces: Piece[]): string[][] {
  return piecesToBlocks(pieces).flatMap((b) => b.rows)
}

export async function extractBlocks(pdf: PDFDocumentProxy, onProgress?: Progress) {
  const pages: Block[][] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    const pieces = content.items.flatMap((it) =>
      'str' in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]) }] : [],
    )
    let rulings: Rulings | undefined
    try { rulings = await extractRulings(page) } catch { /* sin líneas: se usa solo la alineación del texto */ }
    pages.push(pageToBlocks(pieces, rulings))
    onProgress?.(n / pdf.numPages)
  }
  return pages
}

const NUMBER = /^-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?$|^-?\d+(?:[.,]\d+)?$/

export function toCell(text: string): string | number {
  const t = text.trim()
  const pct = /^(-?[\d.,]+)\s?%$/.exec(t)
  if (pct) { const n = toCell(pct[1]); return typeof n === 'number' ? n / 100 : text }
  if (!NUMBER.test(t)) return text
  // "1.234,56" (es) y "1,234.56" (en): el último separador es el decimal
  const lastDot = t.lastIndexOf('.')
  const lastComma = t.lastIndexOf(',')
  const decimal = lastDot > lastComma ? '.' : ','
  const digitsAfter = t.length - Math.max(lastDot, lastComma) - 1
  const hasDecimal = Math.max(lastDot, lastComma) >= 0 && (digitsAfter !== 3 || (lastDot >= 0 && lastComma >= 0))
  const normalized = hasDecimal ? t.split(decimal === '.' ? ',' : '.').join('').replace(decimal, '.') : t.replace(/[.,]/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : text
}

export interface ExcelOptions {
  /** Poner también el texto que no está en una tabla (si la página no tiene tablas, siempre se pone) */
  includeText: boolean
  /** Una hoja por página, o todas las páginas seguidas en una sola */
  layout: 'pages' | 'one'
}

/** Filas finales de cada hoja; null en una celda = sin valor */
export function blocksToSheets(pages: Block[][], { includeText, layout }: ExcelOptions): { name: string; rows: string[][] }[] {
  const docHasTable = pages.some((blocks) => blocks.some((b) => b.kind === 'table'))
  const pageRows = pages.map((blocks) => {
    // si el documento tiene tablas, las páginas sin ellas no generan hoja (salvo que se pida el texto)
    const kept = blocks.filter((b) => b.kind === 'table' || includeText || !docHasTable)
    const rows: string[][] = []
    kept.forEach((b, i) => {
      if (i && rows.length) rows.push([])
      rows.push(...b.rows)
    })
    return rows
  })
  if (layout === 'one') {
    const all: string[][] = []
    pageRows.forEach((rows, i) => { if (rows.length) { if (all.length) all.push([], []); all.push(...rows) } void i })
    return [{ name: 'Datos', rows: all }]
  }
  return pageRows.map((rows, i) => ({ name: `Página ${i + 1}`, rows })).filter((s) => s.rows.length || !docHasTable || includeText)
}

export async function sheetsToXlsx(sheets: { name: string; rows: string[][] }[]) {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name)
    const widths: number[] = []
    for (const row of sheet.rows) {
      const cells = row.map(toCell)
      ws.addRow(cells)
      cells.forEach((c, i) => { widths[i] = Math.max(widths[i] ?? 8, Math.min(60, String(c).length + 2)) })
    }
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
    sheet.rows.forEach((row, r) => row.forEach((v, c) => { if (typeof toCell(v) === 'number') ws.getCell(r + 1, c + 1).alignment = { horizontal: 'right' } }))
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

/** Las primeras filas de las primeras hojas, para ver de un vistazo qué se ha detectado */
export function describeSheets(sheets: { name: string; rows: string[][] }[], maxRows = 10): string {
  const clip = (s: string) => (s.length > 22 ? s.slice(0, 21) + '…' : s)
  return sheets
    .filter((s) => s.rows.some((r) => r.length))
    .slice(0, 2)
    .map((s) => {
      const shown = s.rows.slice(0, maxRows).map((r) => r.map(clip).join('  |  '))
      const more = s.rows.length > maxRows ? `\n… y ${s.rows.length - maxRows} filas más` : ''
      return `${s.name}\n${shown.join('\n')}${more}`
    })
    .join('\n\n')
}
