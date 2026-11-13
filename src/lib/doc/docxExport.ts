import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, ImageRun, LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import type { ParagraphChild } from 'docx'

/** Nodo del documento de TipTap (ProseMirror en JSON) */
export interface PMNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED,
}
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]

const hex = (c: unknown) => (typeof c === 'string' ? c.replace('#', '').toUpperCase() : undefined)

/** "16px" o "12pt" -> medios puntos (la unidad de tamaño de Word) */
export function toHalfPoints(size: unknown): number | undefined {
  if (typeof size !== 'string') return undefined
  const m = /^([\d.]+)(px|pt)?$/.exec(size.trim())
  if (!m) return undefined
  const n = Number(m[1])
  return Math.round(m[2] === 'pt' ? n * 2 : n * 1.5)
}

/** Resuelve cualquier color CSS (#rgb, #rrggbb o rgb()) a RRGGBB */
export function cssColor(c: unknown): string | undefined {
  if (typeof c !== 'string') return undefined
  const rgbM = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c)
  if (rgbM) return [rgbM[1], rgbM[2], rgbM[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
  const h = c.replace('#', '')
  if (/^[0-9a-f]{3}$/i.test(h)) return h.split('').map((x) => x + x).join('').toUpperCase()
  return /^[0-9a-f]{6}$/i.test(h) ? h.toUpperCase() : undefined
}

function dataUrl(src: unknown): { bytes: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } | undefined {
  if (typeof src !== 'string') return undefined
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(src)
  if (!m) return undefined
  const bin = atob(m[2])
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  const t = m[1].toLowerCase()
  return { bytes, type: t === 'jpeg' || t === 'jpg' ? 'jpg' : (t as 'png' | 'gif' | 'bmp') }
}

interface Ctx {
  numbering: { reference: string; levels: unknown[] }[]
  orderedCount: number
}

function runsOf(node: PMNode, base: { size?: number; font?: string; bold?: boolean; italics?: boolean } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = []
  for (const child of node.content ?? []) {
    if (child.type === 'hardBreak') { out.push(new TextRun({ break: 1 })); continue }
    if (child.type === 'image') {
      const img = dataUrl(child.attrs?.src)
      if (img) {
        out.push(new ImageRun({ type: img.type, data: img.bytes, transformation: { width: Number(child.attrs?.width) || 300, height: Number(child.attrs?.height) || 200 } }))
      } else out.push(new TextRun({ text: '[imagen]' }))
      continue
    }
    if (child.type !== 'text' || child.text === undefined) continue
    const marks = Object.fromEntries((child.marks ?? []).map((m) => [m.type, m.attrs ?? {}]))
    const style = marks.textStyle ?? {}
    const link = marks.link?.href
    const run = new TextRun({
      text: child.text,
      bold: base.bold || 'bold' in marks || undefined,
      italics: base.italics || 'italic' in marks || undefined,
      underline: 'underline' in marks || link ? {} : undefined,
      strike: 'strike' in marks || undefined,
      color: link ? '0563C1' : cssColor(style.color),
      font: (style.fontFamily as string | undefined)?.split(',')[0].replace(/["']/g, '').trim() || ('code' in marks ? 'Courier New' : base.font),
      size: toHalfPoints(style.fontSize) ?? base.size,
      shading: 'highlight' in marks && cssColor(marks.highlight.color) ? { type: ShadingType.CLEAR, fill: cssColor(marks.highlight.color)!, color: 'auto' } : undefined,
    })
    out.push(typeof link === 'string' ? new ExternalHyperlink({ link, children: [run] }) : run)
  }
  return out
}

function paragraph(node: PMNode, extra: Record<string, unknown> = {}, base: Parameters<typeof runsOf>[1] = {}) {
  const align = ALIGN[String(node.attrs?.textAlign ?? 'left')]
  return new Paragraph({ alignment: align, children: runsOf(node, base), ...extra } as ConstructorParameters<typeof Paragraph>[0])
}

function list(node: PMNode, ctx: Ctx, level: number, reference: string): Paragraph[] {
  const out: Paragraph[] = []
  const isOrdered = node.type === 'orderedList'
  // cada lista numerada tiene su propia numeración para que empiece en 1
  const ref = level === 0 ? (isOrdered ? newOrdered(ctx) : 'bullets') : reference
  for (const item of node.content ?? []) {
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') out.push(...list(child, ctx, level + 1, ref))
      else out.push(paragraph(child, { numbering: { reference: ref, level: Math.min(level, 4) } }))
    }
  }
  return out
}

function newOrdered(ctx: Ctx) {
  const reference = `numbers-${++ctx.orderedCount}`
  ctx.numbering.push({
    reference,
    levels: Array.from({ length: 5 }, (_, level) => ({
      level, format: LevelFormat.DECIMAL, text: `%${level + 1}.`, alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
    })),
  })
  return reference
}

function table(node: PMNode, ctx: Ctx): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: (node.content ?? []).map((row) => new TableRow({
      tableHeader: row.content?.every((c) => c.type === 'tableHeader') || undefined,
      children: (row.content ?? []).map((cell) => new TableCell({
        columnSpan: Number(cell.attrs?.colspan) > 1 ? Number(cell.attrs?.colspan) : undefined,
        rowSpan: Number(cell.attrs?.rowspan) > 1 ? Number(cell.attrs?.rowspan) : undefined,
        shading: cell.type === 'tableHeader' ? { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } : undefined,
        children: blocks(cell.content ?? [], ctx, cell.type === 'tableHeader' ? { bold: true } : {}),
      })),
    })),
  })
}

