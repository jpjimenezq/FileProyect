import { sameStyle } from './textedit'
import type { Cut, EditRun, RunStyle, TextLine } from './textedit'

/**
 * Párrafos: las líneas de texto que van seguidas y forman un bloque se editan juntas, y al escribir el texto se
 * reparte en líneas con el mismo ancho que tenía el párrafo (justificado si lo estaba).
 */

export interface TextBlock {
  id: string
  /** Caja del bloque entero, normalizada (0-1) sobre la página tal como se ve */
  x: number
  y: number
  w: number
  h: number
  W: number
  H: number
  /** Líneas base (normalizadas) de las líneas originales */
  baselines: number[]
  /** Distancia entre líneas, en puntos */
  lineGap: number
  /** Estrechamiento horizontal con que se reproduce la letra original con una fuente estándar */
  k: number
  justify: boolean
  /** Más de una línea: el texto se reparte al ancho del bloque; con una sola línea no se parte nunca */
  multi: boolean
  size: number
  runs: EditRun[]
  text: string
  cut?: Cut
}

export interface LayoutLine { baseline: number; ws: number; runs: EditRun[] }

type Measure = (text: string, style: RunStyle) => number

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? (s.length % 2 ? s[(s.length - 1) >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}
const mode = (values: number[]) => {
  const count = new Map<number, number>()
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1)
  let best: [number, number] | undefined
  for (const e of count) if (!best || e[1] > best[1]) best = e
  return best
}

const pushRun = (runs: EditRun[], r: EditRun) => {
  const last = runs[runs.length - 1]
  if (last && sameStyle(last, r)) last.text += r.text
  else runs.push({ ...r })
}

const lineSize = (l: TextLine) => Math.max(...l.runs.map((r) => r.size))
const right = (l: TextLine) => (l.x + l.w) * l.W
const left = (l: TextLine) => l.x * l.W
const base = (l: TextLine) => l.baseline * l.H

/** Une en una sola línea los trozos de una línea justificada con huecos muy anchos (p. ej. por una dirección de correo larga) */
export function mergeJustifiedRows(lines: TextLine[]): TextLine[] {
  if (lines.length < 4) return lines
  const lefts = mode(lines.map((l) => Math.round(left(l))))
  const maxW = Math.max(...lines.map((l) => l.w * l.W))
  const rights = mode(lines.filter((l) => l.w * l.W >= 0.6 * maxW).map((l) => Math.round(right(l))))
  if (!lefts || !rights || lefts[1] < 3 || rights[1] < 3) return lines
  const domLeft = lefts[0]
  const domRight = rights[0]

  const rows: TextLine[][] = []
  for (const l of lines) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(base(l) - base(row[0])) < 0.35 * lineSize(l)) row.push(l)
    else rows.push([l])
  }
  const out: TextLine[] = []
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    if (row.length < 2) { out.push(...row); continue }
    const gaps = row.slice(1).map((l, i) => left(l) - right(row[i]))
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length)
    const size = Math.max(...row.map(lineSize))
    const spansBlock = Math.abs(left(row[0]) - domLeft) <= 2.5 && Math.abs(right(row[row.length - 1]) - domRight) <= 3
    if (!spansBlock || mean > 6.5 * size || sd > 0.35 * mean) { out.push(...row); continue }

    const runs: EditRun[] = []
    row.forEach((seg, i) => {
      seg.runs.forEach((r, j) => pushRun(runs, { ...r, text: (i > 0 && j === 0 ? ' ' : '') + r.text }))
    })
    const first = row[0]
    const last = row[row.length - 1]
    const cuts = row.map((s) => s.cut)
    out.push({
      ...first,
      w: (right(last) - left(first)) / first.W,
      k: median(row.map((s) => s.k)),
      runs, text: runs.map((r) => r.text).join(''),
      cut: cuts.every(Boolean)
        ? { total: cuts[0]!.total, ops: cuts.flatMap((c) => c!.ops), complete: cuts.every((c) => c!.complete) }
        : undefined,
    })
  }
  return out
}

const MARKER = /^(?:[•·▪◦○●■–—*-]|\d{1,3}[.)]|[a-zA-Z][.)]|[ivxIVX]{1,4}[.)])\s/

interface Para { lines: TextLine[]; maxW: number }

/** ¿La línea `next` sigue el párrafo `p`? */
function continues(p: Para, next: TextLine): boolean {
  const prev = p.lines[p.lines.length - 1]
  const size = Math.max(lineSize(prev), lineSize(next))
  if (Math.abs(lineSize(prev) - lineSize(next)) >= 1) return false
  const gap = base(next) - base(prev)
  if (gap < 0.85 * size || gap > 1.75 * size) return false
  if (MARKER.test(next.text)) return false
  // mismo margen izquierdo, o primera línea con sangría
  const same = Math.abs(left(next) - left(prev)) <= 0.6 * size
  const indented = p.lines.length === 1 && left(prev) - left(next) > 0.4 * size && left(prev) - left(next) <= 3.5 * size
  if (!same && !indented) return false
  // la línea anterior llega casi hasta el borde derecho (si no, el párrafo terminaba ahí)
  const w = prev.w * prev.W
  return w >= 0.75 * Math.max(p.maxW, next.w * next.W)
}

