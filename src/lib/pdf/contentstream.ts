/**
 * Lector mínimo del contenido de una página PDF: encuentra las instrucciones que escriben texto (Tj, TJ, ' y ")
 * con su posición exacta en los bytes, para poder quitarlas o cambiarlas sin tocar nada más.
 * Trabaja sobre una cadena «latin1» (un carácter por byte), así que los índices coinciden con los bytes.
 */

export interface ShowOp {
  /** Número de orden entre todas las instrucciones de texto de este contenido (empieza en 0) */
  ord: number
  kind: 'Tj' | 'TJ' | "'" | '"'
  /** Desde el primer operando hasta el final del operador */
  start: number
  end: number
  /** Solo en «"»: espaciado de palabra y de letra que fija además de mostrar el texto */
  aw?: string
  ac?: string
}

const WS = /[\s\0]/
const DELIM = /[\s\0()<>[\]{}/%]/

interface Tok { start: number; end: number; text: string }

/** Una instrucción de dibujo (cierre de trazado: S, f, B, n…) o de uso de un objeto externo (Do) */
export interface SimpleOp {
  ord: number
  op: string
  start: number
  end: number
}

/** Un bloque de contenido marcado como marca de agua (`/Artifact <</Subtype /Watermark>> BDC … EMC`) */
export interface MarkBlock {
  ord: number
  start: number
  end: number
}

export interface Scan {
  shows: ShowOp[]
  /** Instrucciones que terminan un trazado (pintarlo o descartarlo): S s f F f* B B* b b* n */
  paints: SimpleOp[]
  /** Instrucciones «Do» (imágenes y formularios XObject) */
  draws: SimpleOp[]
  /** Bloques etiquetados como marca de agua, de la etiqueta de apertura a su cierre (EMC) */
  marks: MarkBlock[]
}

const PAINT_OPS = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n'])

export function findShowOps(s: string, firstOrd = 0): ShowOp[] {
  return scanContent(s, { shows: firstOrd, paints: 0, draws: 0 }).shows
}

/** Lee el contenido y localiza las instrucciones de texto, de cierre de trazado y de uso de objetos (con sus posiciones) */
export function scanContent(s: string, first: { shows: number; paints: number; draws: number; marks?: number } = { shows: 0, paints: 0, draws: 0 }): Scan {
  const paints: SimpleOp[] = []
  const marks: MarkBlock[] = []
  const open: { start: number; wm: boolean }[] = []
  let markOrd = first.marks ?? 0
  const draws: SimpleOp[] = []
  let paintOrd = first.paints
  let drawOrd = first.draws
  const ops: ShowOp[] = []
  let i = 0
  let operands: Tok[] = []
  const arrays: number[] = [] // posición, dentro de `operands`, donde empieza cada matriz abierta
  let ord = first.shows

  const push = (start: number, end: number) => operands.push({ start, end, text: s.slice(start, end) })

  while (i < s.length) {
    const c = s[i]
    if (WS.test(c)) { i++; continue }
    if (c === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue }
    if (c === '(') {
      const start = i
      let depth = 0
      for (; i < s.length; i++) {
        const ch = s[i]
        if (ch === '\\') i++
        else if (ch === '(') depth++
        else if (ch === ')' && --depth === 0) { i++; break }
      }
      push(start, i)
      continue
    }
    if (c === '<') {
      if (s[i + 1] === '<') { push(i, i + 2); i += 2; continue }
      const start = i
      i = s.indexOf('>', i)
      i = i < 0 ? s.length : i + 1
      push(start, i)
      continue
    }
    if (c === '>') { push(i, s[i + 1] === '>' ? i + 2 : i + 1); i += s[i + 1] === '>' ? 2 : 1; continue }
    if (c === '[') { arrays.push(operands.length); push(i, i + 1); i++; continue }
    if (c === ']') {
      const from = arrays.pop()
      if (from !== undefined && operands[from]) {
        const start = operands[from].start
        operands.length = from
        push(start, i + 1)
      } else push(i, i + 1)
      i++
      continue
    }
    if (c === '{' || c === '}') { i++; continue }
    if (c === '/') {
      const start = i++
      while (i < s.length && !DELIM.test(s[i])) i++
      push(start, i)
      continue
    }
    // número u operador
    const start = i
    while (i < s.length && !DELIM.test(s[i])) i++
    if (i === start) { i++; continue }
    const word = s.slice(start, i)
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) { push(start, i); continue }

    // operador
    if (word === 'BI') {
      // imagen en línea: se salta hasta «EI» (sus datos son binarios)
      const id = s.slice(i).search(/[\s\0]ID[\s\0]/)
      let j = id < 0 ? s.length : i + id + 4
      const m = /[\s\0]EI(?=[\s\0]|$)/.exec(s.slice(j))
      j = m ? j + m.index + m[0].length : s.length
      i = j
      operands = []
      arrays.length = 0
      continue
    }
    if (word === 'BDC' || word === 'BMC') open.push({ start: operands.length ? operands[0].start : start, wm: word === 'BDC' && operands.some((o) => o.text === '/Watermark') })
    else if (word === 'EMC') { const m = open.pop(); if (m?.wm) marks.push({ ord: markOrd++, start: m.start, end: i }) }
    if (PAINT_OPS.has(word)) paints.push({ ord: paintOrd++, op: word, start, end: i })
    else if (word === 'Do' && operands.length >= 1) draws.push({ ord: drawOrd++, op: word, start: operands[operands.length - 1].start, end: i })
    if (word === 'Tj' || word === 'TJ' || word === "'" || word === '"') {
      const need = word === '"' ? 3 : 1
      if (operands.length >= need) {
        const used = operands.slice(operands.length - need)
        ops.push({
          ord: ord++, kind: word, start: used[0].start, end: i,
          ...(word === '"' ? { aw: used[0].text, ac: used[1].text } : {}),
        })
      }
    }
    operands = []
    arrays.length = 0
  }
  return { shows: ops, paints, draws, marks }
}

