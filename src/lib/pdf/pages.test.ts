import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { insertionPlan, insertPages, interleaveOrder, interleavePdfs, neighborPage, splitBoxes, splitPageCount, splitPagesInHalf, splitPlan } from './pages'

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

describe('dividir páginas por la mitad', () => {
  const A3 = { x: 0, y: 0, width: 1191, height: 842 }

  it('splitBoxes: A3 apaisada en vertical da dos A4 (izquierda, derecha)', () => {
    const [l, r] = splitBoxes(A3, 0, 'auto')
    expect(l).toEqual({ x: 0, y: 0, width: 595.5, height: 842 })
    expect(r).toEqual({ x: 595.5, y: 0, width: 595.5, height: 842 })
  })
  it('auto en una página vertical corta en horizontal (arriba, abajo)', () => {
    const [t, b] = splitBoxes({ x: 0, y: 0, width: 600, height: 800 }, 0, 'auto')
    expect(t).toEqual({ x: 0, y: 400, width: 600, height: 400 })
    expect(b).toEqual({ x: 0, y: 0, width: 600, height: 400 })
  })
  it('orden de derecha a izquierda empieza por la mitad derecha', () => {
    const [first, second] = splitBoxes(A3, 0, 'vertical', true)
    expect(first.x).toBe(595.5)
    expect(second.x).toBe(0)
  })
  it('respeta una caja que no empieza en 0,0', () => {
    const [l, r] = splitBoxes({ x: 20, y: 30, width: 200, height: 100 }, 0, 'vertical')
    expect(l).toEqual({ x: 20, y: 30, width: 100, height: 100 })
    expect(r).toEqual({ x: 120, y: 30, width: 100, height: 100 })
  })
  it('con Rotate 90 la página apaisada visible se corta en el eje contrario del PDF', () => {
    // sin girar es vertical (600x800); girada 90 se ve apaisada (800x600) → «auto» corta en vertical visible
    const [left, right] = splitBoxes({ x: 0, y: 0, width: 600, height: 800 }, 90, 'auto')
    // la mitad izquierda visible es la parte baja de la página sin girar
    expect(left).toEqual({ x: 0, y: 0, width: 600, height: 400 })
    expect(right).toEqual({ x: 0, y: 400, width: 600, height: 400 })
  })
  it('con Rotate 270 se invierte respecto a 90', () => {
    const [left] = splitBoxes({ x: 0, y: 0, width: 600, height: 800 }, 270, 'vertical')
    expect(left).toEqual({ x: 0, y: 400, width: 600, height: 400 })
  })
  it('splitPlan excluye primera y última', () => {
    expect(splitPlan(4, true).map((p) => p.split)).toEqual([false, true, true, false])
    expect(splitPlan(2, true).map((p) => p.split)).toEqual([false, false])
    expect(splitPageCount(4, true)).toBe(6)
    expect(splitPageCount(4, false)).toBe(8)
  })

  async function a3(rotation = 0) {
    const doc = await PDFDocument.create()
    for (let i = 0; i < 2; i++) {
      const p = doc.addPage([1191, 842])
      if (rotation) p.setRotation(degrees(rotation))
    }
    return new File([(await doc.save()) as BlobPart], 'a3.pdf')
  }

  it('2 páginas A3 apaisadas dan 4 páginas A4', async () => {
    const out = await PDFDocument.load(await splitPagesInHalf(await a3(), { mode: 'auto' }))
    expect(out.getPageCount()).toBe(4)
    for (const p of out.getPages()) {
      expect(p.getMediaBox().width).toBeCloseTo(595.5)
      expect(p.getMediaBox().height).toBe(842)
      expect(p.getCropBox().x).toBe(p.getMediaBox().x)
    }
    expect(out.getPages().map((p) => p.getMediaBox().x)).toEqual([0, 595.5, 0, 595.5])
  })
  it('derecha a izquierda y sin dividir primera/última', async () => {
    const rtl = await PDFDocument.load(await splitPagesInHalf(await a3(), { mode: 'vertical', rtl: true }))
    expect(rtl.getPages().map((p) => p.getMediaBox().x)).toEqual([595.5, 0, 595.5, 0])
    const skip = await PDFDocument.load(await splitPagesInHalf(await a3(), { mode: 'vertical', skipEnds: true }))
    expect(skip.getPageCount()).toBe(2)
    expect(skip.getPage(0).getMediaBox().width).toBe(1191)
  })
  it('una página con Rotate 90 conserva el giro en las dos mitades', async () => {
    const out = await PDFDocument.load(await splitPagesInHalf(await a3(90), { mode: 'vertical' }))
    expect(out.getPageCount()).toBe(4)
    expect(out.getPage(0).getRotation().angle).toBe(90)
    // visible: 842 x 1191 (vertical) → mitades izquierda/derecha = abajo/arriba de la caja 1191x842
    expect(out.getPage(0).getMediaBox()).toMatchObject({ x: 0, y: 0, width: 1191, height: 421 })
    expect(out.getPage(1).getMediaBox()).toMatchObject({ x: 0, y: 421, width: 1191, height: 421 })
  })
})
