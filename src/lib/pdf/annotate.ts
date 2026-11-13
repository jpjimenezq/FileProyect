import {
  PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts, beginText, degrees, endText, popGraphicsState, pushGraphicsState, rgb,
  setCharacterSqueeze, setFillingColor, setFontAndSize, setTextMatrix, setWordSpacing, showText,
} from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'
import type { Cut, EditRun } from './textedit'
import type { LayoutLine } from './paragraphs'
import { editContent } from './stripText'
import type { Done, Plan } from './stripText'

/** Coordenadas normalizadas (0-1) sobre la página tal como se ve: origen arriba a la izquierda. */
export type Item =
  | { id: string; page: number; kind: 'text'; x: number; y: number; text: string; size: number; color: string }
  | { id: string; page: number; kind: 'rect' | 'highlight' | 'redact'; x: number; y: number; w: number; h: number; color: string }
  | { id: string; page: number; kind: 'pen'; points: [number, number][]; color: string; width: number }
  | { id: string; page: number; kind: 'image'; x: number; y: number; w: number; ratio: number; src: string }
  /** Texto de la propia página (un párrafo o una línea) reescrito: se quita el original (o se tapa con `bg`) y se escribe `layout` */
  | RemoveItem
  | { id: string; page: number; kind: 'edit'; line: string; x: number; y: number; w: number; h: number; k: number; W: number; H: number; bg: string; orig: string; runs: EditRun[]; layout: LayoutLine[]; cut?: Cut }

/** Una raya, forma o imagen de la propia página que se quita (o se tapa con `bg` si no se puede quitar del contenido) */
type RemoveItem = { id: string; page: number; kind: 'remove'; what: 'line' | 'shape' | 'image'; x: number; y: number; w: number; h: number; bg: string; gfx: { via: 'paint' | 'draw'; ord: number; paintsTotal: number; drawsTotal: number } }

export type RectItem = Extract<Item, { kind: 'rect' | 'highlight' | 'redact' }>
export type EditItem = Extract<Item, { kind: 'edit' }>
export type RemoveGraphic = Extract<Item, { kind: 'remove' }>

// Letras que admiten las fuentes estándar del PDF (codificación WinAnsi)
const WIN_EXTRA = new Set([0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178])
export const isWinAnsi = (ch: string) => {
  const c = ch.codePointAt(0)!
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_EXTRA.has(c)
}
/** Letras de un texto que no se podrán guardar con las fuentes estándar */
export const unsupportedChars = (text: string) => [...new Set([...text].filter((c) => !isWinAnsi(c)))]
const safeText = (text: string) => [...text].map((c) => (isWinAnsi(c) ? c : '?')).join('')

const FONT_NAMES = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
} as const

const load = async (file: File) => PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })

