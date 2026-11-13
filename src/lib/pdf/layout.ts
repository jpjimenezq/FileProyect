import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from 'pdf-lib'
import type { Progress } from './ops'
import { rotatedOrigin } from './ops'

const load = async (file: File) => PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false })

/** pdf-lib no puede incrustar una página sin contenido (una hoja en blanco): se le da un contenido vacío */
async function loadForEmbedding(file: File) {
  const doc = await load(file)
  for (const page of doc.getPages()) {
    if (!page.node.Contents()) page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream('')))
  }
  return doc
}

export const PAPER = {
  a4: { label: 'A4', w: 595.28, h: 841.89 },
  a3: { label: 'A3', w: 841.89, h: 1190.55 },
  a5: { label: 'A5', w: 419.53, h: 595.28 },
  letter: { label: 'Carta', w: 612, h: 792 },
} as const
export type PaperId = keyof typeof PAPER

// ── Varias páginas por hoja ─────────────────────────────────────────────
export type PerSheet = 2 | 4 | 6 | 9

/** Columnas y filas para cada cantidad, según la hoja sea vertical u horizontal */
export function gridFor(perSheet: PerSheet, landscape: boolean): { cols: number; rows: number } {
  const wide = { 2: [2, 1], 4: [2, 2], 6: [3, 2], 9: [3, 3] }[perSheet]
  return landscape ? { cols: wide[0], rows: wide[1] } : { cols: wide[1], rows: wide[0] }
}

export async function multiPageLayout(file: File, o: { perSheet: PerSheet; landscape: boolean; border: boolean; paper: PaperId }, onProgress?: Progress) {
  const src = await loadForEmbedding(file)
  const out = await PDFDocument.create()
  const embedded = await out.embedPdf(src, src.getPageIndices())
  const sheetW = o.landscape ? PAPER[o.paper].h : PAPER[o.paper].w
  const sheetH = o.landscape ? PAPER[o.paper].w : PAPER[o.paper].h
  const { cols, rows } = gridFor(o.perSheet, o.landscape)
  const margin = 24
  const gap = 12
  const cellW = (sheetW - margin * 2 - gap * (cols - 1)) / cols
  const cellH = (sheetH - margin * 2 - gap * (rows - 1)) / rows

  for (let i = 0; i < embedded.length; i += o.perSheet) {
    const sheet = out.addPage([sheetW, sheetH])
    for (let k = 0; k < o.perSheet && i + k < embedded.length; k++) {
      const page = embedded[i + k]
      const col = k % cols
      const row = Math.floor(k / cols)
      const scale = Math.min(cellW / page.width, cellH / page.height)
      const w = page.width * scale
      const h = page.height * scale
      const x = margin + col * (cellW + gap) + (cellW - w) / 2
      const y = sheetH - margin - row * (cellH + gap) - cellH + (cellH - h) / 2
      sheet.drawPage(page, { x, y, width: w, height: h })
      if (o.border) sheet.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.75 })
    }
    onProgress?.(Math.min(1, (i + o.perSheet) / embedded.length))
  }
  return out.save()
}

// ── Escalar páginas ─────────────────────────────────────────────────────
export type ScaleOptions = { mode: 'paper'; paper: PaperId } | { mode: 'percent'; percent: number }

export async function scalePages(file: File, o: ScaleOptions, onProgress?: Progress) {
  const src = await loadForEmbedding(file)
  const out = await PDFDocument.create()
  const embedded = await out.embedPdf(src, src.getPageIndices())
  embedded.forEach((page, i) => {
    let w: number, h: number
    if (o.mode === 'percent') {
      w = page.width * (o.percent / 100)
      h = page.height * (o.percent / 100)
    } else {
      // el papel respeta la orientación de la página original
      const p = PAPER[o.paper]
      ;[w, h] = page.width > page.height ? [p.h, p.w] : [p.w, p.h]
    }
    const scale = Math.min(w / page.width, h / page.height)
    const dw = page.width * scale
    const dh = page.height * scale
    out.addPage([w, h]).drawPage(page, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh })
    onProgress?.((i + 1) / embedded.length)
  })
  return out.save()
}

// ── Estampar ────────────────────────────────────────────────────────────
export type StampPosition = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br'
export type StampPages = 'all' | 'first' | 'last' | 'odd' | 'even'

export interface StampOptions {
  text?: string
  image?: File
  size: number
  color: string
  opacity: number
  rotation: number
  position: StampPosition
  margin: number
  pages: StampPages
  frame: boolean
  /** ancho de la imagen como fracción del ancho de página */
  imageScale: number
}

export const pageSelected = (pages: StampPages, index: number, total: number) =>
  pages === 'all' || (pages === 'first' && index === 0) || (pages === 'last' && index === total - 1) || (pages === 'odd' && index % 2 === 0) || (pages === 'even' && index % 2 === 1)

