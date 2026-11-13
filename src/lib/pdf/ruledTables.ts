import type { Block, Piece } from './tables'
import type { HLine, Rulings, VLine } from './rulings'

const JOIN = 2.5

/** Une los segmentos que están en la misma recta y se tocan (un borde dibujado en varios trozos pasa a ser uno) */
function mergeH(lines: HLine[]): HLine[] {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x1 - b.x1)
  const out: HLine[] = []
  for (const l of sorted) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.y - l.y) <= 1.2 && l.x1 <= last.x2 + 3) last.x2 = Math.max(last.x2, l.x2)
    else out.push({ ...l })
  }
  return out
}
function mergeV(lines: VLine[]): VLine[] {
  const sorted = [...lines].sort((a, b) => a.x - b.x || a.y1 - b.y1)
  const out: VLine[] = []
  for (const l of sorted) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - l.x) <= 1.2 && l.y1 <= last.y2 + 3) last.y2 = Math.max(last.y2, l.y2)
    else out.push({ ...l })
  }
  return out
}

function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) {
    const last = out[out.length - 1]
    if (last !== undefined && v - last <= tol) out[out.length - 1] = (last + v) / 2
    else out.push(v)
  }
  return out
}

function find(parent: number[], i: number): number {
  while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
  return i
}
const union = (parent: number[], a: number, b: number) => { parent[find(parent, a)] = find(parent, b) }

/** Texto de un grupo de fragmentos: por líneas, de arriba abajo y de izquierda a derecha */
function joinPieces(pieces: Piece[]): string {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x)
  let text = ''
  let prev: Piece | undefined
  for (const p of sorted) {
    if (prev) {
      const sameLine = Math.abs(prev.y - p.y) < Math.max(2, p.size * 0.4)
      const gap = p.x - (prev.x + prev.w)
      text += sameLine ? (gap > p.size * 0.15 ? ' ' : '') : ' '
    }
    text += p.str.trim() === '' ? '' : p.str
    prev = p
  }
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Tablas dibujadas con líneas: se leen las filas y columnas de los propios bordes y las celdas combinadas
 * (donde falta una línea interior) se respetan. Devuelve las tablas y los fragmentos de texto que no son de ninguna.
 */
export function ruledTables(pieces: Piece[], rulings: Rulings): { blocks: Block[]; rest: Piece[] } {
  const hs = mergeH(rulings.h).filter((l) => l.x2 - l.x1 > 6)
  const vs = mergeV(rulings.v).filter((l) => l.y2 - l.y1 > 6)
  if (hs.length < 2 || vs.length < 2) return { blocks: [], rest: pieces }

  // componentes: líneas que se cruzan o se tocan forman una misma tabla
  const n = hs.length + vs.length
  const parent = Array.from({ length: n }, (_, i) => i)
  hs.forEach((h, i) => vs.forEach((v, j) => {
    if (v.x >= h.x1 - JOIN && v.x <= h.x2 + JOIN && h.y >= v.y1 - JOIN && h.y <= v.y2 + JOIN) union(parent, i, hs.length + j)
  }))
  const groups = new Map<number, { h: HLine[]; v: VLine[] }>()
  hs.forEach((h, i) => { const g = groups.get(find(parent, i)) ?? { h: [], v: [] }; g.h.push(h); groups.set(find(parent, i), g) })
  vs.forEach((v, j) => { const r = find(parent, hs.length + j); const g = groups.get(r) ?? { h: [], v: [] }; g.v.push(v); groups.set(r, g) })

  const blocks: Block[] = []
  let rest = pieces
  for (const g of groups.values()) {
    const xs = cluster(g.v.map((v) => v.x), 2)
    const ys = cluster(g.h.map((h) => h.y), 2).reverse() // de arriba abajo
    const rows = ys.length - 1
    const cols = xs.length - 1
    if (rows < 1 || cols < 1 || rows * cols < 2) continue

    const hasV = (x: number, low: number, high: number) => g.v.some((v) => Math.abs(v.x - x) <= 2.5 && v.y1 <= low + 2.5 && v.y2 >= high - 2.5)
    const hasH = (y: number, left: number, right: number) => g.h.some((h) => Math.abs(h.y - y) <= 2.5 && h.x1 <= left + 2.5 && h.x2 >= right - 2.5)

    // celdas combinadas: falta la línea entre dos celdas vecinas
    const cell = Array.from({ length: rows * cols }, (_, i) => i)
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (j + 1 < cols && !hasV(xs[j + 1], ys[i + 1], ys[i])) union(cell, i * cols + j, i * cols + j + 1)
        if (i + 1 < rows && !hasH(ys[i + 1], xs[j], xs[j + 1])) union(cell, i * cols + j, (i + 1) * cols + j)
      }
    }
    const rep = (i: number, j: number) => {
      const root = find(cell, i * cols + j)
      let best = root
      for (let k = 0; k < rows * cols; k++) if (find(cell, k) === root && k < best) best = k
      return best
    }

    const inside: Piece[] = []
    const outside: Piece[] = []
    const bucket = new Map<number, Piece[]>()
    for (const p of rest) {
      const cx = p.x + Math.max(p.w, 0) / 2
      const cy = p.y + p.size * 0.3
      const i = ys.findIndex((y, k) => k < rows && cy <= y + 1 && cy > ys[k + 1] - 1)
      const j = xs.findIndex((x, k) => k < cols && cx >= x - 1 && cx < xs[k + 1] + 1)
      if (i < 0 || j < 0) { outside.push(p); continue }
      inside.push(p)
      const r = rep(i, j)
      bucket.set(r, [...(bucket.get(r) ?? []), p])
    }
    if (inside.length < 2) continue

    let grid = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (rep(i, j) === i * cols + j ? joinPieces(bucket.get(i * cols + j) ?? []) : '')))
    grid = grid.filter((r) => r.some((c) => c !== ''))
    const keep = Array.from({ length: cols }, (_, j) => grid.some((r) => r[j] !== ''))
    grid = grid.map((r) => r.filter((_, j) => keep[j]))
    if (!grid.length || grid.flat().filter((c) => c !== '').length < 2) continue

    blocks.push({ kind: 'table', rows: grid, y: ys[0] })
    rest = outside
  }
  return { blocks, rest }
}
