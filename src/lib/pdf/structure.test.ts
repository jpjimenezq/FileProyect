import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { addAttachments, chapterRanges, listAttachments, readBookmarks, removeAttachments, writeBookmarks } from './structure'
import { adjustPixels, inkBounds, toSinglePage, unionBox } from './misc'

async function makePdf(pages: number, size: [number, number] = [300, 400]) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage(size)
  return new File([(await doc.save()) as BlobPart], 't.pdf', { type: 'application/pdf' })
}
const asFile = (bytes: Uint8Array) => new File([bytes as BlobPart], 'r.pdf', { type: 'application/pdf' })

describe('adjuntos', () => {
  it('añade, lista y quita archivos', async () => {
    const note = new File(['hola mundo'], 'nota.txt', { type: 'text/plain' })
    const data = new File([new Uint8Array([1, 2, 3, 4])], 'datos.bin')
    const withFiles = asFile(await addAttachments(await makePdf(1), [note, data]))

    const list = await listAttachments(withFiles)
    expect(list.map((a) => a.name).sort()).toEqual(['datos.bin', 'nota.txt'])
    const txt = list.find((a) => a.name === 'nota.txt')!
    expect(new TextDecoder().decode(txt.bytes)).toBe('hola mundo')
    expect(txt.size).toBe(10)

    expect(await listAttachments(asFile(await removeAttachments(withFiles)))).toEqual([])
  })

  it('un PDF sin adjuntos devuelve una lista vacía', async () => {
    expect(await listAttachments(await makePdf(2))).toEqual([])
  })
})

describe('marcadores', () => {
  const marks = [
    { title: 'Introducción', page: 1, level: 0 },
    { title: 'Contexto', page: 2, level: 1 },
    { title: 'Objetivos', page: 3, level: 1 },
    { title: 'Detalle', page: 3, level: 2 },
    { title: 'Resultados ñandú', page: 5, level: 0 },
  ]

  it('escribe y vuelve a leer el índice con sus niveles', async () => {
    const out = asFile(await writeBookmarks(await makePdf(6), marks))
    expect(await readBookmarks(out)).toEqual(marks)
  })

  it('corrige niveles imposibles y páginas fuera de rango', async () => {
    const out = asFile(await writeBookmarks(await makePdf(3), [
      { title: 'A', page: 99, level: 4 },
      { title: 'B', page: 0, level: 3 },
    ]))
    const read = await readBookmarks(out)
    expect(read.map((b) => b.level)).toEqual([0, 1]) // el primero sube a 0 y el segundo cuelga de él
    expect(read.map((b) => b.page)).toEqual([3, 1])
  })

  it('sin marcadores se quita el índice', async () => {
    const withIndex = asFile(await writeBookmarks(await makePdf(2), marks.slice(0, 1)))
    expect(await readBookmarks(withIndex)).toHaveLength(1)
    expect(await readBookmarks(asFile(await writeBookmarks(withIndex, [])))).toEqual([])
  })

  it('capítulos: rangos por marcadores de nivel superior', () => {
    expect(chapterRanges(marks, 8)).toEqual([
      { title: 'Introducción', from: 1, to: 4 },
      { title: 'Resultados ñandú', from: 5, to: 8 },
    ])
    // lo que hay antes del primer capítulo va como "Inicio"
    expect(chapterRanges([{ title: 'Cap 1', page: 3, level: 0 }], 5)).toEqual([
      { title: 'Inicio', from: 1, to: 2 },
      { title: 'Cap 1', from: 3, to: 5 },
    ])
    expect(chapterRanges([], 5)).toEqual([])
  })
})

describe('una sola página', () => {
  it('apila las páginas con el ancho de la más ancha', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 100])
    doc.addPage([400, 100])
    doc.addPage()
    const out = await PDFDocument.load(await toSinglePage(asFile(await doc.save())))
    expect(out.getPageCount()).toBe(1)
    const { width, height } = out.getPage(0).getSize()
    expect(width).toBe(595.28) // la tercera (A4 por defecto) es la más ancha
    expect(height).toBeCloseTo(100 * (595.28 / 200) + 100 * (595.28 / 400) + 841.89, 1)
  })

  it('avisa si no cabe en una página', async () => {
    await expect(toSinglePage(await makePdf(40))).rejects.toThrow(/demasiado largo/)
  })
})

describe('ajuste de imagen', () => {
  const px = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255])
  it('sin cambios deja los píxeles igual', () => {
    const p = px(10, 120, 250)
    adjustPixels(p, { brightness: 1, contrast: 1, gray: false })
    expect([...p]).toEqual([10, 120, 250, 255])
  })
  it('más contraste aleja los valores del gris medio', () => {
    const p = new Uint8ClampedArray([100, 100, 100, 255, 160, 160, 160, 255])
    adjustPixels(p, { brightness: 1, contrast: 2, gray: false })
    expect(p[0]).toBeLessThan(100)
    expect(p[4]).toBeGreaterThan(160)
  })
  it('el brillo aclara y la escala de grises iguala los canales', () => {
    const p = px(200, 50, 50)
    adjustPixels(p, { brightness: 1, contrast: 1, gray: true })
    expect(p[0]).toBe(p[1])
    expect(p[1]).toBe(p[2])
  })
})

describe('recorte automático', () => {
  it('encuentra el rectángulo con tinta', () => {
    const w = 10, h = 10
    const img = new Uint8ClampedArray(w * h * 4).fill(255)
    for (let y = 2; y <= 5; y++) for (let x = 3; x <= 7; x++) img.set([0, 0, 0, 255], (y * w + x) * 4)
    expect(inkBounds(img, w, h)).toEqual({ x: 0.3, y: 0.2, w: 0.5, h: 0.4 })
  })
  it('una hoja vacía no tiene contenido', () => {
    expect(inkBounds(new Uint8ClampedArray(4 * 4 * 4).fill(255), 4, 4)).toBeNull()
  })
  it('une recuadros con un margen sin salirse de la hoja', () => {
    const u = unionBox([{ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }, { x: 0.6, y: 0.5, w: 0.39, h: 0.3 }], 0.05)!
    expect(u.x).toBeCloseTo(0.15)
    expect(u.x + u.w).toBeCloseTo(1)
    expect(u.y).toBeCloseTo(0.15)
    expect(u.y + u.h).toBeCloseTo(0.85)
  })
})