/** Une las líneas de un párrafo en tramos de estilo: salvo el guion de fin de línea, se separan con un espacio */
function joinLines(lines: TextLine[]): EditRun[] {
  const runs: EditRun[] = []
  lines.forEach((l, i) => {
    l.runs.forEach((r, j) => {
      let text = r.text
      if (i > 0 && j === 0) {
        const prev = runs[runs.length - 1]?.text ?? ''
        if (!/-$/.test(prev) || /^[A-ZÁÉÍÓÚÑ]/.test(text)) text = ' ' + text
      }
      pushRun(runs, { ...r, text })
    })
  })
  return runs
}

/** Agrupa las líneas de la página en párrafos (y deja sueltas las que no forman uno) */
export function groupParagraphs(input: TextLine[]): TextBlock[] {
  const lines = mergeJustifiedRows(input)
  const sorted = [...lines].sort((a, b) => base(a) - base(b) || a.x - b.x)
  const paras: Para[] = []
  for (const l of sorted) {
    let best: Para | undefined
    let bestGap = Infinity
    for (const p of paras) {
      if (!continues(p, l)) continue
      const g = base(l) - base(p.lines[p.lines.length - 1])
      if (g < bestGap) { best = p; bestGap = g }
    }
    if (best) { best.lines.push(l); best.maxW = Math.max(best.maxW, l.w * l.W) }
    else paras.push({ lines: [l], maxW: l.w * l.W })
  }

  return paras.map((p): TextBlock => {
    const ls = p.lines
    const first = ls[0]
    const x0 = Math.min(...ls.map(left))
    const x1 = Math.max(...ls.map(right))
    const top = Math.min(...ls.map((l) => l.y * l.H))
    const bottom = Math.max(...ls.map((l) => (l.y + l.h) * l.H))
    const size = Math.max(...ls.map(lineSize))
    const gaps = ls.slice(1).map((l, i) => base(l) - base(ls[i]))
    const nonLast = ls.slice(0, -1)
    const justify = nonLast.length >= 2 && nonLast.filter((l) => Math.abs(right(l) - x1) <= 1.5).length >= 0.75 * nonLast.length
    const cuts = ls.map((l) => l.cut)
    return {
      id: `${first.id}:p`,
      x: x0 / first.W, y: top / first.H, w: (x1 - x0) / first.W, h: (bottom - top) / first.H, W: first.W, H: first.H,
      baselines: ls.map((l) => l.baseline),
      lineGap: gaps.length ? median(gaps) : 1.2 * size,
      k: Math.min(...ls.map((l) => l.k)),
      justify, multi: ls.length > 1, size,
      runs: joinLines(ls),
      text: joinLines(ls).map((r) => r.text).join(''),
      cut: cuts.every(Boolean)
        ? { total: cuts[0]!.total, ops: cuts.flatMap((c) => c!.ops), complete: cuts.every((c) => c!.complete) }
        : undefined,
    }
  })
}

interface Tok { text: string; style: EditRun; space: boolean; w: number }

/** Reparte los tramos de texto en líneas del ancho dado (en puntos); la última línea no se justifica */
export function layoutRuns(runs: EditRun[], opts: { width: number; k: number; justify: boolean; measure: Measure }): { runs: EditRun[]; ws: number }[] {
  const { width, k, justify, measure } = opts
  const toks: Tok[] = []
  for (const r of runs) {
    for (const part of r.text.split(/(\s+)/)) {
      if (part === '') continue
      toks.push({ text: part, style: r, space: /^\s+$/.test(part), w: measure(part, r) * k })
    }
  }
  const lines: { toks: Tok[]; w: number }[] = [{ toks: [], w: 0 }]
  for (const t of toks) {
    let cur = lines[lines.length - 1]
    if (t.space) {
      if (cur.toks.length) { cur.toks.push(t); cur.w += t.w }
      continue
    }
    if (cur.toks.length && cur.w + t.w > width + 0.3) {
      while (cur.toks.length && cur.toks[cur.toks.length - 1].space) cur.w -= cur.toks.pop()!.w
      cur = { toks: [], w: 0 }
      lines.push(cur)
    }
    cur.toks.push(t)
    cur.w += t.w
  }
  const out: { runs: EditRun[]; ws: number }[] = []
  lines.forEach((ln, i) => {
    while (ln.toks.length && ln.toks[ln.toks.length - 1].space) ln.w -= ln.toks.pop()!.w
    if (!ln.toks.length) return
    const runsOut: EditRun[] = []
    for (const t of ln.toks) pushRun(runsOut, { ...t.style, text: t.text })
    const spaces = ln.toks.reduce((n, t) => n + (t.space ? t.text.length : 0), 0)
    const size = Math.max(...runsOut.map((r) => r.size))
    const last = i === lines.length - 1
    const ws = justify && !last && spaces > 0 && Number.isFinite(width) ? Math.min(2 * size, Math.max(0, (width - ln.w) / (spaces * k))) : 0
    out.push({ runs: runsOut, ws })
  })
  return out
}

/** Coloca el texto de un párrafo sobre las líneas base del original (y más abajo si hace falta) */
export function layoutBlock(block: Pick<TextBlock, 'baselines' | 'lineGap' | 'H' | 'W' | 'w' | 'justify' | 'multi' | 'k'>, runs: EditRun[], measure: Measure): LayoutLine[] {
  const lines = layoutRuns(runs, { width: block.multi ? block.w * block.W : Infinity, k: block.k, justify: block.justify, measure })
  const lastBase = block.baselines[block.baselines.length - 1]
  return lines.map((l, i) => ({
    baseline: i < block.baselines.length ? block.baselines[i] : lastBase + ((i - block.baselines.length + 1) * block.lineGap) / block.H,
    ws: l.ws,
    runs: l.runs,
  }))
}
