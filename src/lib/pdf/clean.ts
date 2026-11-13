import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import type { PDFObject } from 'pdf-lib'

const load = async (file: File) => PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false })

// ── Metadatos ───────────────────────────────────────────────────────────
export interface Metadata {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
  created?: Date
  modified?: Date
}

export async function readMetadata(file: File): Promise<Metadata> {
  const doc = await load(file)
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    created: doc.getCreationDate(),
    modified: doc.getModificationDate(),
  }
}

/** `clear` borra todos los metadatos (diccionario Info y XMP) en lugar de editarlos */
export async function writeMetadata(file: File, meta: Pick<Metadata, 'title' | 'author' | 'subject' | 'keywords'>, clear: boolean) {
  const doc = await load(file)
  if (clear) {
    const info = doc.context.lookup(doc.context.trailerInfo.Info)
    if (info instanceof PDFDict) for (const key of info.keys()) info.delete(key)
    doc.catalog.delete(PDFName.of('Metadata'))
  } else {
    doc.setTitle(meta.title)
    doc.setAuthor(meta.author)
    doc.setSubject(meta.subject)
    doc.setKeywords(meta.keywords.split(',').map((k) => k.trim()).filter(Boolean))
    doc.setModificationDate(new Date())
  }
  return doc.save({ updateFieldAppearances: false })
}

// ── Anotaciones ─────────────────────────────────────────────────────────
/** Quita comentarios, resaltados, notas y sellos. Con `keepLinks`, los enlaces se conservan. */
export async function removeAnnotations(file: File, keepLinks: boolean) {
  const doc = await load(file)
  let removed = 0
  for (const page of doc.getPages()) {
    const annots = page.node.Annots()
    if (!annots) continue
    const kept: PDFObject[] = []
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i)
      const dict = doc.context.lookup(ref)
      const isLink = dict instanceof PDFDict && dict.get(PDFName.of('Subtype')) === PDFName.of('Link')
      if (keepLinks && isLink) kept.push(ref)
      else removed++
    }
    if (kept.length) page.node.set(PDFName.of('Annots'), doc.context.obj(kept))
    else page.node.delete(PDFName.of('Annots'))
  }
  return { bytes: await doc.save(), removed }
}

// ── Aplanar formularios ─────────────────────────────────────────────────
export async function flattenForms(file: File) {
  const doc = await load(file)
  const form = doc.getForm()
  const fields = form.getFields().length
  if (fields) form.flatten()
  return { bytes: await doc.save(), fields }
}
