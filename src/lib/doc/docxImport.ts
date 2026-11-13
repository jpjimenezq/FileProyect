import JSZip from 'jszip'
import type { PMNode } from './docxExport'

/**
 * Lee un .docx (OOXML) y lo convierte en el JSON de TipTap. Conserva títulos, negrita/cursiva/subrayado/tachado,
 * colores, tipo y tamaño de letra, resaltado, alineación, enlaces, listas (con niveles), tablas (con celdas combinadas)
 * e imágenes. Se ignoran cabeceras, pies, notas al pie y comentarios.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'

const HIGHLIGHT: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000',
  darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
}

const kids = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name && c.namespaceURI === W)
const kid = (el: Element | null | undefined, name: string) => (el ? kids(el, name)[0] : undefined)
const attr = (el: Element | null | undefined, name: string) => el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? null
/** Las casillas de Word (<w:b/>, <w:b w:val="0"/>) están activas salvo que valgan 0, false u off */
const on = (el: Element | undefined) => !!el && !['0', 'false', 'off', 'none'].includes((attr(el, 'val') ?? '').toLowerCase())

type Mark = { type: string; attrs?: Record<string, unknown> }
interface Context {
  zip: JSZip
  rels: Map<string, string>
  styles: Map<string, { name: string; basedOn?: string }>
  numbering: Map<string, 'bulletList' | 'orderedList'>
  images: Map<string, string>
}

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml')

async function readText(zip: JSZip, path: string) {
  const f = zip.file(path)
  return f ? f.async('string') : undefined
}

function headingLevel(ctx: Context, styleId: string | null): number {
  let id = styleId
  for (let i = 0; id && i < 5; i++) {
    const s = ctx.styles.get(id)
    if (!s) return 0
    const m = /^(?:heading|t[ií]tulo|titre|[uü]berschrift)\s*(\d)/i.exec(s.name)
    if (m) return Math.min(6, Number(m[1]))
    if (/^title$|^t[ií]tulo$/i.test(s.name)) return 1
    id = s.basedOn ?? null
  }
  return 0
}

async function image(ctx: Context, run: Element): Promise<PMNode | undefined> {
  const blip = run.getElementsByTagNameNS(A, 'blip')[0]
  const rid = blip?.getAttributeNS(R, 'embed')
  const target = rid ? ctx.rels.get(rid) : undefined
  if (!target) return undefined
  const path = target.startsWith('/') ? target.slice(1) : `word/${target}`
  let src = ctx.images.get(path)
  if (!src) {
    const f = ctx.zip.file(path)
    if (!f) return undefined
    const ext = path.split('.').pop()!.toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'png' ? 'image/png' : undefined
    if (!mime) return undefined
    src = `data:${mime};base64,${await f.async('base64')}`
    ctx.images.set(path, src)
  }
  const extent = run.getElementsByTagNameNS(WP, 'extent')[0]
  const width = extent ? Math.round(Number(extent.getAttribute('cx')) / 9525) : undefined
  const height = extent ? Math.round(Number(extent.getAttribute('cy')) / 9525) : undefined
  return { type: 'image', attrs: { src, width, height } }
}

async function runNodes(ctx: Context, run: Element, extra: Mark[]): Promise<PMNode[]> {
  const rPr = kid(run, 'rPr')
  const marks: Mark[] = [...extra]
  if (rPr) {
    if (on(kid(rPr, 'b'))) marks.push({ type: 'bold' })
    if (on(kid(rPr, 'i'))) marks.push({ type: 'italic' })
    const u = kid(rPr, 'u')
    if (u && on(u)) marks.push({ type: 'underline' })
    if (on(kid(rPr, 'strike'))) marks.push({ type: 'strike' })
    const style: Record<string, string> = {}
    const color = attr(kid(rPr, 'color'), 'val')
    if (color && color !== 'auto' && /^[0-9a-f]{6}$/i.test(color)) style.color = `#${color.toLowerCase()}`
    const sz = Number(attr(kid(rPr, 'sz'), 'val'))
    if (sz) style.fontSize = `${Math.round((sz / 2) * (4 / 3) * 10) / 10}px`
    const font = attr(kid(rPr, 'rFonts'), 'ascii')
    if (font) style.fontFamily = font
    if (Object.keys(style).length) marks.push({ type: 'textStyle', attrs: style })
    const hl = attr(kid(rPr, 'highlight'), 'val')
    if (hl && HIGHLIGHT[hl]) marks.push({ type: 'highlight', attrs: { color: HIGHLIGHT[hl] } })
    else {
      const fill = attr(kid(rPr, 'shd'), 'fill')
      if (fill && /^[0-9a-f]{6}$/i.test(fill)) marks.push({ type: 'highlight', attrs: { color: `#${fill.toLowerCase()}` } })
    }
  }

  const out: PMNode[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ type: 'text', text, ...(marks.length ? { marks } : {}) })
    text = ''
  }
  for (const c of Array.from(run.children)) {
    if (c.namespaceURI !== W) continue
    if (c.localName === 't') text += c.textContent ?? ''
    else if (c.localName === 'tab') text += '    '
    else if (c.localName === 'br' || c.localName === 'cr') { flush(); out.push({ type: 'hardBreak' }) }
    else if (c.localName === 'drawing') {
      flush()
      const img = await image(ctx, c)
      if (img) out.push(img)
    }
  }
  flush()
  return out
}

