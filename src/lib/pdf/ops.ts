import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

export type Progress = (fraction: number) => void

const load = async (file: File) => PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })

export const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' })

/** "1-3, 5, 8-" -> [[1,2,3],[5],[8..total]] (páginas 1-based) */
export function parseRanges(input: string, total: number): number[][] {
  const ranges: number[][] = []
  for (const raw of input.split(',')) {
    const token = raw.trim()
    if (!token) continue
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(token) ?? /^(\d+)$/.exec(token)
    if (!m) throw new Error(`Rango no válido: "${token}"`)
    const from = m[1] === '' ? 1 : Number(m[1])
    const to = m.length === 2 ? from : m[2] === '' ? total : Number(m[2])
    if (from < 1 || to > total || from > to) throw new Error(`Rango fuera de límites: "${token}" (el PDF tiene ${total} páginas)`)
    ranges.push(Array.from({ length: to - from + 1 }, (_, i) => from + i))
  }
  if (!ranges.length) throw new Error('Indica al menos un rango')
  return ranges
}

export async function mergePdfs(files: File[], onProgress?: Progress) {
  const out = await PDFDocument.create()
  for (const [i, file] of files.entries()) {
    const src = await load(file)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
    onProgress?.((i + 1) / files.length)
  }
  return out.save()
}

/** Crea un PDF con las páginas indicadas (1-based), en ese orden */
export async function extractPages(file: File, pages: number[]) {
  const src = await load(file)
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, pages.map((p) => p - 1))
  copied.forEach((p) => out.addPage(p))
  return out.save()
}

export async function rotatePages(file: File, quarterTurns: number[]) {
  const doc = await load(file)
  doc.getPages().forEach((page, i) => {
    const extra = (quarterTurns[i] ?? 0) * 90
    if (extra) page.setRotation(degrees((page.getRotation().angle + extra + 360) % 360))
  })
  return doc.save()
}

export async function pageCount(file: File) {
  return (await load(file)).getPageCount()
}

export type ImageOptions = { orientation: 'auto' | 'portrait' | 'landscape'; size: 'a4' | 'letter' | 'fit'; margin: number }

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const

async function toPng(file: File): Promise<Uint8Array> {
  const bmp = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  canvas.getContext('2d')!.drawImage(bmp, 0, 0)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo leer la imagen'))), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

export async function imagesToPdf(files: File[], opts: ImageOptions, onProgress?: Progress) {
  const doc = await PDFDocument.create()
  for (const [i, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const img = file.type === 'image/jpeg' ? await doc.embedJpg(bytes) : file.type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedPng(await toPng(file))
    const m = opts.margin
    let pw: number, ph: number
    if (opts.size === 'fit') {
      pw = img.width + m * 2
      ph = img.height + m * 2
    } else {
      const [w, h] = SIZES[opts.size]
      const landscape = opts.orientation === 'auto' ? img.width > img.height : opts.orientation === 'landscape'
      ;[pw, ph] = landscape ? [h, w] : [w, h]
    }
    const scale = Math.min((pw - m * 2) / img.width, (ph - m * 2) / img.height, opts.size === 'fit' ? 1 : Infinity)
    const w = img.width * scale
    const h = img.height * scale
    doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h })
    onProgress?.((i + 1) / files.length)
  }
  return doc.save()
}

export type NumberOptions = {
  position: 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'
  format: 'n' | 'page-n' | 'page-n-of-N'
  first: number
  from: number
  size: number
  margin: number
}

export async function addPageNumbers(file: File, o: NumberOptions) {
  const doc = await load(file)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  pages.forEach((page, i) => {
    const n = i + 1
    if (n < o.from) return
    const num = o.first + (n - o.from)
    const text = o.format === 'n' ? `${num}` : o.format === 'page-n' ? `Página ${num}` : `Página ${num} de ${pages.length}`
    const { width, height } = page.getSize()
    const tw = font.widthOfTextAtSize(text, o.size)
    const x = o.position[1] === 'l' ? o.margin : o.position[1] === 'c' ? (width - tw) / 2 : width - tw - o.margin
    const y = o.position[0] === 't' ? height - o.margin - o.size : o.margin
    page.drawText(text, { x, y, size: o.size, font, color: rgb(0.15, 0.15, 0.15) })
  })
  return doc.save()
}

