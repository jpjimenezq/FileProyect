import { PDFDocument } from 'pdf-lib'
import { AlignmentType, Document, ImageRun, Packer, PageBreak, PageOrientation, Paragraph, TextRun } from 'docx'
import JSZip from 'jszip'
import type { ImageOptions } from '../pdf/ops'
import { pageFor } from '../pdf/pagefit'

export { pageFor }

export interface Prepared {
  name: string
  width: number
  height: number
  mime: 'image/jpeg' | 'image/png'
  bytes: Uint8Array
  canvas: HTMLCanvasElement
}

export type OutFormat = 'png' | 'jpg' | 'webp'

/** Orientación EXIF de un JPG (1 = normal); 1 si no hay */
export function jpegOrientation(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1
  let i = 2
  while (i + 4 < b.length && b[i] === 0xff) {
    const marker = b[i + 1]
    const len = (b[i + 2] << 8) | b[i + 3]
    if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78) {
      const t = i + 10
      const le = b[t] === 0x49
      const u16 = (o: number) => (le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1])
      const u32 = (o: number) => (le ? u16(o) + u16(o + 2) * 65536 : u16(o) * 65536 + u16(o + 2))
      const ifd = u32(4)
      const n = u16(ifd)
      for (let k = 0; k < n; k++) if (u16(ifd + 2 + k * 12) === 0x0112) return u16(ifd + 2 + k * 12 + 8)
      return 1
    }
    if (marker === 0xda) break
    i += 2 + len
  }
  return 1
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la imagen.'))), type, quality))

/**
 * Lee la imagen con el navegador (así vale cualquier formato que él entienda: JPG, PNG, WebP, GIF, BMP, AVIF, SVG…),
 * respeta la orientación de las fotos del móvil y aplica el giro elegido. Las fotos quedan como JPG; el resto como PNG.
 */
export async function prepareImage(file: File, rotation = 0): Promise<Prepared> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`No se pudo leer «${file.name}». Prueba con JPG, PNG, WebP, GIF, BMP o AVIF.`)
  }
  const turn = ((rotation % 360) + 360) % 360
  const swap = turn === 90 || turn === 270
  const canvas = document.createElement('canvas')
  canvas.width = swap ? bmp.height : bmp.width
  canvas.height = swap ? bmp.width : bmp.height
  const ctx = canvas.getContext('2d')!
  const jpeg = file.type === 'image/jpeg'
  if (jpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((turn * Math.PI) / 180)
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2)
  bmp.close()
  const mime = jpeg ? 'image/jpeg' : 'image/png'
  const original = new Uint8Array(await file.arrayBuffer())
  // un JPG que ya está derecho se conserva tal cual (sin volver a comprimirlo)
  if (jpeg && turn === 0 && jpegOrientation(original) === 1) return { name: file.name, width: canvas.width, height: canvas.height, mime, bytes: original, canvas }
  const blob = await toBlob(canvas, mime, 0.92)
  return { name: file.name, width: canvas.width, height: canvas.height, mime, bytes: new Uint8Array(await blob.arrayBuffer()), canvas }
}

export async function preparedToPdf(images: Prepared[], o: ImageOptions, onProgress?: (f: number) => void) {
  const doc = await PDFDocument.create()
  for (const [i, img] of images.entries()) {
    const embedded = img.mime === 'image/jpeg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes)
    const { pw, ph, w, h } = pageFor(img, o)
    doc.addPage([pw, ph]).drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h })
    onProgress?.((i + 1) / images.length)
  }
  return doc.save()
}

const twips = (pt: number) => Math.round(pt * 20)
const px = (pt: number) => Math.round((pt * 4) / 3)

/** Word con una página por foto */
export async function preparedToDocx(images: Prepared[], o: ImageOptions, title = 'Fotos') {
  const sections = images.map((img) => {
    const { pw, ph, w, h, m } = pageFor(img, o)
    const landscape = pw > ph
    return {
      properties: {
        page: {
          size: landscape ? { width: twips(ph), height: twips(pw), orientation: PageOrientation.LANDSCAPE } : { width: twips(pw), height: twips(ph) },
          margin: { top: twips(m), bottom: twips(m), left: twips(m), right: twips(m), header: 0, footer: 0 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [new ImageRun({ type: img.mime === 'image/jpeg' ? 'jpg' : 'png', data: img.bytes, transformation: { width: px(w), height: px(h) }, altText: { name: img.name, description: img.name, title: img.name } })],
        }),
      ],
    }
  })
  return Packer.toBlob(new Document({ title, creator: 'FileProyect', sections }))
}

/** Reconoce el texto de cada imagen (OCR); devuelve un texto por imagen */
export async function recognizeAll(images: Prepared[], lang: string, onProgress?: (f: number) => void): Promise<string[]> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(lang)
  try {
    const out: string[] = []
    for (const [i, img] of images.entries()) {
      const { data } = await worker.recognize(img.canvas)
      out.push(data.text.trim())
      onProgress?.((i + 1) / images.length)
    }
    return out
  } finally {
    await worker.terminate()
  }
}

/** Word editable con el texto reconocido (una página por imagen) */
export async function textToDocx(pages: string[], title = 'Texto reconocido') {
  const children: Paragraph[] = []
  pages.forEach((text, i) => {
    if (i) children.push(new Paragraph({ children: [new PageBreak()] }))
    const paras = text.split(/\n{2,}/).map((t) => t.replace(/\n/g, ' ').trim()).filter(Boolean)
    if (!paras.length) children.push(new Paragraph({ children: [new TextRun({ text: '(no se reconoció texto en esta imagen)', italics: true, color: '888888' })] }))
    for (const t of paras) children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: t, font: 'Arial', size: 22 })] }))
  })
  return Packer.toBlob(new Document({ title, creator: 'FileProyect', sections: [{ children }] }))
}

const MIME: Record<OutFormat, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

/** Las imágenes en otro formato (PNG, JPG o WebP), en un ZIP si son varias */
export async function convertImages(images: Prepared[], format: OutFormat): Promise<{ name: string; blob: Blob }[]> {
  const out: { name: string; blob: Blob }[] = []
  for (const img of images) {
    let canvas = img.canvas
    if (format === 'jpg') {
      canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, img.width, img.height)
      ctx.drawImage(img.canvas, 0, 0)
    }
    out.push({ name: `${img.name.replace(/\.[^.]+$/, '')}.${format}`, blob: await toBlob(canvas, MIME[format], 0.92) })
  }
  return out
}

export async function zipOf(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const zip = new JSZip()
  const seen = new Map<string, number>()
  for (const f of files) {
    const n = seen.get(f.name) ?? 0
    seen.set(f.name, n + 1)
    zip.file(n ? f.name.replace(/(\.[^.]+)$/, `_${n}$1`) : f.name, f.blob)
  }
  return zip.generateAsync({ type: 'blob' })
}
