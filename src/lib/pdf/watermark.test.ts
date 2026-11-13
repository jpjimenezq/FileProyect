import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFName, PDFRef, StandardFonts, decodePDFRawStream, PDFRawStream } from 'pdf-lib'
import { analyzeWatermarks, removeWatermarks } from './watermark'
import { addWatermark } from './ops'
import { bytesToLatin1 } from './contentstream'
import { extractLines } from './textedit'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function document(pages: number, extra?: (page: import('pdf-lib').PDFPage, i: number, font: import('pdf-lib').PDFFont) => void) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842])
    p.drawText(`Capítulo ${i + 1}`, { x: 72, y: 760, size: 18, font })
    p.drawText(`Este es el texto propio de la página número ${i + 1} del documento.`, { x: 72, y: 700, size: 12, font })
    extra?.(p, i, font)
  }
  return new Uint8Array(await doc.save())
}

const pdfjsOpen = async (bytes: Uint8Array) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise
}
const analyze = async (bytes: Uint8Array) => analyzeWatermarks((await pdfjsOpen(bytes)) as never, new File([bytes as unknown as BlobPart], 'a.pdf'))
const texts = async (bytes: Uint8Array, page: number) => {
  const pdf = await pdfjsOpen(bytes)
  const real = (t: string, s: { size: number }) => t.length * s.size * 0.5
  return (await extractLines((await pdf.getPage(page)) as never, page, real as never)).map((l) => l.text)
}

describe('quitar marcas de agua', () => {
  it('una marca de texto en diagonal en cada página (la de esta aplicación)', async () => {
    const plain = await document(3)
    const marked = new Uint8Array(await addWatermark(new File([plain as unknown as BlobPart], 'a.pdf'), { text: 'CONFIDENCIAL', size: 60, color: '#ff0000', opacity: 0.3, rotation: 45, imageScale: 0.4, layout: 'single' }))

    const analysis = await analyze(marked)
    const [c] = analysis.candidates
    expect(c).toMatchObject({ kind: 'text', label: 'CONFIDENCIAL', confidence: 'alta' })
    expect(c.pages).toEqual([1, 2, 3])

    const { bytes, failed } = await removeWatermarks(new File([marked as unknown as BlobPart], 'a.pdf'), analysis, new Set([c.id]))
    expect(failed).toEqual([])
    for (const p of [1, 2, 3]) {
      const t = await texts(bytes, p)
      expect(t.join(' ')).not.toContain('CONFIDENCIAL')
      expect(t).toContain(`Capítulo ${p}`)
      expect(t.some((l) => l.includes(`número ${p} del documento`))).toBe(true)
    }
    expect((await analyze(bytes)).candidates).toHaveLength(0)
  })

  it('una marca repetida en mosaico por toda la hoja', async () => {
    const plain = await document(2)
    const marked = new Uint8Array(await addWatermark(new File([plain as unknown as BlobPart], 'a.pdf'), { text: 'BORRADOR', size: 40, color: '#888888', opacity: 0.25, rotation: 30, imageScale: 0.4, layout: 'tile', density: 'normal' }))
    const analysis = await analyze(marked)
    const tile = analysis.candidates.find((c) => c.id.startsWith('tile:'))!
    expect(tile.label).toBe('BORRADOR')
    expect(tile.detail).toContain('repetido varias veces')
    const { bytes, failed } = await removeWatermarks(new File([marked as unknown as BlobPart], 'a.pdf'), analysis, new Set([tile.id]))
    expect(failed).toEqual([])
    expect((await texts(bytes, 1)).join(' ')).not.toContain('BORRADOR')
    expect((await texts(bytes, 2)).some((l) => l.includes('número 2'))).toBe(true)
  })

  it('una imagen repetida en cada página', async () => {
    const plain = await document(3)
    const marked = new Uint8Array(await addWatermark(new File([plain as unknown as BlobPart], 'a.pdf'), {
      image: new File([Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0)) as unknown as BlobPart], 'm.png', { type: 'image/png' }), size: 40, color: '#000000', opacity: 0.3, rotation: 0, imageScale: 0.5, layout: 'single',
    }))
    const analysis = await analyze(marked)
    const img = analysis.candidates.find((c) => c.kind === 'image')!
    expect(img.pages).toEqual([1, 2, 3])
    expect(img.confidence).toBe('alta') // semitransparente
    const { bytes, failed } = await removeWatermarks(new File([marked as unknown as BlobPart], 'a.pdf'), analysis, new Set([img.id]))
    expect(failed).toEqual([])
    expect((await analyze(bytes)).candidates.filter((c) => c.kind === 'image')).toHaveLength(0)
    expect((await texts(bytes, 3)).some((l) => l.includes('número 3'))).toBe(true)
  })

  it('un encabezado repetido se propone con confianza baja y no se quita si no se elige', async () => {
    const bytes = await document(4, (p, _i, font) => p.drawText('Informe anual Holcrest', { x: 72, y: 800, size: 10, font }))
    const analysis = await analyze(bytes)
    const header = analysis.candidates.find((c) => c.label === 'Informe anual Holcrest')!
    expect(header.confidence).toBe('baja')
    expect(analysis.candidates.filter((c) => c.confidence === 'alta')).toHaveLength(0)
    const { bytes: out } = await removeWatermarks(new File([bytes as unknown as BlobPart], 'a.pdf'), analysis, new Set())
    expect((await texts(out, 1)).join(' ')).toContain('Informe anual')
  })

  it('el texto normal de cada página no se confunde con una marca', async () => {
    const analysis = await analyze(await document(5))
    expect(analysis.candidates.map((c) => c.label)).toEqual([])
  })

  it('un bloque etiquetado como marca de agua se quita entero', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    for (let i = 0; i < 2; i++) {
      const page = doc.addPage([595, 842])
      const key = page.node.newFontDictionary(font.name, font.ref)
      const stream = doc.context.flateStream(
        `BT ${key} 12 Tf 72 700 Td (Texto real ${i + 1}) Tj ET\n/Artifact <</Type /Pagination /Subtype /Watermark>> BDC q BT ${key} 80 Tf 100 400 Td (SOLO LECTURA) Tj ET Q EMC\n`,
      )
      page.node.set(PDFName.of('Contents'), doc.context.register(stream))
    }
    const bytes = new Uint8Array(await doc.save())
    const analysis = await analyze(bytes)
    expect(analysis.candidates[0]).toMatchObject({ kind: 'tag', pages: [1, 2], confidence: 'alta' })
    const { bytes: out, failed } = await removeWatermarks(new File([bytes as unknown as BlobPart], 'a.pdf'), analysis, new Set(['tag']))
    expect(failed).toEqual([])
    const all = (await texts(out, 1)).join(' ')
    expect(all).toContain('Texto real 1')
    expect(all).not.toContain('SOLO LECTURA')
    // el contenido ya no tiene la etiqueta
    const d = await PDFDocument.load(out)
    const ref = d.getPage(0).node.get(PDFName.of('Contents'))
    const arr = ref instanceof PDFRef ? d.context.lookup(ref) : ref
    const refs = arr instanceof PDFArray ? arr.asArray() : [ref]
    const content = refs.map((r) => bytesToLatin1(decodePDFRawStream(d.context.lookup(r as PDFRef) as PDFRawStream).decode())).join('')
    expect(content).not.toContain('Watermark')
  })
})
