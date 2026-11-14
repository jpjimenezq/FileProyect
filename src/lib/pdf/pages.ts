import { PDFDocument, degrees } from 'pdf-lib'

/** Cualquier cosa de la que se puedan leer los bytes de un PDF (un File vale) */
export type PdfSource = { arrayBuffer(): Promise<ArrayBuffer> }

const load = async (src: PdfSource) => PDFDocument.load(await src.arrayBuffer(), { ignoreEncryption: true })

/* ───────────── Intercalar ───────────── */

export type InterleaveItem = { src: 'A' | 'B'; page: number; label: string }

/**
 * Orden de las páginas al mezclar dos PDF: A1 B1 A2 B2…
 * Con `reverseB`, el segundo se lee de la última página a la primera (escáner que da la vuelta al taco).
 * Si un PDF tiene más páginas que el otro, las sobrantes van al final. `page` es la página de origen (1-based).
 */
export function interleaveOrder(countA: number, countB: number, reverseB = false): InterleaveItem[] {
  const a = Array.from({ length: countA }, (_, i) => i + 1)
  const b = Array.from({ length: countB }, (_, i) => i + 1)
  if (reverseB) b.reverse()
  const out: InterleaveItem[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push({ src: 'A', page: a[i], label: `A${a[i]}` })
    if (i < b.length) out.push({ src: 'B', page: b[i], label: `B${b[i]}` })
  }
  return out
}

/** Mezcla dos PDF página a página (ver `interleaveOrder`) */
export async function interleavePdfs(a: PdfSource, b: PdfSource, reverseB = false, onProgress?: (fraction: number) => void) {
  const [docA, docB] = [await load(a), await load(b)]
  const out = await PDFDocument.create()
  const order = interleaveOrder(docA.getPageCount(), docB.getPageCount(), reverseB)
  for (const [i, item] of order.entries()) {
    const [page] = await out.copyPages(item.src === 'A' ? docA : docB, [item.page - 1])
    out.addPage(page)
    onProgress?.((i + 1) / order.length)
  }
  return out.save()
}

/* ───────────── Insertar ───────────── */

/** `at` = después de qué página se inserta (0 = antes de la primera, total = al final) */
export type Insertion = { id: string; at: number }

export type PlanItem = { type: 'orig'; page: number } | { type: 'insert'; id: string }

/**
 * Secuencia final de un PDF de `total` páginas con inserciones. Varias inserciones en el mismo sitio
 * se colocan en el orden en que se dieron. Las posiciones fuera de rango se ajustan a 0..total.
 */
export function insertionPlan(total: number, insertions: Insertion[]): PlanItem[] {
  const out: PlanItem[] = []
  const at = (n: number) => Math.min(Math.max(Math.round(n), 0), total)
  const push = (pos: number) => insertions.filter((x) => at(x.at) === pos).forEach((x) => out.push({ type: 'insert', id: x.id }))
  push(0)
  for (let p = 1; p <= total; p++) {
    out.push({ type: 'orig', page: p })
    push(p)
  }
  return out
}

/** Página de la que una hoja en blanco copia el tamaño: la anterior a la posición, o la primera si va al principio */
export function neighborPage(total: number, at: number) {
  return Math.min(Math.max(at, 1), Math.max(total, 1))
}

export type BlankInsert = { id: string; at: number; blank: true }
export type PdfInsert = { id: string; at: number; file: PdfSource }
export type InsertSpec = BlankInsert | PdfInsert

/** Inserta páginas en blanco (del tamaño de la vecina) u otros PDF completos en las posiciones indicadas */
export async function insertPages(main: PdfSource, specs: InsertSpec[], onProgress?: (fraction: number) => void) {
  const src = await load(main)
  const total = src.getPageCount()
  const out = await PDFDocument.create()
  const plan = insertionPlan(total, specs)
  const extra = new Map<string, PDFDocument>()
  for (const s of specs) if ('file' in s) extra.set(s.id, await load(s.file))
  const byId = new Map(specs.map((s) => [s.id, s]))

  for (const [i, item] of plan.entries()) {
    if (item.type === 'orig') {
      const [page] = await out.copyPages(src, [item.page - 1])
      out.addPage(page)
    } else {
      const spec = byId.get(item.id)!
      const doc = extra.get(item.id)
      if (doc) {
        const pages = await out.copyPages(doc, doc.getPageIndices())
        pages.forEach((p) => out.addPage(p))
      } else {
        const ref = src.getPage(neighborPage(total, spec.at) - 1)
        const { width, height } = ref.getSize()
        const blank = out.addPage([width, height])
        const angle = ref.getRotation().angle
        if (angle) blank.setRotation(degrees(angle))
      }
    }
    onProgress?.((i + 1) / plan.length)
  }
  return out.save()
}

/* ───────────── Dividir páginas por la mitad ───────────── */