async function inlineNodes(ctx: Context, p: Element): Promise<PMNode[]> {
  const out: PMNode[] = []
  const walk = async (el: Element, extra: Mark[]) => {
    for (const c of Array.from(el.children)) {
      if (c.namespaceURI !== W) continue
      if (c.localName === 'r') out.push(...(await runNodes(ctx, c, extra)))
      else if (c.localName === 'hyperlink') {
        const rid = c.getAttributeNS(R, 'id')
        const href = rid ? ctx.rels.get(rid) : undefined
        await walk(c, href ? [...extra, { type: 'link', attrs: { href } }] : extra)
      } else if (['ins', 'smartTag', 'sdt', 'sdtContent', 'fldSimple'].includes(c.localName)) await walk(c, extra)
    }
  }
  await walk(p, [])
  return out
}

const ALIGN: Record<string, string> = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }

interface ParaInfo { node: PMNode; list?: { type: 'bulletList' | 'orderedList'; level: number; id: string } }

async function paragraph(ctx: Context, p: Element): Promise<ParaInfo> {
  const pPr = kid(p, 'pPr')
  const content = await inlineNodes(ctx, p)
  const align = ALIGN[attr(kid(pPr, 'jc'), 'val') ?? '']
  const level = headingLevel(ctx, attr(kid(pPr, 'pStyle'), 'val'))
  const base: PMNode = level
    ? { type: 'heading', attrs: { level, ...(align && align !== 'left' ? { textAlign: align } : {}) } }
    : { type: 'paragraph', attrs: align && align !== 'left' ? { textAlign: align } : {} }
  if (content.length) base.content = content

  const numPr = kid(pPr, 'numPr')
  const numId = attr(kid(numPr, 'numId'), 'val')
  if (numPr && numId && numId !== '0') {
    return { node: { type: 'paragraph', ...(content.length ? { content } : {}) }, list: { type: ctx.numbering.get(numId) ?? 'bulletList', level: Number(attr(kid(numPr, 'ilvl'), 'val') ?? 0), id: numId } }
  }
  return { node: base }
}

/** Agrupa párrafos de lista consecutivos en listas anidadas según su nivel */
function buildLists(items: ParaInfo[]): PMNode {
  const root: PMNode[] = []
  const stack: { node: PMNode; level: number }[] = []
  for (const { node, list } of items) {
    const level = list!.level
    while (stack.length && stack[stack.length - 1].level > level) stack.pop()
    const top = stack[stack.length - 1]
    if (!top || top.level < level || top.node.type !== list!.type) {
      const container: PMNode = { type: list!.type, content: [] }
      if (stack.length && top && top.level < level) {
        // se cuelga del último elemento de la lista superior
        const lastItem = top.node.content![top.node.content!.length - 1]
        lastItem.content!.push(container)
      } else {
        if (top) stack.pop()
        root.push(container)
      }
      stack.push({ node: container, level })
    }
    stack[stack.length - 1].node.content!.push({ type: 'listItem', content: [node] })
  }
  return root.length === 1 ? root[0] : { type: 'doc_fragment', content: root }
}

