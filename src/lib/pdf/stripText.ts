import { PDFArray, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib'
import { PDFDocument } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import { applyEdits, bytesToLatin1, latin1ToBytes, scanContent, showReplacement } from './contentstream'
import type { Edit } from './contentstream'

/** Qué quitar del contenido de una página y cuántas instrucciones de cada tipo debe tener (para comprobar que se lee igual) */
export interface Plan {
  /** Instrucciones de texto por su número de orden → desplazamiento que las sustituye */
  shows?: { advance: Map<number, number>; total: number }
  /** Cierres de trazado (rayas, formas) que se descartan sin pintar */
  paints?: { ords: Set<number>; total: number }
  /** Usos de imágenes y formularios («Do») que se quitan */
  draws?: { ords: Set<number>; total: number }
  /** Quitar todos los bloques etiquetados como marca de agua */
  marks?: boolean
}
export interface Done { shows: boolean; paints: boolean; draws: boolean; marks: boolean }

/**
 * Quita de verdad texto, dibujos e imágenes del contenido de la página (en vez de taparlos). Cada categoría se
 * comprueba por separado: si el contenido no tiene el número de instrucciones esperado, esa categoría no se toca.
 * El texto quitado pasa a ser un desplazamiento del mismo ancho, así el resto de la línea no se mueve.
 */
export function editContent(doc: PDFDocument, page: PDFPage, plan: Plan): Done {
  const none: Done = { shows: false, paints: false, draws: false, marks: false }
  try {
    const ctx = doc.context
    const contents = page.node.get(PDFName.of('Contents'))
    const refs: PDFRef[] = []
    const addAll = (arr: PDFArray) => arr.asArray().forEach((r) => { if (r instanceof PDFRef) refs.push(r) })
    if (contents instanceof PDFRef) {
      const target = ctx.lookup(contents)
      if (target instanceof PDFArray) addAll(target)
      else refs.push(contents)
    } else if (contents instanceof PDFArray) addAll(contents)
    if (!refs.length) return none

    const texts: string[] = []
    for (const ref of refs) {
      const stream = ctx.lookup(ref)
      if (!(stream instanceof PDFRawStream)) return none
      texts.push(bytesToLatin1(decodePDFRawStream(stream).decode()))
    }
    let counts = { shows: 0, paints: 0, draws: 0 }
    const scans = texts.map((t) => {
      const s = scanContent(t, counts)
      counts = { shows: counts.shows + s.shows.length, paints: counts.paints + s.paints.length, draws: counts.draws + s.draws.length }
      return s
    })
    const hasMarks = !!plan.marks && scans.some((s) => s.marks.length > 0)
    const done: Done = {
      marks: hasMarks,
      shows: !!plan.shows && plan.shows.total === counts.shows,
      paints: !!plan.paints && plan.paints.total === counts.paints,
      draws: !!plan.draws && plan.draws.total === counts.draws,
    }
    if (!done.shows && !done.paints && !done.draws && !done.marks) return none

    refs.forEach((ref, i) => {
      const edits: Edit[] = []
      if (done.shows) for (const o of scans[i].shows) if (plan.shows!.advance.has(o.ord)) edits.push({ start: o.start, end: o.end, text: showReplacement(o, plan.shows!.advance.get(o.ord)!) })
      if (done.paints) for (const o of scans[i].paints) if (plan.paints!.ords.has(o.ord)) edits.push({ start: o.start, end: o.end, text: 'n' })
      if (done.draws) for (const o of scans[i].draws) if (plan.draws!.ords.has(o.ord)) edits.push({ start: o.start, end: o.end, text: '' })
      if (done.marks) {
        // un bloque de marca de agua se quita entero (y lo que hubiera dentro no se toca aparte)
        const spans = scans[i].marks.map((m) => ({ start: m.start, end: m.end }))
        const outside = edits.filter((e) => !spans.some((m) => e.start >= m.start && e.end <= m.end))
        edits.length = 0
        edits.push(...outside, ...spans.filter((m) => !spans.some((o) => o !== m && m.start >= o.start && m.end <= o.end && (o.start < m.start || o.end > m.end))).map((m) => ({ ...m, text: '' })))
      }
      if (edits.length) ctx.assign(ref, ctx.flateStream(latin1ToBytes(applyEdits(texts[i], edits))))
    })
    return done
  } catch {
    return none
  }
}

/** Compatibilidad: quitar solo texto */
export function stripText(doc: PDFDocument, page: PDFPage, advance: Map<number, number>, total: number): boolean {
  return editContent(doc, page, { shows: { advance, total } }).shows
}

/** Páginas cuyo contenido tiene bloques etiquetados como marca de agua */
export async function pagesWithMarks(file: File): Promise<number[]> {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const out: number[] = []
  doc.getPages().forEach((page, i) => {
    try {
      const ctx = doc.context
      const contents = page.node.get(PDFName.of('Contents'))
      const refs: PDFRef[] = []
      const addAll = (arr: PDFArray) => arr.asArray().forEach((r) => { if (r instanceof PDFRef) refs.push(r) })
      if (contents instanceof PDFRef) { const t = ctx.lookup(contents); if (t instanceof PDFArray) addAll(t); else refs.push(contents) } else if (contents instanceof PDFArray) addAll(contents)
      for (const ref of refs) {
        const s = ctx.lookup(ref)
        if (s instanceof PDFRawStream && scanContent(bytesToLatin1(decodePDFRawStream(s).decode())).marks.length) { out.push(i + 1); break }
      }
    } catch { /* contenido ilegible: sin marcas */ }
  })
  return out
}
