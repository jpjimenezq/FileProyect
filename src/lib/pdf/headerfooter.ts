import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

export type HFAlign = 'l' | 'c' | 'r'
export type HFBand = 'header' | 'footer'
/** Texto de cada una de las tres cajas de un bloque */
export type HFBlock = Record<HFAlign, string>

export interface HFOptions {
  header: HFBlock
  footer: HFBlock
  size: number
  /** Color #rrggbb */
  color: string
  /** Distancia al borde de la hoja, en puntos */
  margin: number
  /** Primera página (1-based) que lleva texto */
  from: number
  skipFirst: boolean
}

export interface HFVars {
  page: number
  total: number
  date: Date
  /** Nombre del archivo sin extensión */
  file: string
}

export const ALIGNS: HFAlign[] = ['l', 'c', 'r']
export const emptyBlock = (): HFBlock => ({ l: '', c: '', r: '' })
export const isBlockEmpty = (b: HFBlock) => ALIGNS.every((a) => !b[a].trim())

const two = (n: number) => String(n).padStart(2, '0')
/** dd/mm/aaaa */
export const formatDate = (d: Date) => `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`

/** Sustituye {pagina}, {total}, {fecha} y {archivo} (sin distinguir mayúsculas ni tildes en «página») */
export function fillVariables(text: string, v: HFVars) {
  return text.replace(/\{(p[aá]gina|total|fecha|archivo)\}/gi, (_, name: string) => {
    switch (name.toLowerCase()) {
      case 'total': return String(v.total)
      case 'fecha': return formatDate(v.date)
      case 'archivo': return v.file
      default: return String(v.page)
    }
  })
}

/** ¿Lleva texto esta página (1-based)? */
export const pageHasText = (page: number, o: Pick<HFOptions, 'from' | 'skipFirst'>) =>
  page >= Math.max(1, o.from) && !(o.skipFirst && page === 1)

/** Páginas (1-based) que llevarán texto */
export const pagesWithText = (total: number, o: Pick<HFOptions, 'from' | 'skipFirst'>) =>
  Array.from({ length: total }, (_, i) => i + 1).filter((p) => pageHasText(p, o))

/** Coordenada x (en la hoja tal y como se ve) donde empieza un texto de ancho `textW` */
export const alignedX = (align: HFAlign, pageW: number, textW: number, margin: number) =>
  align === 'l' ? margin : align === 'c' ? (pageW - textW) / 2 : pageW - textW - margin

/** Distancia de la línea base al borde superior (encabezado) o inferior (pie) */
export const baselineFromEdge = (band: HFBand, size: number, margin: number) => (band === 'header' ? margin + size * 0.78 : margin)

// Letras que admiten las fuentes estándar del PDF (WinAnsi)
const WIN_EXTRA = new Set([0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178])
const isWinAnsi = (ch: string) => {
  const c = ch.codePointAt(0)!
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_EXTRA.has(c)
}
/** Quita lo que Helvetica no puede dibujar (emojis, alfabetos no latinos…); saltos y tabulaciones pasan a espacio */
export const toWinAnsi = (text: string) => [...text.replace(/[\r\n\t]+/g, ' ')].filter(isWinAnsi).join('')

/**
 * Convierte un punto de la hoja tal y como se ve (origen abajo a la izquierda, ya girada) a
 * coordenadas del PDF sin girar, junto con el ángulo con el que hay que escribir el texto para que se lea recto.
 */
export function toPageSpace(box: { x: number; y: number; width: number; height: number }, rotate: number, vx: number, vy: number) {
  const r = (((Math.round(rotate / 90) * 90) % 360) + 360) % 360
  const { x, y, width: w, height: h } = box
  switch (r) {
    case 90: return { x: x + (w - vy), y: y + vx, angle: 90 }
    case 180: return { x: x + (w - vx), y: y + (h - vy), angle: 180 }
    case 270: return { x: x + vy, y: y + (h - vx), angle: 270 }
    default: return { x: x + vx, y: y + vy, angle: 0 }
  }
}

const hexToRgb = (hex: string) => {
  const n = parseInt(/^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '16152b', 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export async function addHeaderFooter(file: File, o: HFOptions, file_name: string, progress?: (f: number) => void) {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const date = new Date()
  const color = hexToRgb(o.color)
  pages.forEach((page, i) => {
    const n = i + 1
    if (pageHasText(n, o)) {
      const box = page.getCropBox()
      const rot = page.getRotation().angle
      const swap = Math.round(rot / 90) % 2 !== 0
      const vw = swap ? box.height : box.width
      const vh = swap ? box.width : box.height
      for (const band of ['header', 'footer'] as const) {
        for (const a of ALIGNS) {
          const text = toWinAnsi(fillVariables(o[band][a], { page: n, total: pages.length, date, file: file_name })).trim()
          if (!text) continue
          const tw = font.widthOfTextAtSize(text, o.size)
          const vx = alignedX(a, vw, tw, o.margin)
          const vy = band === 'header' ? vh - baselineFromEdge(band, o.size, o.margin) : baselineFromEdge(band, o.size, o.margin)
          const at = toPageSpace(box, rot, vx, vy)
          page.drawText(text, { x: at.x, y: at.y, size: o.size, font, color, rotate: degrees(at.angle) })
        }
      }
    }
    progress?.((i + 1) / pages.length)
  })
  return doc.save()
}
