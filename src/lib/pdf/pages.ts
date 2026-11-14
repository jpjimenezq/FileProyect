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
