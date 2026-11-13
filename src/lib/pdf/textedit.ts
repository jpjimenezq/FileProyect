import { Util } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import { analyzeShows } from './showops'
import type { ShowInfo } from './showops'

/**
 * Edición de texto «en el sitio»: se leen las líneas de texto de la página y cada una se puede reescribir.
 * Al guardar, la línea original se tapa con el color del fondo y se escribe la nueva (ver annotate.ts).
 * Todas las medidas de línea van normalizadas (0-1) sobre la página tal como se ve, con el origen arriba a la izquierda.
 */

export type Family = 'sans' | 'serif' | 'mono'

export interface RunStyle { family: Family; bold: boolean; italic: boolean; size: number; color: string }
/** Un tramo de una línea con el mismo estilo; `size` está en puntos */
export interface EditRun extends RunStyle { text: string }

/** Qué instrucciones de texto del contenido de la página forman una línea, para poder quitarlas al reescribirla */
export interface Cut {
  /** Cuántas instrucciones de texto tiene la página (para comprobar que se lee igual al guardar) */
  total: number
  ops: { ord: number; advance: number }[]
  /** Las instrucciones cubren toda la línea y ninguna se sale de ella: al quitarlas no hace falta tapar nada */
  complete: boolean
}

/** Decide qué instrucciones de texto pertenecen a la línea (por su posición) y si la cubren entera */
export function cutFor(line: { x: number; w: number; baseline: number; W: number; H: number; runs: { size: number }[] }, shows: ShowInfo[], total: number): Cut | undefined {
  const x0 = line.x * line.W
  const x1 = (line.x + line.w) * line.W
  const base = line.baseline * line.H
  const size = Math.max(...line.runs.map((r) => r.size))
  const inside: ShowInfo[] = []
  let partial = false
  for (const s of shows) {
    if (Math.abs(s.y - base) > 0.35 * size) continue
    const lo = Math.min(s.x, s.endX)
    const hi = Math.max(s.x, s.endX)
    // un espacio suelto al final de la línea (justificada) también es de ella
    if (s.removable && s.blank && lo >= x0 - 1.5 && lo <= x1 + 6) { inside.push(s); continue }
    if (hi < x0 - 1 || lo > x1 + 1) continue // no toca esta línea
    if (!s.removable || lo < x0 - 1.5 || hi > x1 + 2.5) { partial = true; continue }
    inside.push(s)
  }
  const visible = inside.filter((s) => !s.blank)
  if (!visible.length) return undefined
  const first = Math.min(...visible.map((s) => Math.min(s.x, s.endX)))
  const last = Math.max(...visible.map((s) => Math.max(s.x, s.endX)))
  return {
    total,
    ops: inside.map((s) => ({ ord: s.ord, advance: s.advance })),
    complete: !partial && first <= x0 + 3 && last >= x1 - 3,
  }
}

export interface TextLine {
  id: string
  /** Caja que ocupa el texto original (para taparlo) */
  x: number
  y: number
  w: number
  h: number
  /** Posición vertical de la línea base */
  baseline: number
  /** Estrechamiento horizontal con que se reproduce la letra original con una fuente estándar (1 = sin cambio) */
  k: number
  /** Tamaño de la página en puntos */
  W: number
  H: number
  runs: EditRun[]
  text: string
  /** Cómo quitar el texto original del contenido de la página (si se pudo averiguar) */
  cut?: Cut
}

/** Pila de fuentes con las mismas medidas que las estándar del PDF (Helvetica, Times y Courier) */
export const FAMILY_CSS: Record<Family, string> = {
  sans: 'Arial, "Liberation Sans", Helvetica, sans-serif',
  serif: '"Times New Roman", "Liberation Serif", Times, serif',
  mono: '"Courier New", "Liberation Mono", Courier, monospace',
}

/** Fracción del tamaño de letra que hay de la línea base hacia arriba y hacia abajo en la caja que se tapa */
export const ASCENT = 0.85
export const DESCENT = 0.22

export function classifyFont(name: string | undefined, generic?: string, flags?: { bold?: boolean; italic?: boolean }) {
  const n = (name ?? '').replace(/^[A-Z]{6}\+/, '')
  const bold = flags?.bold || /bold|black|heavy|semibold|demi/i.test(n)
  const italic = flags?.italic || /italic|oblique|slanted/i.test(n)
  let family: Family = 'sans'
  if (/courier|mono|consolas|menlo|typewriter|lucida console|source ?code/i.test(n) || generic === 'monospace') family = 'mono'
  else if (!/sans|arial|helvetica|calibri|verdana|tahoma/i.test(n) && (/times|serif|georgia|garamond|palatino|cambria|minion|baskerville|bookman|century|roman|merriweather|lora/i.test(n) || generic === 'serif')) family = 'serif'
  return { family, bold: !!bold, italic: !!italic }
}