const num = (n: number) => (Math.abs(n) < 5e-4 ? '0' : String(Math.round(n * 1000) / 1000))

/**
 * Cambia cada instrucción de texto indicada por un simple desplazamiento horizontal igual a lo que avanzaba el texto
 * (así lo que va detrás en la misma línea no se mueve). `advance` es el valor, en milésimas del cuerpo de letra, que
 * lleva el operador TJ (negativo = hacia la derecha).
 */
export function removeShowOps(s: string, ops: ShowOp[], advance: Map<number, number>): string {
  return applyEdits(s, ops.filter((o) => advance.has(o.ord)).map((o) => ({ start: o.start, end: o.end, text: showReplacement(o, advance.get(o.ord)!) })))
}

export interface Edit { start: number; end: number; text: string }

/** Sustituye varios trozos del contenido a la vez (de atrás hacia delante, así las posiciones no se desplazan) */
export function applyEdits(s: string, edits: Edit[]): string {
  let out = s
  for (const e of [...edits].sort((x, y) => y.start - x.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}

/** Lo que sustituye a una instrucción de texto: un desplazamiento del mismo ancho (y sus efectos laterales) */
export function showReplacement(op: ShowOp, advance: number): string {
  const shift = `[${num(advance)}] TJ`
  return op.kind === "'" ? `T* ${shift}` : op.kind === '"' ? `${op.aw} Tw ${op.ac} Tc T* ${shift}` : shift
}

/** Cambia el cierre de los trazados indicados por «n» (se termina el trazado sin pintarlo) y quita los «Do» indicados */
export function removeGraphics(s: string, paints: SimpleOp[], draws: SimpleOp[]): string {
  return applyEdits(s, [
    ...paints.map((p) => ({ start: p.start, end: p.end, text: 'n' })),
    ...draws.map((d) => ({ start: d.start, end: d.end, text: '' })),
  ])
}

export const bytesToLatin1 = (b: Uint8Array) => {
  let out = ''
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return out
}
export const latin1ToBytes = (s: string) => {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255
  return b
}
