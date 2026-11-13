import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { analyzeShows } from './showops'
import { analyzeGraphics } from './graphics'
import { editContent, pagesWithMarks } from './stripText'
import type { Plan } from './stripText'

/**
 * Quitar marcas de agua que están en el propio contenido del PDF: bloques etiquetados como marca de agua, textos
 * repetidos en varias páginas (sobre todo en diagonal o semitransparentes), e imágenes o formularios repetidos.
 * No puede separar una marca que esté fundida dentro de una imagen (un escaneo, una foto).
 */

export type Confidence = 'alta' | 'media' | 'baja'

export interface WmPart { shows: number[]; draws: number[]; marks: boolean }

export interface WmCandidate {
  id: string
  kind: 'tag' | 'text' | 'image' | 'form'
  /** El texto de la marca, o una descripción */
  label: string
  detail: string
  confidence: Confidence
  pages: number[]
  /** Qué quitar en cada página */
  parts: Map<number, WmPart>
}

export interface PageFacts { showsTotal: number; drawsTotal: number; advance: Map<number, number> }
export interface WmAnalysis { numPages: number; candidates: WmCandidate[]; facts: Map<number, PageFacts> }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const isDiagonal = (deg: number) => { const a = Math.abs(((deg % 90) + 90) % 90); return a > 8 && a < 82 }
const clip = (s: string, n = 44) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const order: Record<Confidence, number> = { alta: 0, media: 1, baja: 2 }

interface Group { pages: Set<number>; parts: Map<number, WmPart>; sample: { text: string; angle: number; alpha: number; size: number }; perPage: Map<number, number> }

function add(map: Map<string, Group>, key: string, page: number, part: Partial<WmPart>, sample: Group['sample']) {
  let g = map.get(key)
  if (!g) { g = { pages: new Set(), parts: new Map(), sample, perPage: new Map() }; map.set(key, g) }
  g.pages.add(page)
  const p = g.parts.get(page) ?? { shows: [], draws: [], marks: false }
  p.shows.push(...(part.shows ?? []))
  p.draws.push(...(part.draws ?? []))
  g.parts.set(page, p)
  g.perPage.set(page, (g.perPage.get(page) ?? 0) + 1)
}