export interface RawItem { str: string; x: number; baseline: number; w: number; size: number; fontName: string }

type StyleOf = (fontName: string) => { family: Family; bold: boolean; italic: boolean }
type Measure = (text: string, style: RunStyle) => number

export const sameStyle = (a: RunStyle, b: RunStyle) => a.family === b.family && a.bold === b.bold && a.italic === b.italic && Math.abs(a.size - b.size) < 0.6

/** Agrupa los fragmentos de texto de una página en líneas, y cada línea en tramos de un mismo estilo */
export function groupLines(items: RawItem[], styleOf: StyleOf, measure: Measure, page: number, W: number, H: number): TextLine[] {
  const live = items.filter((i) => i.str !== '' && i.size > 0)
  live.sort((a, b) => a.baseline - b.baseline || a.x - b.x)

  // filas por altura de la línea base
  const rows: RawItem[][] = []
  for (const it of live) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(it.baseline - row[0].baseline) < Math.max(1.5, 0.35 * Math.max(it.size, row[0].size))) row.push(it)
    else rows.push([it])
  }

  const lines: TextLine[] = []
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    // una fila con un hueco muy ancho son dos bloques distintos (columnas, celdas); pdf.js rellena esos huecos
    // con un «espacio» muy ancho, que aquí también hace de separador
    const groups: RawItem[][] = []
    let broke = false
    for (const it of row) {
      if (/^\s+$/.test(it.str) && it.w > 1.6 * it.size) { broke = true; continue }
      const g = groups[groups.length - 1]
      const prev = g?.[g.length - 1]
      if (!broke && g && prev && it.x - (prev.x + prev.w) <= 1.6 * Math.max(it.size, prev.size)) g.push(it)
      else groups.push([it])
      broke = false
    }
    for (const g of groups) {
      const runs: EditRun[] = []
      let last: RawItem | undefined
      for (const it of g) {
        const style = { ...styleOf(it.fontName), size: Math.round(it.size * 10) / 10, color: '#000000' }
        let text = it.str
        if (last) {
          const gap = it.x - (last.x + last.w)
          const prevText = runs[runs.length - 1]?.text ?? ''
          if (gap > 0.2 * it.size && !/\s$/.test(prevText) && !/^\s/.test(text)) text = ` ${text}`
        } else if (/^\s+$/.test(text)) continue
        const run = runs[runs.length - 1]
        if (run && sameStyle(run, style)) run.text += text
        else runs.push({ ...style, text })
        last = it
      }
      if (!runs.length) continue
      runs[0].text = runs[0].text.replace(/^\s+/, '')
      runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '')
      const kept = runs.filter((r) => r.text !== '')
      const text = kept.map((r) => r.text).join('')
      if (!text.trim()) continue

      const first = g[0]
      const end = Math.max(...g.map((i) => i.x + i.w))
      const widthPt = Math.max(1, end - first.x)
      const natural = kept.reduce((sum, r) => sum + measure(r.text, r), 0)
      let k = natural > 0 ? widthPt / natural : 1
      k = Math.min(1.6, Math.max(0.5, k))
      if (Math.abs(k - 1) < 0.02) k = 1
      const size = Math.max(...kept.map((r) => r.size))
      const baseline = g.reduce((s, i) => s + i.baseline, 0) / g.length
      lines.push({
        id: `${page}:${Math.round(first.x)}:${Math.round(baseline)}`,
        x: first.x / W,
        y: (baseline - ASCENT * size) / H,
        w: widthPt / W,
        h: ((ASCENT + DESCENT) * size) / H,
        baseline: baseline / H,
        k, W, H, runs: kept, text,
      })
    }
  }
  return lines
}