/** Centro (x,y en coordenadas PDF) de un recuadro de bw×bh colocado en una de las 9 posiciones de la hoja */
export function stampCenter(position: StampPosition, pageW: number, pageH: number, bw: number, bh: number, margin: number) {
  const px = { l: 0, c: 0.5, r: 1 }[position[1] as 'l' | 'c' | 'r']
  const py = { t: 1, m: 0.5, b: 0 }[position[0] as 't' | 'm' | 'b']
  return { x: margin + bw / 2 + px * (pageW - 2 * margin - bw), y: margin + bh / 2 + py * (pageH - 2 * margin - bh) }
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export async function addStamp(file: File, o: StampOptions) {
  const doc = await load(file)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  let image: Awaited<ReturnType<typeof doc.embedPng>> | undefined
  if (o.image) {
    const bytes = new Uint8Array(await o.image.arrayBuffer())
    if (o.image.type === 'image/jpeg') image = await doc.embedJpg(bytes)
    else if (o.image.type === 'image/png') image = await doc.embedPng(bytes)
    else {
      // WebP u otros: se pasa por un canvas
      const bmp = await createImageBitmap(o.image)
      const c = document.createElement('canvas')
      c.width = bmp.width; c.height = bmp.height
      c.getContext('2d')!.drawImage(bmp, 0, 0)
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo leer la imagen'))), 'image/png'))
      image = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()))
    }
  }
  const pages = doc.getPages()
  const color = hexToRgb(o.color)
  const t = (o.rotation * Math.PI) / 180

  pages.forEach((page, index) => {
    if (!pageSelected(o.pages, index, pages.length)) return
    const { width: W, height: H } = page.getSize()
    const w = image ? W * o.imageScale : font.widthOfTextAtSize(o.text ?? '', o.size)
    const h = image ? (image.height / image.width) * w : font.heightAtSize(o.size, { descender: false })
    const pad = o.frame ? o.size * 0.45 : 0
    const fw = w + pad * 2
    const fh = h + pad * 2
    const bw = Math.abs(fw * Math.cos(t)) + Math.abs(fh * Math.sin(t))
    const bh = Math.abs(fw * Math.sin(t)) + Math.abs(fh * Math.cos(t))
    const c = stampCenter(o.position, W, H, bw, bh, o.margin)

    if (o.frame) {
      const f = rotatedOrigin(c.x, c.y, fw, fh, o.rotation)
      page.drawRectangle({ x: f.x, y: f.y, width: fw, height: fh, rotate: degrees(o.rotation), borderColor: color, borderWidth: 2.5, borderOpacity: o.opacity })
    }
    const { x, y } = rotatedOrigin(c.x, c.y, w, h, o.rotation)
    if (image) page.drawImage(image, { x, y, width: w, height: h, opacity: o.opacity, rotate: degrees(o.rotation) })
    else if (o.text) page.drawText(o.text, { x, y, size: o.size, font, color, opacity: o.opacity, rotate: degrees(o.rotation) })
  })
  return doc.save()
}

// ── Dividir por tamaño ──────────────────────────────────────────────────
async function chunkBytes(src: PDFDocument, from: number, to: number) {
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, Array.from({ length: to - from }, (_, i) => from + i))
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

/**
 * Parte el PDF en trozos que no superen `maxBytes`. Cada trozo se busca por tramos (crece al doble y luego
 * se afina con búsqueda binaria) midiendo el tamaño real del archivo resultante. Una página que por sí sola
 * supera el límite va en un trozo propio y se marca como `oversize`.
 */
export async function splitBySize(file: File, maxBytes: number, onProgress?: Progress) {
  const src = await load(file)
  const total = src.getPageCount()
  const parts: { from: number; to: number; bytes: Uint8Array; oversize: boolean }[] = []
  let start = 0
  while (start < total) {
    const first = await chunkBytes(src, start, start + 1)
    if (first.length > maxBytes) {
      parts.push({ from: start, to: start + 1, bytes: first, oversize: true })
      start += 1
    } else {
      let good = 1
      let goodBytes = first
      let step = 1
      let bad = 0
      // tramo creciente hasta pasarse del límite o llegar al final
      while (!bad && start + good < total) {
        const end = Math.min(total, start + good + step)
        const bytes = await chunkBytes(src, start, end)
        if (bytes.length <= maxBytes) { good = end - start; goodBytes = bytes; step *= 2 } else bad = end - start
      }
      // búsqueda binaria entre lo que cabe y lo que no
      let lo = good
      let hi = bad || good
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        const bytes = await chunkBytes(src, start, start + mid)
        if (bytes.length <= maxBytes) { lo = mid; goodBytes = bytes } else hi = mid
      }
      parts.push({ from: start, to: start + lo, bytes: goodBytes, oversize: false })
      start += lo
    }
    onProgress?.(start / total)
  }
  return parts
}
