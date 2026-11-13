import FormulaParser, { FormulaError } from 'fast-formula-parser'

export type NumFmt = '' | 'dec2' | 'int' | 'pct' | 'eur' | 'date'
export interface CellStyle {
  b?: boolean
  i?: boolean
  align?: 'left' | 'center' | 'right'
  color?: string
  bg?: string
  fmt?: NumFmt
}
/** `v` es lo que el usuario escribió; si empieza por «=» es una fórmula */
export interface Cell { v: string; s?: CellStyle }
export interface Sheet {
  name: string
  cells: Record<string, Cell>
  colW: Record<number, number>
}
export interface Workbook { sheets: Sheet[] }

export type Value = string | number | boolean | null | { error: string }

export const key = (r: number, c: number) => `${r},${c}`
export const parseKey = (k: string): [number, number] => { const [r, c] = k.split(','); return [Number(r), Number(c)] }

export const emptySheet = (name: string): Sheet => ({ name, cells: {}, colW: {} })
export const emptyBook = (): Workbook => ({ sheets: [emptySheet('Hoja 1')] })

export function colName(c: number): string {
  let n = c + 1
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}
export function colIndex(name: string): number {
  let n = 0
  for (const ch of name.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}
export const cellName = (r: number, c: number) => `${colName(c)}${r + 1}`

/** Extensión usada de una hoja (filas y columnas con contenido) */
export function usedSize(sheet: Sheet): { rows: number; cols: number } {
  let rows = 0
  let cols = 0
  for (const k in sheet.cells) {
    const [r, c] = parseKey(k)
    if (r + 1 > rows) rows = r + 1
    if (c + 1 > cols) cols = c + 1
  }
  return { rows, cols }
}

// ── Referencias en fórmulas ────────────────────────────────────────────────

/** referencia A1 con hoja opcional; evita las que van dentro de «texto entre comillas» */
const REF = /("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g

/** Aplica `fn` a cada referencia de celda; `fn` devuelve la referencia nueva o `null` para #REF! */
function mapRefs(formula: string, fn: (sheet: string | undefined, r: number, c: number, absR: boolean, absC: boolean) => { r: number; c: number } | null): string {
  return formula.replace(REF, (_m, str, sheetPart, dc, col, dr, row) => {
    if (str) return str
    const sheet = sheetPart ? String(sheetPart).slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : undefined
    const res = fn(sheet, Number(row) - 1, colIndex(col), dr === '$', dc === '$')
    if (!res) return `${sheetPart ?? ''}#REF!`
    return `${sheetPart ?? ''}${dc}${colName(res.c)}${dr}${res.r + 1}`
  })
}

/** Copiar una fórmula desplazándola: las referencias relativas se mueven, las $absolutas no */
export function offsetFormula(formula: string, dr: number, dc: number): string {
  return mapRefs(formula, (_s, r, c, absR, absC) => {
    const nr = absR ? r : r + dr
    const nc = absC ? c : c + dc
    return nr < 0 || nc < 0 ? null : { r: nr, c: nc }
  })
}

/**
 * Ajusta las referencias de una fórmula cuando se insertan (`delta` > 0) o se borran (`delta` < 0) filas o columnas
 * de la hoja `target`. `own` es la hoja donde vive la fórmula (las referencias sin nombre apuntan a ella).
 */
export function shiftFormula(formula: string, own: string, target: string, axis: 'row' | 'col', at: number, delta: number): string {
  return mapRefs(formula, (sheet, r, c) => {
    if ((sheet ?? own) !== target) return { r, c }
    const v = axis === 'row' ? r : c
    let n = v
    if (delta > 0) { if (v >= at) n = v + delta }
    else if (v >= at && v < at - delta) return null
    else if (v >= at - delta) n = v + delta
    return axis === 'row' ? { r: n, c } : { r, c: n }
  })
}

// ── Cálculo ────────────────────────────────────────────────────────────────

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i

/** Interpreta lo escrito en una celda que no es fórmula */
export function parseLiteral(raw: string): string | number | boolean | null {
  if (raw === '') return null
  const t = raw.trim()
  if (NUMBER.test(t)) return Number(t)
  if (/^(true|verdadero)$/i.test(t)) return true
  if (/^(false|falso)$/i.test(t)) return false
  return raw
}

const cycle: Value = { error: '#CICLO!' }

/** Calcula bajo demanda (y recuerda) el valor de cada celda de un libro; detecta referencias circulares */
export class Evaluator {
  private cache = new Map<string, Value>()
  private busy = new Set<string>()
  private cycled = new Set<string>()
  private parser: FormulaParser

  constructor(private book: Workbook) {
    this.parser = new FormulaParser({
      onCell: ({ sheet, row, col }) => this.raw(sheet, row - 1, col - 1),
      onRange: ({ sheet, from, to }) => {
        const s = this.find(sheet)
        const used = s ? usedSize(s) : { rows: 0, cols: 0 }
        const r2 = Math.min(to.row, Math.max(used.rows, from.row))
        const c2 = Math.min(to.col, Math.max(used.cols, from.col))
        const out: unknown[][] = []
        for (let r = from.row; r <= r2; r++) {
          const line: unknown[] = []
          for (let c = from.col; c <= c2; c++) line.push(this.raw(sheet, r - 1, c - 1))
          out.push(line)
        }
        return out
      },
    })
  }

  private find(name: string) { return this.book.sheets.find((s) => s.name === name) }

  /** valor para el motor de fórmulas: los errores se propagan como FormulaError */
  private raw(sheet: string, r: number, c: number): unknown {
    const v = this.value(sheet, r, c)
    if (v !== null && typeof v === 'object') return new FormulaError(v.error)
    return v
  }

  value(sheet: string, r: number, c: number): Value {
    const s = this.find(sheet)
    const cell = s?.cells[key(r, c)]
    if (!cell || cell.v === '') return null
    if (cell.v[0] !== '=' || cell.v.length < 2) return parseLiteral(cell.v)
    const id = `${sheet}!${r},${c}`
    const hit = this.cache.get(id)
    if (hit !== undefined) return hit
    if (this.busy.has(id)) { this.cycled.add(id); return cycle }
    this.busy.add(id)
    let out: Value
    try {
      const res = this.parser.parse(cell.v.slice(1), { sheet, row: r + 1, col: c + 1 })
      out = this.cycled.delete(id) ? cycle : normalize(res)
    } catch (e) {
      out = { error: e instanceof FormulaError ? e.error : '#ERROR!' }
    } finally {
      this.busy.delete(id)
    }
    this.cache.set(id, out)
    return out
  }
}

function normalize(res: unknown): Value {
  if (Array.isArray(res)) return normalize(Array.isArray(res[0]) ? res[0][0] : res[0])
  if (res instanceof FormulaError) return { error: res.error }
  if (typeof res === 'number') return Number.isFinite(res) ? res : { error: '#NUM!' }
  if (res === undefined || res === null) return null
  if (typeof res === 'string' || typeof res === 'boolean') return res
  return String(res)
}

// ── Presentación ───────────────────────────────────────────────────────────

const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
export const serialToDate = (n: number) => new Date(EXCEL_EPOCH + Math.round(n * 86400000))

export function formatValue(v: Value, fmt: NumFmt = ''): string {
  if (v === null) return ''
  if (typeof v === 'object') return v.error
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO'
  if (typeof v === 'string') return v
  switch (fmt) {
    case 'int': return v.toLocaleString('es-ES', { maximumFractionDigits: 0 })
    case 'dec2': return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 'pct': return `${(v * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`
    case 'eur': return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
    case 'date': return serialToDate(v).toLocaleDateString('es-ES', { timeZone: 'UTC' })
    default: return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10).replace('.', ',')
  }
}

// ── Estructura: insertar y borrar filas y columnas ─────────────────────────

/** Devuelve un libro nuevo con filas/columnas insertadas (`count` > 0) o borradas (`count` < 0) en la hoja `si` */
export function resize(book: Workbook, si: number, axis: 'row' | 'col', at: number, count: number): Workbook {
  const target = book.sheets[si].name
  const sheets = book.sheets.map((sheet, i) => {
    const cells: Record<string, Cell> = {}
    for (const k in sheet.cells) {
      const [r, c] = parseKey(k)
      let nr = r
      let nc = c
      if (i === si) {
        const v = axis === 'row' ? r : c
        let n = v
        if (count > 0) { if (v >= at) n = v + count }
        else if (v >= at && v < at - count) continue
        else if (v >= at - count) n = v + count
        if (axis === 'row') nr = n
        else nc = n
      }
      const cell = sheet.cells[k]
      cells[key(nr, nc)] = cell.v[0] === '=' ? { ...cell, v: shiftFormula(cell.v, sheet.name, target, axis, at, count) } : cell
    }
    let colW = sheet.colW
    if (i === si && axis === 'col') {
      colW = {}
      for (const c of Object.keys(sheet.colW).map(Number)) {
        if (count > 0) colW[c >= at ? c + count : c] = sheet.colW[c]
        else if (c < at) colW[c] = sheet.colW[c]
        else if (c >= at - count) colW[c + count] = sheet.colW[c]
      }
    }
    return { ...sheet, cells, colW }
  })
  return { sheets }
}

// ── CSV ────────────────────────────────────────────────────────────────────

export function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/, 5).join('\n')
  const counts = [',', ';', '\t'].map((d) => [d, head.split(d).length - 1] as const)
  return counts.sort((a, b) => b[1] - a[1])[0][0]
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

export function toCsv(rows: string[][], delimiter = ','): string {
  const esc = (s: string) => (s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return rows.map((r) => r.map(esc).join(delimiter)).join('\r\n')
}

export function sheetFromRows(name: string, rows: string[][]): Sheet {
  const cells: Record<string, Cell> = {}
  rows.forEach((line, r) => line.forEach((v, c) => { if (v !== '') cells[key(r, c)] = { v } }))
  return { name, cells, colW: {} }
}

/** Valores mostrados (no las fórmulas) para exportar a CSV */
export function sheetToRows(book: Workbook, si: number): string[][] {
  const ev = new Evaluator(book)
  const sheet = book.sheets[si]
  const { rows, cols } = usedSize(sheet)
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    const v = ev.value(sheet.name, r, c)
    return typeof v === 'number' ? String(v) : formatValue(v)
  }))
}