let ruler: CanvasRenderingContext2D | null | undefined
/** Mide un texto con la fuente equivalente del navegador (misma anchura que la estándar del PDF) */
export const canvasMeasure: Measure = (text, s) => {
  ruler ??= document.createElement('canvas').getContext('2d')
  if (!ruler) return text.length * s.size * 0.5
  ruler.font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${s.size}px ${FAMILY_CSS[s.family]}`
  return ruler.measureText(text).width
}

/** Lee las líneas de texto de una página (solo texto horizontal) */
export async function extractLines(page: PDFPageProxy, pageNum: number, measure: Measure = canvasMeasure): Promise<TextLine[]> {
  const viewport = page.getViewport({ scale: 1 })
  // cargar las fuentes de la página para conocer su nombre real
  await page.getOperatorList().catch(() => undefined)
  const content = await page.getTextContent()
  const styleOf: StyleOf = (fontName) => {
    let font: { name?: string; bold?: boolean; italic?: boolean } | undefined
    try { font = page.commonObjs.has(fontName) ? (page.commonObjs.get(fontName) as typeof font) : undefined } catch { /* aún no cargada */ }
    const generic = (content.styles[fontName] as { fontFamily?: string } | undefined)?.fontFamily
    return classifyFont(font?.name, generic, font)
  }
  const items: RawItem[] = []
  for (const it of content.items) {
    if (!('str' in it)) continue
    const tr = Util.transform(viewport.transform, it.transform)
    const size = Math.hypot(it.transform[0], it.transform[1])
    // texto girado: no se edita
    if (Math.abs(tr[1]) > 0.1 * Math.abs(tr[0]) || Math.abs(tr[2]) > 0.1 * Math.abs(tr[3])) continue
    items.push({ str: it.str, x: tr[4], baseline: tr[5], w: it.width, size, fontName: it.fontName })
  }
  const lines = groupLines(items, styleOf, measure, pageNum, viewport.width, viewport.height)
  try {
    const { total, shows } = await analyzeShows(page)
    for (const l of lines) l.cut = cutFor(l, shows, total)
  } catch { /* sin esa información el texto original solo se tapa */ }
  return lines
}

// ── Color del fondo y del texto leyendo los píxeles de la página dibujada ───────────────────────

const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/**
 * El fondo es el color más frecuente en un anillo alrededor de la caja; el color del texto, el píxel de dentro
 * que más se aleja de ese fondo (si casi no hay diferencia, negro).
 */
export function analyzeBox(data: Uint8ClampedArray, cw: number, ch: number, box: { x: number; y: number; w: number; h: number }) {
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(cw - 1, Math.ceil(box.x + box.w))
  const y1 = Math.min(ch - 1, Math.ceil(box.y + box.h))
  const pad = 3
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  const at = (x: number, y: number) => (y * cw + x) * 4
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= cw || y >= ch) return
    const i = at(x, y)
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2]
    buckets.set(key, b)
  }
  for (let x = x0 - pad; x <= x1 + pad; x++) for (let k = 1; k <= pad; k++) { add(x, y0 - k); add(x, y1 + k) }
  for (let y = y0; y <= y1; y++) for (let k = 1; k <= pad; k++) { add(x0 - k, y); add(x1 + k, y) }
  let best: { n: number; r: number; g: number; b: number } | undefined
  for (const b of buckets.values()) if (!best || b.n > best.n) best = b
  const bg = best ? [best.r / best.n, best.g / best.n, best.b / best.n] : [255, 255, 255]

  let far = 0
  let fg = [0, 0, 0]
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = at(x, y)
      const d = (data[i] - bg[0]) ** 2 + (data[i + 1] - bg[1]) ** 2 + (data[i + 2] - bg[2]) ** 2
      if (d > far) { far = d; fg = [data[i], data[i + 1], data[i + 2]] }
    }
  }
  return { bg: toHex(bg[0], bg[1], bg[2]), color: far < 40 * 40 ? '#000000' : toHex(fg[0], fg[1], fg[2]) }
}

// ── De lo escrito en pantalla a tramos con estilo ────────────────────────────────────────────

/** Lee el contenido editable: cada trozo de texto toma el estilo del tramo (`data-run`) en que está */
export function runsFromDom(root: HTMLElement, runs: EditRun[]): EditRun[] {
  const out: EditRun[] = []
  let current = 0
  const push = (text: string, idx: number) => {
    if (!text) return
    const style = runs[idx] ?? runs[0]
    const last = out[out.length - 1]
    if (last && sameStyle(last, style) && last.bold === style.bold) last.text += text
    else out.push({ ...style, text })
  }
  const walk = (node: Node, idx: number) => {
    if (node.nodeType === 3) { push((node.textContent ?? '').replace(/ /g, ' '), idx); return }
    if (node.nodeType !== 1) return
    const el = node as HTMLElement
    if (el.tagName === 'BR') return
    const own = el.dataset?.run
    const next = own !== undefined ? Number(own) : idx
    if (own !== undefined) current = next
    el.childNodes.forEach((c) => walk(c, next))
  }
  root.childNodes.forEach((c) => walk(c, current))
  return out
}

export const joinRuns = (runs: EditRun[]) => runs.map((r) => r.text).join('')