function blocks(nodes: PMNode[], ctx: Ctx, base: Parameters<typeof runsOf>[1] = {}): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph': out.push(paragraph(node, {}, base)); break
      case 'heading': out.push(paragraph(node, { heading: HEADINGS[Math.min(5, Math.max(0, Number(node.attrs?.level ?? 1) - 1))] }, base)); break
      case 'bulletList': case 'orderedList': out.push(...list(node, ctx, 0, '')); break
      case 'blockquote':
        for (const p of node.content ?? []) {
          out.push(paragraph(p, { indent: { left: 720 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BBBBBB', space: 12 } } }, { italics: true }))
        }
        break
      case 'codeBlock':
        for (const line of (node.content?.map((c) => c.text ?? '').join('') ?? '').split('\n')) {
          out.push(new Paragraph({ shading: { type: ShadingType.CLEAR, fill: 'F4F4F4', color: 'auto' }, children: [new TextRun({ text: line, font: 'Courier New', size: 20 })] }))
        }
        break
      case 'latexBlock':
        // Word no entiende LaTeX: se guarda el código de la fórmula, centrado, para no perderla
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(node.attrs?.latex ?? ''), font: 'Cambria Math', italics: true })] }))
        break
      case 'horizontalRule': out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } } })); break
      case 'table': out.push(table(node, ctx)); break
      case 'image': out.push(new Paragraph({ children: runsOf({ type: 'paragraph', content: [node] }) })); break
      default: if (node.content) out.push(...blocks(node.content, ctx, base))
    }
  }
  return out
}

export interface DocxOptions {
  /** Título que se guarda en las propiedades del archivo */
  title?: string
}

export function buildDocx(doc: PMNode, opts: DocxOptions = {}) {
  const ctx: Ctx = {
    orderedCount: 0,
    numbering: [{
      reference: 'bullets',
      levels: Array.from({ length: 5 }, (_, level) => ({
        level, format: LevelFormat.BULLET, text: ['•', '◦', '▪', '•', '◦'][level], alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
      })),
    }],
  }
  const children = blocks(doc.content ?? [], ctx)
  return new Document({
    title: opts.title,
    creator: 'FileProyect',
    numbering: { config: ctx.numbering as never },
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 36, bold: true }, paragraph: { spacing: { before: 280, after: 120 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true }, paragraph: { spacing: { before: 240, after: 100 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true }, paragraph: { spacing: { before: 200, after: 80 } } },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1417, bottom: 1417, left: 1417, right: 1417 } } }, children: children.length ? children : [new Paragraph('')] }],
  })
}

export async function exportDocx(doc: PMNode, opts: DocxOptions = {}): Promise<Blob> {
  return Packer.toBlob(buildDocx(doc, opts))
}

void hex