export type WatermarkOptions = {
  text?: string
  image?: File
  size: number
  color: string
  opacity: number
  rotation: number
  /** ancho de la imagen como fracción del ancho de página */
  imageScale: number
  /** 'single' = una marca centrada; 'tile' = se repite por toda la hoja */
  layout?: WatermarkLayout
  density?: TileDensity
}

export type WatermarkLayout = 'single' | 'tile'

/** Separación entre marcas repetidas, como fracción del tamaño de cada marca */
export const TILE_GAP = { wide: 1.4, normal: 0.7, tight: 0.3 }
export type TileDensity = keyof typeof TILE_GAP

const MAX_MARKS = 300

/**
 * Centros donde se dibuja la marca de agua en una página de pageW×pageH (pt, origen abajo a la izquierda).
 * 'single': uno, en el centro. 'tile': una cuadrícula centrada en la hoja (una marca coincide con el centro y el
 * dibujo es simétrico, así no parece anclado a una esquina), con las filas alternas desplazadas media celda.
 * La celda se calcula con el recuadro de la marca ya girada; solo se conservan las marcas que tocan la hoja.
 */
export function watermarkPositions(pageW: number, pageH: number, w: number, h: number, deg: number, layout: WatermarkLayout = 'single', density: TileDensity = 'normal') {
  const cx = pageW / 2
  const cy = pageH / 2
  if (layout === 'single') return [{ x: cx, y: cy }]
  const t = (deg * Math.PI) / 180
  const boxW = Math.abs(w * Math.cos(t)) + Math.abs(h * Math.sin(t))
  const boxH = Math.abs(w * Math.sin(t)) + Math.abs(h * Math.cos(t))
  const factor = 1 + TILE_GAP[density]
  let stepX = Math.max(boxW * factor, 24)
  let stepY = Math.max(boxH * factor, 24)

  const build = () => {
    const out: { x: number; y: number }[] = []
    const rows = Math.ceil(cy / stepY) + 1
    const cols = Math.ceil(cx / stepX) + 1
    for (let r = -rows; r <= rows; r++) {
      const shift = Math.abs(r) % 2 ? stepX / 2 : 0
      const y = cy + r * stepY
      for (let c = -cols; c <= cols; c++) {
        const x = cx + c * stepX + shift
        if (x + boxW / 2 > 0 && x - boxW / 2 < pageW && y + boxH / 2 > 0 && y - boxH / 2 < pageH) out.push({ x, y })
      }
    }
    return out
  }
  let marks = build()
  // si la marca es diminuta, se espacia más en vez de generar miles de objetos
  while (marks.length > MAX_MARKS) { stepX *= 1.25; stepY *= 1.25; marks = build() }
  return marks
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Esquina inferior izquierda desde la que dibujar un objeto w×h centrado en (cx,cy) y girado `deg` */
export function rotatedOrigin(cx: number, cy: number, w: number, h: number, deg: number) {
  const t = (deg * Math.PI) / 180
  return { x: cx - (w / 2) * Math.cos(t) + (h / 2) * Math.sin(t), y: cy - (w / 2) * Math.sin(t) - (h / 2) * Math.cos(t) }
}

export async function addWatermark(file: File, o: WatermarkOptions) {
  const doc = await load(file)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  let image: Awaited<ReturnType<typeof doc.embedPng>> | undefined
  if (o.image) {
    const bytes = new Uint8Array(await o.image.arrayBuffer())
    image = o.image.type === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(o.image.type === 'image/png' ? bytes : await toPng(o.image))
  }
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    if (image) {
      const w = width * o.imageScale
      const h = (image.height / image.width) * w
      for (const c of watermarkPositions(width, height, w, h, o.rotation, o.layout, o.density)) {
        const { x, y } = rotatedOrigin(c.x, c.y, w, h, o.rotation)
        page.drawImage(image, { x, y, width: w, height: h, opacity: o.opacity, rotate: degrees(o.rotation) })
      }
    } else if (o.text) {
      const w = font.widthOfTextAtSize(o.text, o.size)
      const h = font.heightAtSize(o.size, { descender: false })
      for (const c of watermarkPositions(width, height, w, h, o.rotation, o.layout, o.density)) {
        const { x, y } = rotatedOrigin(c.x, c.y, w, h, o.rotation)
        page.drawText(o.text, { x, y, size: o.size, font, color: hexToRgb(o.color), opacity: o.opacity, rotate: degrees(o.rotation) })
      }
    }
  }
  return doc.save()
}
