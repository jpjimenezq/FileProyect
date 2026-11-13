import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { analyzeGraphics } from './graphics'
import { applyAnnotations } from './annotate'
import type { Item, RemoveGraphic } from './annotate'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function sample() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const img = await doc.embedPng(Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0)))
  const page = doc.addPage([595, 842])
  page.drawText('Yo', { x: 72, y: 700, size: 11, font })
  page.drawLine({ start: { x: 90, y: 698 }, end: { x: 280, y: 698 }, thickness: 1, color: rgb(0, 0, 0) }) // raya para rellenar
  page.drawText('FIRMA', { x: 72, y: 600, size: 11, font })
  page.drawLine({ start: { x: 72, y: 640 }, end: { x: 220, y: 640 }, thickness: 1, color: rgb(0, 0, 0) }) // raya de la firma
  page.drawRectangle({ x: 300, y: 500, width: 120, height: 60, borderColor: rgb(0, 0, 0), borderWidth: 1 })
  page.drawImage(img, { x: 100, y: 400, width: 50, height: 50 })
  page.drawText('Pie de pagina', { x: 72, y: 100, size: 10, font })
  return new Uint8Array(await doc.save())
}

const open = async (bytes: Uint8Array) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return (await (await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise).getPage(1)) as never
}

const asItem = (g: Awaited<ReturnType<typeof analyzeGraphics>>, i: number): RemoveGraphic => {
  const it = g.items[i]
  return { id: it.id, page: 1, kind: 'remove', what: it.kind, x: it.x, y: it.y, w: it.w, h: it.h, bg: '#ffffff', gfx: { via: it.via, ord: it.ord, paintsTotal: g.paintsTotal, drawsTotal: g.drawsTotal } }
}

describe('dibujos de la página', () => {
  it('encuentra rayas, formas e imágenes', async () => {
    const g = await analyzeGraphics(await open(await sample()))
    expect(g.items.map((i) => i.kind)).toEqual(['line', 'line', 'shape', 'image'])
    const [fill, sign, box, image] = g.items
    expect(fill.x * 595).toBeCloseTo(90, 0)
    expect(fill.w * 595).toBeCloseTo(190, 0)
    expect(fill.y * 842).toBeCloseTo(842 - 698, 0)
    expect(sign.w * 595).toBeCloseTo(148, 0)
    expect(box.filled).toBe(false)
    expect(box.w * 595).toBeCloseTo(120, 0)
    expect(image).toMatchObject({ via: 'draw', filled: true })
    expect(image.w * 595).toBeCloseTo(50, 0)
    expect(g.drawsTotal).toBe(1)
  })

  it('quita de verdad una raya: desaparece del contenido y lo demás queda igual', async () => {
    const original = await sample()
    const before = await analyzeGraphics(await open(original))
    const out = await applyAnnotations(new File([original], 'a.pdf'), [asItem(before, 0)] as Item[])
    const after = await analyzeGraphics(await open(out))
    // las instrucciones de trazado siguen contándose igual (la raya pasó a «n»), pero ya no se pinta
    expect(after.paintsTotal).toBe(before.paintsTotal)
    expect(after.items.map((i) => i.kind)).toEqual(['line', 'shape', 'image'])
    expect(after.items[0].w * 595).toBeCloseTo(148, 0) // la raya de la firma sigue
  })

  it('quita una imagen y varias cosas a la vez', async () => {
    const original = await sample()
    const before = await analyzeGraphics(await open(original))
    const out = await applyAnnotations(new File([original], 'a.pdf'), [asItem(before, 3), asItem(before, 1), asItem(before, 2)] as Item[])
    const after = await analyzeGraphics(await open(out))
    expect(after.items.map((i) => i.kind)).toEqual(['line'])
    expect(after.items[0].w * 595).toBeCloseTo(190, 0)
    expect(after.drawsTotal).toBe(0)
  })

  it('si el contenido no coincide con lo esperado, no toca nada y tapa con el fondo', async () => {
    const original = await sample()
    const before = await analyzeGraphics(await open(original))
    const wrong = { ...asItem(before, 0), gfx: { ...asItem(before, 0).gfx, paintsTotal: before.paintsTotal + 5 } }
    const out = await applyAnnotations(new File([original], 'a.pdf'), [wrong] as Item[])
    const after = await analyzeGraphics(await open(out))
    // la raya sigue en el contenido y se añade un rectángulo de tapa
    expect(after.items.length).toBe(before.items.length + 1)
  })
})