export type SplitMode = 'vertical' | 'horizontal' | 'auto'
/** Corte que se hace sobre lo que se ve: vertical = mitades izquierda y derecha; horizontal = arriba y abajo */
export type SplitCut = 'vertical' | 'horizontal'
export type Box = { x: number; y: number; width: number; height: number }
export type SplitSide = 'left' | 'right' | 'top' | 'bottom'

/** Tamaño tal y como se ve la página (con el giro aplicado) */
export function visualSize(width: number, height: number, rotation: number) {
  return Math.abs(Math.round(rotation / 90)) % 2 === 1 ? { width: height, height: width } : { width, height }
}

/** Corte real: en «auto», las páginas apaisadas se cortan en vertical y las verticales en horizontal */
export function resolveCut(mode: SplitMode, width: number, height: number, rotation = 0): SplitCut {
  if (mode !== 'auto') return mode
  const v = visualSize(width, height, rotation)
  return v.width > v.height ? 'vertical' : 'horizontal'
}

const norm = (rotation: number) => ((Math.round(rotation / 90) * 90) % 360 + 360) % 360

/** Lado de la página SIN girar que corresponde a cada lado visible, según el giro /Rotate (horario) */
const SIDE_MAP: Record<number, Record<SplitSide, SplitSide>> = {
  0: { left: 'left', right: 'right', top: 'top', bottom: 'bottom' },
  90: { left: 'bottom', right: 'top', top: 'left', bottom: 'right' },
  180: { left: 'right', right: 'left', top: 'bottom', bottom: 'top' },
  270: { left: 'top', right: 'bottom', top: 'right', bottom: 'left' },
}

/** Mitad de una caja (sin girar; origen abajo a la izquierda como en PDF) */
function halfOf(b: Box, side: SplitSide): Box {
  const hw = b.width / 2
  const hh = b.height / 2
  switch (side) {
    case 'left': return { x: b.x, y: b.y, width: hw, height: b.height }
    case 'right': return { x: b.x + hw, y: b.y, width: hw, height: b.height }
    case 'bottom': return { x: b.x, y: b.y, width: b.width, height: hh }
    case 'top': return { x: b.x, y: b.y + hh, width: b.width, height: hh }
  }
}

/**
 * Cajas (MediaBox/CropBox) de las dos mitades, en orden de lectura. Respeta el giro de la página y que la caja
 * no empiece en 0,0. Con `rtl` (derecha a izquierda) se leen primero la mitad derecha. En cortes horizontales
 * el orden siempre es arriba → abajo.
 */
export function splitBoxes(box: Box, rotation: number, mode: SplitMode, rtl = false): [Box, Box] {
  const cut = resolveCut(mode, box.width, box.height, rotation)
  const map = SIDE_MAP[norm(rotation)]
  const [a, b]: [SplitSide, SplitSide] = cut === 'vertical' ? (rtl ? ['right', 'left'] : ['left', 'right']) : ['top', 'bottom']
  return [halfOf(box, map[a]), halfOf(box, map[b])]
}

/** Qué páginas se dividen: con `skipEnds`, ni la primera ni la última (portadas). Un PDF de 1 o 2 páginas no se divide así. */
export function splitPlan(total: number, skipEnds: boolean) {
  return Array.from({ length: total }, (_, i) => ({ page: i + 1, split: !skipEnds || (i > 0 && i < total - 1) }))
}

/** Páginas que tendrá el resultado */
export function splitPageCount(total: number, skipEnds: boolean) {
  return splitPlan(total, skipEnds).reduce((n, p) => n + (p.split ? 2 : 1), 0)
}

export type SplitOptions = { mode: SplitMode; rtl?: boolean; skipEnds?: boolean }

/** Corta cada página en dos copias, ajustando MediaBox y CropBox a su mitad */
export async function splitPagesInHalf(src: PdfSource, opts: SplitOptions, onProgress?: (fraction: number) => void) {
  const doc = await load(src)
  const out = await PDFDocument.create()
  const plan = splitPlan(doc.getPageCount(), !!opts.skipEnds)
  for (const [i, item] of plan.entries()) {
    const orig = doc.getPage(item.page - 1)
    if (!item.split) {
      const [page] = await out.copyPages(doc, [item.page - 1])
      out.addPage(page)
    } else {
      const m = orig.getCropBox()
      const boxes = splitBoxes({ x: m.x, y: m.y, width: m.width, height: m.height }, orig.getRotation().angle, opts.mode, opts.rtl)
      for (const b of boxes) {
        // una copia por mitad: así cada una tiene su propio diccionario de página
        const [page] = await out.copyPages(doc, [item.page - 1])
        out.addPage(page)
        page.setMediaBox(b.x, b.y, b.width, b.height)
        page.setCropBox(b.x, b.y, b.width, b.height)
      }
    }
    onProgress?.((i + 1) / plan.length)
  }
  return out.save()
}