async function table(ctx: Context, tbl: Element): Promise<PMNode> {
  const rows = kids(tbl, 'tr')
  const out: PMNode[] = []
  // celdas que continúan hacia abajo (vMerge), por columna
  const open = new Map<number, PMNode>()
  for (const tr of rows) {
    const cells: PMNode[] = []
    let col = 0
    for (const tc of kids(tr, 'tc')) {
      const tcPr = kid(tc, 'tcPr')
      const span = Number(attr(kid(tcPr, 'gridSpan'), 'val') ?? 1)
      const vm = kid(tcPr, 'vMerge')
      if (vm && (attr(vm, 'val') ?? 'continue') !== 'restart') {
        const origin = open.get(col)
        if (origin) origin.attrs!.rowspan = Number(origin.attrs!.rowspan ?? 1) + 1
        col += span
        continue
      }
      const content = await blocks(ctx, tc)
      const cell: PMNode = { type: 'tableCell', attrs: { colspan: span, rowspan: 1 }, content: content.length ? content : [{ type: 'paragraph' }] }
      cells.push(cell)
      if (vm) open.set(col, cell)
      col += span
    }
    out.push({ type: 'tableRow', content: cells })
  }
  return { type: 'table', content: out }
}

async function blocks(ctx: Context, parent: Element): Promise<PMNode[]> {
  const out: PMNode[] = []
  let run: ParaInfo[] = []
  const flushList = () => {
    if (!run.length) return
    const built = buildLists(run)
    if (built.type === 'doc_fragment') out.push(...built.content!)
    else out.push(built)
    run = []
  }
  for (const el of Array.from(parent.children)) {
    if (el.namespaceURI !== W) continue
    if (el.localName === 'p') {
      const info = await paragraph(ctx, el)
      if (info.list) run.push(info)
      else { flushList(); out.push(info.node) }
    } else if (el.localName === 'tbl') { flushList(); out.push(await table(ctx, el)) }
    else if (el.localName === 'sdt') { flushList(); const c = kid(el, 'sdtContent'); if (c) out.push(...(await blocks(ctx, c))) }
  }
  flushList()
  return out
}

export async function importDocx(data: ArrayBuffer | Uint8Array | Blob): Promise<PMNode> {
  const zip = await JSZip.loadAsync(data as ArrayBuffer)
  const documentXml = await readText(zip, 'word/document.xml')
  if (!documentXml) throw new Error('El archivo no parece un documento de Word (.docx).')

  const rels = new Map<string, string>()
  const relXml = await readText(zip, 'word/_rels/document.xml.rels')
  if (relXml) for (const r of Array.from(parse(relXml).getElementsByTagName('Relationship'))) rels.set(r.getAttribute('Id')!, r.getAttribute('Target')!)

  const styles = new Map<string, { name: string; basedOn?: string }>()
  const stylesXml = await readText(zip, 'word/styles.xml')
  if (stylesXml) {
    for (const s of Array.from(parse(stylesXml).getElementsByTagNameNS(W, 'style'))) {
      const id = attr(s, 'styleId')
      if (id) styles.set(id, { name: attr(kid(s, 'name'), 'val') ?? id, basedOn: attr(kid(s, 'basedOn'), 'val') ?? undefined })
    }
  }

  // numId -> tipo de lista (según el formato del nivel 0 de su definición abstracta)
  const numbering = new Map<string, 'bulletList' | 'orderedList'>()
  const numXml = await readText(zip, 'word/numbering.xml')
  if (numXml) {
    const doc = parse(numXml)
    const abstract = new Map<string, 'bulletList' | 'orderedList'>()
    for (const a of Array.from(doc.getElementsByTagNameNS(W, 'abstractNum'))) {
      const lvl = kids(a, 'lvl')[0]
      abstract.set(attr(a, 'abstractNumId')!, attr(kid(lvl, 'numFmt'), 'val') === 'bullet' ? 'bulletList' : 'orderedList')
    }
    for (const n of Array.from(doc.getElementsByTagNameNS(W, 'num'))) {
      const a = attr(kid(n, 'abstractNumId'), 'val')
      if (a && abstract.has(a)) numbering.set(attr(n, 'numId')!, abstract.get(a)!)
    }
  }

  const body = parse(documentXml).getElementsByTagNameNS(W, 'body')[0]
  const content = body ? await blocks({ zip, rels, styles, numbering, images: new Map() }, body) : []
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}