const hex = (c: string) => {
  const n = parseInt(c.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Tamaño de la página en pt tal como se ve (con la rotación aplicada) */
export function visualSize(page: PDFPage) {
  const { width, height } = page.getSize()
  return page.getRotation().angle % 180 === 0 ? { w: width, h: height } : { w: height, h: width }
}

/** Punto visual normalizado (u,v desde arriba-izquierda) -> coordenadas de usuario del PDF */
export function visualToPdf(page: PDFPage, u: number, v: number) {
  const { width: W, height: H } = page.getSize()
  switch (((page.getRotation().angle % 360) + 360) % 360) {
    case 90: return { x: v * W, y: u * H }
    case 180: return { x: (1 - u) * W, y: v * H }
    case 270: return { x: (1 - v) * W, y: (1 - u) * H }
    default: return { x: u * W, y: (1 - v) * H }
  }
}

async function drawEdit(doc: PDFDocument, page: PDFPage, item: EditItem, fonts: Map<string, PDFFont>, removed: boolean) {
  const { w: Vw, h: Vh } = visualSize(page)
  const angle = page.getRotation().angle
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  const fontOf = async (r: EditRun) => {
    const name = FONT_NAMES[r.family][(r.bold ? 1 : 0) + (r.italic ? 2 : 0)]
    let f = fonts.get(name)
    if (!f) { f = await doc.embedFont(name); fonts.set(name, f) }
    return f
  }

  // 1. si el texto original no se pudo quitar del todo, se tapa con el color del fondo
  const pad = 1
  if (!removed) {
    const corner = visualToPdf(page, (item.x * Vw - pad) / Vw, (item.y * Vh + item.h * Vh + pad) / Vh)
    page.drawRectangle({ x: corner.x, y: corner.y, width: item.w * Vw + pad * 2, height: item.h * Vh + pad * 2, color: hex(item.bg), rotate: degrees(angle) })
  }

  // 2. escribir el texto nuevo, línea a línea y tramo a tramo, sobre las líneas base
  for (const line of item.layout) {
    const origin = visualToPdf(page, item.x, line.baseline)
    let advance = 0
    for (const r of line.runs) {
      if (r.text === '') continue
      const font = await fontOf(r)
      const text = safeText(r.text)
      const spaces = [...text].filter((c) => c === ' ').length
      const key = page.node.newFontDictionary(font.name, font.ref)
      page.pushOperators(
        pushGraphicsState(),
        setFillingColor(hex(r.color)),
        beginText(),
        setFontAndSize(key, r.size),
        setCharacterSqueeze(item.k * 100),
        setWordSpacing(line.ws),
        setTextMatrix(cos, sin, -sin, cos, origin.x + advance * cos, origin.y + advance * sin),
        showText(font.encodeText(text)),
        endText(),
        popGraphicsState(),
      )
      advance += (font.widthOfTextAtSize(text, r.size) + spaces * line.ws) * item.k
    }
  }
}

const dataUrlBytes = (src: string) => Uint8Array.from(atob(src.split(',')[1]), (c) => c.charCodeAt(0))

export async function applyAnnotations(file: File, items: Item[]) {
  const doc = await load(file)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const editFonts = new Map<string, PDFFont>()

  // antes de dibujar nada: quitar de verdad del contenido el texto original de lo que se reescribe y los dibujos que se eliminan
  const plans = new Map<number, Plan>()
  const planOf = (n: number) => { let p = plans.get(n); if (!p) { p = {}; plans.set(n, p) } return p }
  for (const it of items) {
    const target = pages[it.page - 1]
    if (!target) continue
    if (it.kind === 'edit' && it.cut && target.getRotation().angle === 0) {
      const p = planOf(it.page)
      p.shows ??= { advance: new Map(), total: it.cut.total }
      for (const o of it.cut.ops) p.shows.advance.set(o.ord, o.advance)
    } else if (it.kind === 'remove') {
      const p = planOf(it.page)
      if (it.gfx.via === 'paint') { p.paints ??= { ords: new Set(), total: it.gfx.paintsTotal }; p.paints.ords.add(it.gfx.ord) }
      else { p.draws ??= { ords: new Set(), total: it.gfx.drawsTotal }; p.draws.ords.add(it.gfx.ord) }
    }
  }
  const done = new Map<number, Done>()
  for (const [n, plan] of plans) done.set(n, editContent(doc, pages[n - 1], plan))

  for (const item of items) {
    const page = pages[item.page - 1]
    if (!page) continue
    const { w: Vw, h: Vh } = visualSize(page)
    const rotate = degrees(page.getRotation().angle)

    if (item.kind === 'edit') {
      await drawEdit(doc, page, item, editFonts, !!done.get(item.page)?.shows && !!item.cut?.complete)
    } else if (item.kind === 'remove') {
      // si no se pudo quitar del contenido, se tapa con el color del fondo
      const ok = done.get(item.page)?.[item.gfx.via === 'paint' ? 'paints' : 'draws']
      if (!ok) {
        const pad = 1
        const corner = visualToPdf(page, (item.x * Vw - pad) / Vw, (item.y * Vh + item.h * Vh + pad) / Vh)
        page.drawRectangle({ x: corner.x, y: corner.y, width: item.w * Vw + pad * 2, height: item.h * Vh + pad * 2, color: hex(item.bg), rotate: rotate })
      }
    } else if (item.kind === 'text') {
      const o = visualToPdf(page, item.x, item.y + (item.size * 0.8) / Vh)
      page.drawText(item.text, { x: o.x, y: o.y, size: item.size, font, color: hex(item.color), lineHeight: item.size * 1.2, rotate })
    } else if (item.kind === 'pen') {
      for (let i = 1; i < item.points.length; i++) {
        const a = visualToPdf(page, ...item.points[i - 1])
        const b = visualToPdf(page, ...item.points[i])
        page.drawLine({ start: a, end: b, thickness: item.width, color: hex(item.color), lineCap: 1 })
      }
    } else if (item.kind === 'image') {
      const bytes = dataUrlBytes(item.src)
      const img = item.src.startsWith('data:image/jpeg') ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
      const width = item.w * Vw
      const height = width * item.ratio
      const o = visualToPdf(page, item.x, item.y + height / Vh)
      page.drawImage(img, { x: o.x, y: o.y, width, height, rotate })
    } else {
      const o = visualToPdf(page, item.x, item.y + item.h)
      const common = { x: o.x, y: o.y, width: item.w * Vw, height: item.h * Vh, rotate }
      if (item.kind === 'rect') page.drawRectangle({ ...common, borderColor: hex(item.color), borderWidth: 2 })
      else page.drawRectangle({ ...common, color: hex(item.color), opacity: item.kind === 'highlight' ? 0.4 : 1 })
    }
  }
  return doc.save()
}

/** Recorta todas las páginas con un rectángulo normalizado (visual) */
export async function cropPages(file: File, box: { x: number; y: number; w: number; h: number }) {
  const doc = await load(file)
  for (const page of doc.getPages()) {
    const a = visualToPdf(page, box.x, box.y)
    const b = visualToPdf(page, box.x + box.w, box.y + box.h)
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const width = Math.abs(a.x - b.x)
    const height = Math.abs(a.y - b.y)
    page.setMediaBox(x, y, width, height)
    page.setCropBox(x, y, width, height)
  }
  return doc.save()
}

export type FieldInfo = {
  name: string
  type: 'text' | 'checkbox' | 'dropdown' | 'list' | 'radio'
  options: string[]
  value: string | boolean
}

export async function listFields(file: File): Promise<FieldInfo[]> {
  const doc = await load(file)
  const out: FieldInfo[] = []
  for (const f of doc.getForm().getFields()) {
    const name = f.getName()
    if (f instanceof PDFTextField) out.push({ name, type: 'text', options: [], value: f.getText() ?? '' })
    else if (f instanceof PDFCheckBox) out.push({ name, type: 'checkbox', options: [], value: f.isChecked() })
    else if (f instanceof PDFDropdown) out.push({ name, type: 'dropdown', options: f.getOptions(), value: f.getSelected()[0] ?? '' })
    else if (f instanceof PDFOptionList) out.push({ name, type: 'list', options: f.getOptions(), value: f.getSelected()[0] ?? '' })
    else if (f instanceof PDFRadioGroup) out.push({ name, type: 'radio', options: f.getOptions(), value: f.getSelected() ?? '' })
  }
  return out
}

export async function fillForm(file: File, values: Record<string, string | boolean>, flatten: boolean) {
  const doc = await load(file)
  const form = doc.getForm()
  for (const f of form.getFields()) {
    const v = values[f.getName()]
    if (v === undefined) continue
    if (f instanceof PDFTextField) f.setText(String(v))
    else if (f instanceof PDFCheckBox) (v ? f.check() : f.uncheck())
    else if (f instanceof PDFDropdown || f instanceof PDFOptionList) { if (v) f.select(String(v)) }
    else if (f instanceof PDFRadioGroup) { if (v) f.select(String(v)) }
  }
  if (flatten) form.flatten()
  return doc.save()
}