export async function analyzeWatermarks(pdf: PDFDocumentProxy, file: File, onProgress?: (f: number) => void): Promise<WmAnalysis> {
  const N = pdf.numPages
  const need = N >= 2 ? Math.max(2, Math.ceil(N * 0.5)) : 1
  const facts = new Map<number, PageFacts>()
  const positioned = new Map<string, Group>()
  const tiled = new Map<string, Group>()
  const images = new Map<string, Group>()

  for (let n = 1; n <= N; n++) {
    const page = await pdf.getPage(n)
    const [sh, gr] = await Promise.all([analyzeShows(page), analyzeGraphics(page)])
    facts.set(n, { showsTotal: sh.total, drawsTotal: gr.drawsTotal, advance: new Map(sh.shows.map((s) => [s.ord, s.advance])) })
    for (const s of sh.shows) {
      const text = norm(s.text)
      if (!s.removable || s.blank || text.length < 2 || /^[\d\s.,/:-]+$/.test(text)) continue
      const sample = { text, angle: s.angle, alpha: s.alpha, size: s.size }
      add(positioned, `${text}|${Math.round(s.x / 4)}|${Math.round(s.y / 4)}|${Math.round(s.size)}|${Math.round(s.angle / 5)}`, n, { shows: [s.ord] }, sample)
      add(tiled, `${text}|${Math.round(s.size)}|${Math.round(s.angle / 5)}`, n, { shows: [s.ord] }, sample)
    }
    for (const d of gr.draws) {
      if (d.w * d.h < 0.0004) continue
      add(images, `${d.kind}|${d.key}|${Math.round(d.x * 40)}|${Math.round(d.y * 40)}|${Math.round(d.w * 40)}|${Math.round(d.h * 40)}`, n, { draws: [d.ord] },
        { text: d.kind === 'image' ? 'Imagen' : 'Formulario', angle: 0, alpha: d.alpha, size: Math.sqrt(d.w * d.h) * 600 })
    }
    onProgress?.(n / N)
  }

  const out: WmCandidate[] = []
  const describe = (pages: number[], s: Group['sample'], extra: string[] = []) =>
    [`${pages.length === N ? 'todas las páginas' : `${pages.length} de ${N} páginas`}`, isDiagonal(s.angle) ? 'en diagonal' : '', s.alpha < 0.9 ? 'semitransparente' : '', ...extra].filter(Boolean).join(' · ')

  // marcas etiquetadas como tales en el propio PDF
  const tagged = await pagesWithMarks(file)
  if (tagged.length) {
    out.push({
      id: 'tag', kind: 'tag', label: 'Marca de agua del documento', detail: `${tagged.length === N ? 'todas las páginas' : `${tagged.length} de ${N} páginas`} · está etiquetada como marca de agua`,
      confidence: 'alta', pages: tagged, parts: new Map(tagged.map((p) => [p, { shows: [], draws: [], marks: true }])),
    })
  }

  // textos repetidos en cada hoja (en mosaico)
  const used = new Set<string>()
  for (const [key, g] of tiled) {
    const s = g.sample
    const repeats = [...g.perPage.values()].filter((c) => c >= 2).length
    if (!(isDiagonal(s.angle) || s.alpha < 0.9) || repeats < need || g.pages.size < need) continue
    out.push({ id: `tile:${key}`, kind: 'text', label: clip(s.text), detail: describe([...g.pages], s, ['repetido varias veces por página']), confidence: 'alta', pages: [...g.pages].sort((a, b) => a - b), parts: g.parts })
    for (const [pk, pg] of positioned) if (pk.startsWith(s.text + '|') && [...pg.pages].every((p) => g.pages.has(p))) used.add(pk)
  }

  // textos en el mismo sitio en varias páginas
  for (const [key, g] of positioned) {
    if (used.has(key)) continue
    const s = g.sample
    const repeated = g.pages.size >= need && N >= 2
    const strange = isDiagonal(s.angle) || s.alpha < 0.9
    const big = s.size >= 28
    if (!repeated && !(N === 1 && (strange || big) && s.text.length >= 3)) continue
    if (!repeated && !strange && !big) continue
    const confidence: Confidence = strange ? (repeated || N === 1 ? 'alta' : 'media') : big ? 'media' : 'baja'
    out.push({ id: `text:${key}`, kind: 'text', label: clip(s.text), detail: describe([...g.pages], s, repeated && !strange && !big ? ['parece un encabezado o un pie'] : []), confidence, pages: [...g.pages].sort((a, b) => a - b), parts: g.parts })
  }

  // imágenes y formularios repetidos (o semitransparentes)
  for (const [key, g] of images) {
    const s = g.sample
    const repeated = g.pages.size >= need && N >= 2
    const faint = s.alpha < 0.9
    if (!repeated && !faint) continue
    const kind = key.startsWith('form') ? 'form' : 'image'
    out.push({
      id: `${kind}:${key}`, kind, label: kind === 'image' ? 'Imagen repetida' : 'Elemento repetido', detail: describe([...g.pages], s, repeated && !faint ? ['puede ser un logotipo'] : []),
      confidence: faint ? 'alta' : s.size > 150 ? 'media' : 'baja', pages: [...g.pages].sort((a, b) => a - b), parts: g.parts,
    })
  }

  out.sort((a, b) => order[a.confidence] - order[b.confidence] || b.pages.length - a.pages.length)
  return { numPages: N, candidates: out, facts }
}

/** Quita las marcas elegidas. Devuelve el PDF y las páginas donde no se pudo quitar algo (el contenido no se leyó como se esperaba). */
export async function removeWatermarks(file: File, analysis: WmAnalysis, selected: Set<string>, only?: number[]): Promise<{ bytes: Uint8Array; failed: number[] }> {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const pages = doc.getPages()
  const plans = new Map<number, { plan: Plan; wantsShows: boolean; wantsDraws: boolean; wantsMarks: boolean }>()

  for (const c of analysis.candidates) {
    if (!selected.has(c.id)) continue
    for (const [n, part] of c.parts) {
      if (only && !only.includes(n)) continue
      const f = analysis.facts.get(n)
      if (!f) continue
      let p = plans.get(n)
      if (!p) { p = { plan: {}, wantsShows: false, wantsDraws: false, wantsMarks: false }; plans.set(n, p) }
      if (part.shows.length) {
        p.plan.shows ??= { advance: new Map(), total: f.showsTotal }
        for (const ord of part.shows) p.plan.shows.advance.set(ord, f.advance.get(ord) ?? 0)
        p.wantsShows = true
      }
      if (part.draws.length) {
        p.plan.draws ??= { ords: new Set(), total: f.drawsTotal }
        for (const ord of part.draws) p.plan.draws.ords.add(ord)
        p.wantsDraws = true
      }
      if (part.marks) { p.plan.marks = true; p.wantsMarks = true }
    }
  }

  const failed: number[] = []
  for (const [n, p] of plans) {
    const done = editContent(doc, pages[n - 1], p.plan)
    if ((p.wantsShows && !done.shows) || (p.wantsDraws && !done.draws) || (p.wantsMarks && !done.marks)) failed.push(n)
  }
  return { bytes: await doc.save(), failed: failed.sort((a, b) => a - b) }
}
