import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { applyAnnotations, cropPages, fillForm, listFields, visualToPdf } from './annotate'
import type { Item } from './annotate'
import { piecesToMarkdown } from './markdown'

async function makePdf(rotation = 0) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([200, 400])
  page.setRotation(degrees(rotation))
  return new File([(await doc.save()) as BlobPart], 't.pdf', { type: 'application/pdf' })
}

describe('visualToPdf', () => {
  it('mapea la esquina superior izquierda según la rotación', async () => {
    const check = async (rot: number) => {
      const page = (await PDFDocument.load(await (await makePdf(rot)).arrayBuffer())).getPage(0)
      return visualToPdf(page, 0, 0)
    }
    expect(await check(0)).toEqual({ x: 0, y: 400 })
    expect(await check(90)).toEqual({ x: 0, y: 0 })
    expect(await check(180)).toEqual({ x: 200, y: 0 })
    expect(await check(270)).toEqual({ x: 200, y: 400 })
  })
})

describe('applyAnnotations', () => {
  it('dibuja texto, rectángulos y trazos sin romper el PDF', async () => {
    const items: Item[] = [
      { id: '1', page: 1, kind: 'text', x: 0.1, y: 0.1, text: 'Hola\nmundo', size: 14, color: '#ff0000' },
      { id: '2', page: 1, kind: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.1, color: '#000000' },
      { id: '3', page: 1, kind: 'highlight', x: 0.2, y: 0.4, w: 0.3, h: 0.1, color: '#ffeb3b' },
      { id: '4', page: 1, kind: 'pen', points: [[0.1, 0.1], [0.5, 0.5], [0.9, 0.2]], color: '#0000ff', width: 2 },
    ]
    for (const rot of [0, 90, 270]) {
      const out = await applyAnnotations(await makePdf(rot), items)
      expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
    }
  })
})

describe('cropPages', () => {
  it('reduce el tamaño de la página', async () => {
    const out = await PDFDocument.load(await cropPages(await makePdf(), { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }))
    expect(out.getPage(0).getSize()).toEqual({ width: 100, height: 200 })
  })
})

describe('formularios', () => {
  it('lista y rellena campos', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage()
    const form = doc.getForm()
    form.createTextField('nombre').addToPage(page, { x: 10, y: 10, width: 100, height: 20 })
    form.createCheckBox('acepto').addToPage(page, { x: 10, y: 50, width: 15, height: 15 })
    const file = new File([(await doc.save()) as BlobPart], 'f.pdf')

    const fields = await listFields(file)
    expect(fields.map((f) => [f.name, f.type])).toEqual([['nombre', 'text'], ['acepto', 'checkbox']])

    const filled = new File([(await fillForm(file, { nombre: 'Ana', acepto: true }, false)) as BlobPart], 'g.pdf')
    const after = await listFields(filled)
    expect(after.find((f) => f.name === 'nombre')?.value).toBe('Ana')
    expect(after.find((f) => f.name === 'acepto')?.value).toBe(true)
  })
})

describe('piecesToMarkdown', () => {
  it('detecta títulos, listas y párrafos', () => {
    const p = (str: string, y: number, size: number, x = 0) => ({ str, x, y, size })
    const md = piecesToMarkdown([[
      p('Título', 700, 24),
      p('Una frase', 650, 12), p('que continúa.', 636, 12),
      p('• Elemento uno', 600, 12),
      p('Otro párrafo', 500, 12),
    ]])
    expect(md).toContain('# Título')
    expect(md).toContain('Una frase que continúa.')
    expect(md).toContain('- Elemento uno')
    expect(md).toContain('Otro párrafo')
  })
})
