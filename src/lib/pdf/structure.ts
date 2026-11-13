import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from 'pdf-lib'
import type { PDFObject } from 'pdf-lib'

const load = async (file: File) => PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false })

const text = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined)

/** Recorre un árbol de nombres (EmbeddedFiles, Dests…) y devuelve sus pares clave → valor */
function nameTree(doc: PDFDocument, root: PDFObject | undefined, depth = 0): Map<string, PDFObject> {
  const out = new Map<string, PDFObject>()
  const node = doc.context.lookup(root)
  if (!(node instanceof PDFDict) || depth > 12) return out
  const names = doc.context.lookup(node.get(PDFName.of('Names')))
  if (names instanceof PDFArray) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      const key = text(doc.context.lookup(names.get(i)))
      if (key !== undefined) out.set(key, names.get(i + 1))
    }
  }
  const kids = doc.context.lookup(node.get(PDFName.of('Kids')))
  if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) for (const [k, v] of nameTree(doc, kids.get(i), depth + 1)) out.set(k, v)
  return out
}

// ── Archivos adjuntos ───────────────────────────────────────────────────
export interface Attachment {
  name: string
  size: number
  bytes: Uint8Array
}

export async function listAttachments(file: File): Promise<Attachment[]> {
  const doc = await load(file)
  const names = doc.context.lookup(doc.catalog.get(PDFName.of('Names')))
  if (!(names instanceof PDFDict)) return []
  const out: Attachment[] = []
  for (const [key, spec] of nameTree(doc, names.get(PDFName.of('EmbeddedFiles')))) {
    const dict = doc.context.lookup(spec)
    if (!(dict instanceof PDFDict)) continue
    const ef = doc.context.lookup(dict.get(PDFName.of('EF')))
    if (!(ef instanceof PDFDict)) continue
    const stream = doc.context.lookup(ef.get(PDFName.of('UF')) ?? ef.get(PDFName.of('F')))
    if (!(stream instanceof PDFRawStream)) continue
    let bytes: Uint8Array
    try { bytes = decodePDFRawStream(stream).decode() } catch { bytes = stream.contents }
    const name = text(doc.context.lookup(dict.get(PDFName.of('UF')))) ?? text(doc.context.lookup(dict.get(PDFName.of('F')))) ?? key
    out.push({ name, size: bytes.length, bytes })
  }
  return out
}

export async function addAttachments(file: File, files: File[]) {
  const doc = await load(file)
  for (const f of files) {
    await doc.attach(new Uint8Array(await f.arrayBuffer()), f.name, { mimeType: f.type || 'application/octet-stream', creationDate: new Date(), modificationDate: new Date(f.lastModified) })
  }
  return doc.save()
}

export async function removeAttachments(file: File) {
  const doc = await load(file)
  const names = doc.context.lookup(doc.catalog.get(PDFName.of('Names')))
  if (names instanceof PDFDict) names.delete(PDFName.of('EmbeddedFiles'))
  doc.catalog.delete(PDFName.of('AF'))
  return doc.save()
}

// ── Marcadores (índice) ─────────────────────────────────────────────────
export interface Bookmark {
  title: string
  /** página de destino, empezando en 1 */
  page: number
  /** 0 = nivel superior */
  level: number
}

export async function readBookmarks(file: File): Promise<Bookmark[]> {
  const doc = await load(file)
  const pages = doc.getPages()
  const pageOf = (ref: PDFObject | undefined) => pages.findIndex((p) => p.ref === ref) + 1

  // los destinos con nombre pueden estar en el catálogo (/Dests) o en el árbol Names/Dests
  const named = new Map<string, PDFObject>()
  const dests = doc.context.lookup(doc.catalog.get(PDFName.of('Dests')))
  if (dests instanceof PDFDict) for (const k of dests.keys()) named.set(k.decodeText(), dests.get(k)!)
  const names = doc.context.lookup(doc.catalog.get(PDFName.of('Names')))
  if (names instanceof PDFDict) for (const [k, v] of nameTree(doc, names.get(PDFName.of('Dests')))) named.set(k, v)

  const resolve = (dest: PDFObject | undefined): number => {
    let d = doc.context.lookup(dest)
    if (d instanceof PDFDict) d = doc.context.lookup(d.get(PDFName.of('D'))) // destino guardado como { D: [...] }
    if (d instanceof PDFString || d instanceof PDFHexString || d instanceof PDFName) {
      const key = d instanceof PDFName ? d.decodeText() : d.decodeText()
      return resolve(named.get(key))
    }
    if (d instanceof PDFArray) return pageOf(d.get(0))
    return 0
  }

  const out: Bookmark[] = []
  const outlines = doc.context.lookup(doc.catalog.get(PDFName.of('Outlines')))
  const walk = (first: PDFObject | undefined, level: number, guard: Set<PDFObject>) => {
    let ref = first
    while (ref) {
      const item = doc.context.lookup(ref)
      if (!(item instanceof PDFDict) || guard.has(item)) return
      guard.add(item)
      const title = text(doc.context.lookup(item.get(PDFName.of('Title')))) ?? ''
      let page = resolve(item.get(PDFName.of('Dest')))
      if (!page) {
        const action = doc.context.lookup(item.get(PDFName.of('A')))
        if (action instanceof PDFDict) page = resolve(action.get(PDFName.of('D')))
      }
      out.push({ title, page: page || 1, level })
      walk(item.get(PDFName.of('First')), level + 1, guard)
      ref = item.get(PDFName.of('Next'))
    }
  }
  if (outlines instanceof PDFDict) walk(outlines.get(PDFName.of('First')), 0, new Set())
  return out
}

