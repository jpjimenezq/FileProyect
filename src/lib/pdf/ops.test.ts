import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { extractPages, mergePdfs, parseRanges, rotatePages, addPageNumbers, addWatermark, watermarkPositions } from './ops'

async function makePdf(pages: number) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 300])
  return new File([(await doc.save()) as BlobPart], 'test.pdf', { type: 'application/pdf' })
}

const count = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount()

describe('parseRanges', () => {
  it('interpreta rangos, páginas sueltas y extremos abiertos', () => {
    expect(parseRanges('1-3, 5, 8-', 9)).toEqual([[1, 2, 3], [5], [8, 9]])
    expect(parseRanges('-2', 5)).toEqual([[1, 2]])
  })
  it('rechaza rangos inválidos', () => {
    expect(() => parseRanges('abc', 5)).toThrow()
    expect(() => parseRanges('3-1', 5)).toThrow()
    expect(() => parseRanges('1-9', 5)).toThrow()
    expect(() => parseRanges('', 5)).toThrow()
  })
})

describe('operaciones PDF', () => {
  it('une PDFs', async () => {
    expect(await count(await mergePdfs([await makePdf(2), await makePdf(3)]))).toBe(5)
  })
  it('extrae y reordena páginas', async () => {
    expect(await count(await extractPages(await makePdf(5), [5, 1, 3]))).toBe(3)
  })
  it('rota páginas', async () => {
    const doc = await PDFDocument.load(await rotatePages(await makePdf(2), [1, 0]))
    expect(doc.getPage(0).getRotation().angle).toBe(90)
    expect(doc.getPage(1).getRotation().angle).toBe(0)
  })
  it('numera páginas', async () => {
    const out = await addPageNumbers(await makePdf(3), { position: 'bc', format: 'page-n-of-N', first: 1, from: 1, size: 10, margin: 20 })
    expect(await count(out)).toBe(3)
  })
})

describe('marca de agua', () => {
  it('una sola marca va en el centro', () => {
    expect(watermarkPositions(200, 300, 80, 20, 45, 'single')).toEqual([{ x: 100, y: 150 }])
  })

  it('el mosaico cubre toda la hoja y desplaza las filas alternas', () => {
    const marks = watermarkPositions(600, 800, 120, 30, 0, 'tile', 'normal')
    expect(marks.length).toBeGreaterThan(20)
    const ys = [...new Set(marks.map((m) => m.y))].sort((a, b) => b - a)
    const xs = (y: number) => marks.filter((m) => m.y === y).map((m) => m.x)
    // las filas pares e impares no empiezan en la misma x
    expect(xs(ys[0])[0]).not.toBe(xs(ys[1])[0])
    // hay marcas cerca de las cuatro esquinas
    expect(Math.min(...marks.map((m) => m.x))).toBeLessThan(120)
    expect(Math.max(...marks.map((m) => m.x))).toBeGreaterThan(480)
    expect(Math.max(...marks.map((m) => m.y))).toBeGreaterThan(700)
    expect(Math.min(...marks.map((m) => m.y))).toBeLessThan(100)
  })

  it('el mosaico está centrado: una marca en el centro de la hoja y dibujo simétrico', () => {
    for (const [deg, density] of [[0, 'normal'], [45, 'wide'], [-45, 'tight'], [90, 'normal']] as const) {
      const marks = watermarkPositions(595, 842, 150, 30, deg, 'tile', density)
      expect(marks.some((m) => Math.abs(m.x - 297.5) < 0.01 && Math.abs(m.y - 421) < 0.01)).toBe(true)
      for (const m of marks) {
        // para cada marca existe su simétrica respecto al centro de la hoja
        expect(marks.some((o) => Math.abs(o.x - (595 - m.x)) < 0.01 && Math.abs(o.y - (842 - m.y)) < 0.01)).toBe(true)
      }
    }
  })

  it('más densidad significa más marcas, y nunca se pasa del tope', () => {
    const n = (d: 'wide' | 'normal' | 'tight') => watermarkPositions(600, 800, 120, 30, 30, 'tile', d).length
    expect(n('tight')).toBeGreaterThan(n('normal'))
    expect(n('normal')).toBeGreaterThan(n('wide'))
    expect(watermarkPositions(600, 800, 2, 2, 0, 'tile', 'tight').length).toBeLessThanOrEqual(300)
  })

  it('el PDF resultante con mosaico pesa más que con una sola marca', async () => {
    const file = await makePdf(1)
    const base = { text: 'BORRADOR', size: 10, color: '#ff0000', opacity: 0.3, rotation: 45, imageScale: 0.5 }
    const one = await addWatermark(file, { ...base, layout: 'single' })
    const many = await addWatermark(file, { ...base, layout: 'tile', density: 'normal' })
    expect((await PDFDocument.load(many)).getPageCount()).toBe(1)
    expect(many.length).toBeGreaterThan(one.length)
  })
})
