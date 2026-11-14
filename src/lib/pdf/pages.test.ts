import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { insertionPlan, insertPages, interleaveOrder, interleavePdfs, neighborPage } from './pages'

/** PDF cuyas páginas miden 100+n de ancho (n = número de página), para reconocerlas luego */
async function makePdf(pages: number, base = 100) {
  const doc = await PDFDocument.create()
  for (let i = 1; i <= pages; i++) doc.addPage([base + i, 300])
  return new File([(await doc.save()) as BlobPart], 'test.pdf', { type: 'application/pdf' })
}
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth())

describe('interleaveOrder', () => {
  it('mezcla A1 B1 A2 B2…', () => {
    expect(interleaveOrder(3, 3).map((x) => x.label)).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3'])
  })
  it('con el segundo invertido toma sus páginas de la última a la primera', () => {
    expect(interleaveOrder(3, 3, true).map((x) => x.label)).toEqual(['A1', 'B3', 'A2', 'B2', 'A3', 'B1'])
  })
  it('si son desiguales, las sobrantes van al final', () => {
    expect(interleaveOrder(2, 4).map((x) => x.label)).toEqual(['A1', 'B1', 'A2', 'B2', 'B3', 'B4'])
    expect(interleaveOrder(4, 2).map((x) => x.label)).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'A4'])
    expect(interleaveOrder(3, 1, true).map((x) => x.label)).toEqual(['A1', 'B1', 'A2', 'A3'])
  })
})

describe('interleavePdfs', () => {
  it('genera el PDF con el orden esperado (con y sin invertir)', async () => {
    const a = await makePdf(2, 100) // anchos 101, 102
    const b = await makePdf(2, 200) // anchos 201, 202
    expect(await widths(await interleavePdfs(a, b))).toEqual([101, 201, 102, 202])
    expect(await widths(await interleavePdfs(a, b, true))).toEqual([101, 202, 102, 201])
  })
  it('conserva todas las páginas cuando son desiguales', async () => {
    expect(await widths(await interleavePdfs(await makePdf(1, 100), await makePdf(3, 200)))).toEqual([101, 201, 202, 203])
  })
})

describe('insertionPlan', () => {
  const ids = (p: ReturnType<typeof insertionPlan>) => p.map((x) => (x.type === 'orig' ? x.page : x.id))
  it('inserta al principio (posición 1), en medio y al final', () => {
    expect(ids(insertionPlan(3, [{ id: 'x', at: 0 }]))).toEqual(['x', 1, 2, 3])
    expect(ids(insertionPlan(3, [{ id: 'x', at: 1 }]))).toEqual([1, 'x', 2, 3])
    expect(ids(insertionPlan(3, [{ id: 'x', at: 3 }]))).toEqual([1, 2, 3, 'x'])
  })
  it('mantiene el orden de varias inserciones en el mismo punto y ajusta posiciones fuera de rango', () => {
    expect(ids(insertionPlan(2, [{ id: 'a', at: 1 }, { id: 'b', at: 1 }, { id: 'c', at: 9 }]))).toEqual([1, 'a', 'b', 2, 'c'])
  })
})

describe('neighborPage', () => {
  it('usa la página anterior, o la primera si va al principio', () => {
    expect(neighborPage(5, 0)).toBe(1)
    expect(neighborPage(5, 3)).toBe(3)
    expect(neighborPage(5, 5)).toBe(5)
  })
})

describe('insertPages', () => {
  it('inserta una página en blanco con el tamaño de la página vecina', async () => {
    const main = await makePdf(3) // 101, 102, 103
    expect(await widths(await insertPages(main, [{ id: 'x', at: 2, blank: true }]))).toEqual([101, 102, 102, 103])
    expect(await widths(await insertPages(main, [{ id: 'x', at: 0, blank: true }]))).toEqual([101, 101, 102, 103])
    expect(await widths(await insertPages(main, [{ id: 'x', at: 3, blank: true }]))).toEqual([101, 102, 103, 103])
  })
  it('hereda el giro de la vecina', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([100, 200]).setRotation(degrees(90))
    const out = await PDFDocument.load(await insertPages({ arrayBuffer: async () => (await doc.save()).buffer as ArrayBuffer }, [{ id: 'x', at: 1, blank: true }]))
    expect(out.getPage(1).getRotation().angle).toBe(90)
  })
  it('inserta todas las páginas de otro PDF en medio y combina con blancas', async () => {
    const main = await makePdf(2) // 101, 102
    const other = await makePdf(2, 500) // 501, 502
    const bytes = await insertPages(main, [{ id: 'o', at: 1, file: other }, { id: 'b', at: 2, blank: true }])
    expect(await widths(bytes)).toEqual([101, 501, 502, 102, 102])
  })
})
