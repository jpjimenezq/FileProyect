import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { boxToMargins, cropSelectedPages, marginsToBox } from './crop'

describe('márgenes del recorte', () => {
  const size = { w: 200, h: 100 }
  it('sin recuadro los márgenes son 0', () => {
    expect(boxToMargins(undefined, size)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
  it('ida y vuelta', () => {
    const m = { top: 10, right: 20, bottom: 5, left: 40 }
    expect(boxToMargins(marginsToBox(m, size), size)).toEqual(m)
  })
  it('nunca se sale de la página ni queda sin tamaño', () => {
    const b = marginsToBox({ top: 0, right: 500, bottom: 0, left: 500 }, size)
    expect(b.w).toBeGreaterThan(0)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.w).toBeLessThanOrEqual(1.0000001)
  })
})

describe('cropSelectedPages', () => {
  it('recorta solo las páginas pedidas', async () => {
    const d = await PDFDocument.create()
    d.addPage([200, 100]); d.addPage([200, 100])
    const file = new File([new Uint8Array(await d.save())], 'a.pdf')
    const out = await PDFDocument.load(await cropSelectedPages(file, { x: 0.5, y: 0, w: 0.5, h: 1 }, [2]))
    expect(out.getPage(0).getSize().width).toBe(200)
    expect(out.getPage(1).getSize().width).toBe(100)
  })
})