/** Sustituye el índice del PDF por la lista dada (niveles anidados incluidos) */
export async function writeBookmarks(file: File, bookmarks: Bookmark[]) {
  const doc = await load(file)
  const pages = doc.getPages()
  const valid = bookmarks.filter((b) => b.title.trim())

  if (!valid.length) {
    doc.catalog.delete(PDFName.of('Outlines'))
    return doc.save()
  }

  const ctx = doc.context
  const rootRef = ctx.nextRef()
  type Node = { ref: PDFRef; parent: PDFRef; level: number; children: Node[]; bm: Bookmark }
  const roots: Node[] = []
  const stack: Node[] = []
  let prevLevel = 0
  valid.forEach((bm, i) => {
    // un marcador no puede estar más de un nivel por debajo del anterior
    const level = Math.max(0, Math.min(bm.level, i === 0 ? 0 : prevLevel + 1))
    prevLevel = level
    while (stack.length > level) stack.pop()
    const parent = stack[stack.length - 1]
    const node: Node = { ref: ctx.nextRef(), parent: parent ? parent.ref : rootRef, level, children: [], bm }
    ;(parent ? parent.children : roots).push(node)
    stack.push(node)
  })

  const descendants = (n: Node): number => n.children.reduce((s, c) => s + 1 + descendants(c), 0)
  const build = (n: Node, prev?: Node, next?: Node) => {
    const page = pages[Math.min(Math.max(n.bm.page, 1), pages.length) - 1]
    const dict = ctx.obj({
      Title: PDFHexString.fromText(n.bm.title),
      Parent: n.parent,
      Dest: [page.ref, PDFName.of('Fit')],
    }) as PDFDict
    if (prev) dict.set(PDFName.of('Prev'), prev.ref)
    if (next) dict.set(PDFName.of('Next'), next.ref)
    if (n.children.length) {
      dict.set(PDFName.of('First'), n.children[0].ref)
      dict.set(PDFName.of('Last'), n.children[n.children.length - 1].ref)
      dict.set(PDFName.of('Count'), PDFNumber.of(descendants(n)))
    }
    ctx.assign(n.ref, dict)
    n.children.forEach((c, i) => build(c, n.children[i - 1], n.children[i + 1]))
  }
  roots.forEach((r, i) => build(r, roots[i - 1], roots[i + 1]))

  const total = roots.reduce((s, r) => s + 1 + descendants(r), 0)
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: roots[0].ref, Last: roots[roots.length - 1].ref, Count: total }))
  doc.catalog.set(PDFName.of('Outlines'), rootRef)
  return doc.save()
}

/** Rangos de páginas por capítulo (marcadores de nivel superior). Lo anterior al primer capítulo va como «Inicio». */
export function chapterRanges(bookmarks: Bookmark[], totalPages: number): { title: string; from: number; to: number }[] {
  const tops = bookmarks.filter((b) => b.level === 0)
  // varios capítulos en la misma página se quedan con el primero
  const unique: Bookmark[] = []
  for (const b of [...tops].sort((a, c) => a.page - c.page)) if (!unique.length || unique[unique.length - 1].page !== b.page) unique.push(b)
  const out: { title: string; from: number; to: number }[] = []
  if (unique.length && unique[0].page > 1) out.push({ title: 'Inicio', from: 1, to: unique[0].page - 1 })
  unique.forEach((b, i) => out.push({ title: b.title || `Capítulo ${i + 1}`, from: b.page, to: (unique[i + 1]?.page ?? totalPages + 1) - 1 }))
  return out
}
