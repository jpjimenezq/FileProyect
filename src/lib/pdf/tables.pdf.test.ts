import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { extractBlocks } from './tables'

/** Un PDF de verdad con texto suelto y una tabla, leído con pdf.js como en la herramienta */
describe('PDF a Excel con un PDF real', () => {
  it('encuentra la tabla y deja el texto aparte', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([595, 842])
    const text = (s: string, x: number, y: number, size = 11) => page.drawText(s, { x, y, size, font })
    text('Informe mensual de ventas', 50, 780, 16)
    text('Este documento resume las ventas del mes por producto y por zona.', 50, 750)
    const rows = [['Producto', 'Zona', 'Unidades', 'Importe'], ['Lápiz', 'Norte', '1.200', '600,00'], ['Cuaderno', 'Sur', '85', '272,00'], ['Mochila', 'Este', '14', '420,50']]
    rows.forEach((r, i) => {
      const y = 700 - i * 20
      text(r[0], 50, y); text(r[1], 170, y)
      text(r[2], 330 + (i === 0 ? 0 : 40 - font.widthOfTextAtSize(r[2], 11)), y)
      text(r[3], 450 + (i === 0 ? 0 : 60 - font.widthOfTextAtSize(r[3], 11)), y)
    })
    text('Gracias por su atención.', 50, 580)

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await doc.save()), useSystemFonts: true }).promise
    const [blocks] = await extractBlocks(pdf as never)
    const table = blocks.find((b) => b.kind === 'table')!
    expect(table.rows).toEqual(rows)
    expect(blocks.filter((b) => b.kind === 'text').flatMap((b) => b.rows).length).toBeGreaterThanOrEqual(2)
  })
})

describe('PDF a Excel: tablas con bordes', () => {
  it('lee filas, columnas, celdas combinadas y texto de varias líneas por las líneas del PDF', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([595, 842])
    const text = (s: string, x: number, y: number) => page.drawText(s, { x, y, size: 10, font })
    const line = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1 })
    text('Parrafo antes de la tabla.', 50, 780)
    // cuadrícula: columnas en x = 50, 150, 300, 450; filas en y = 740, 710, 670, 640
    const xs = [50, 150, 300, 450]
    const ys = [740, 710, 670, 640]
    ys.forEach((y) => line(50, y, 450, y))
    xs.forEach((x, i) => {
      // en la cabecera (primera fila) falta la línea entre las columnas 2 y 3: celda combinada
      if (i === 2) { line(x, 710, x, 640) } else line(x, 740, x, 640)
    })
    text('Codigo', 55, 722); text('Datos del producto', 155, 722)
    text('A-1', 55, 692); text('Lapiz', 155, 692); text('Escritura', 305, 692)
    text('B-2', 55, 650); text('Cuaderno grande', 155, 656); text('con tapa dura', 155, 644); text('Papeleria', 305, 650)

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await doc.save()), useSystemFonts: true }).promise
    const [blocks] = await extractBlocks(pdf as never)
    const table = blocks.find((b) => b.kind === 'table')!
    expect(table.rows).toEqual([
      ['Codigo', 'Datos del producto', ''],
      ['A-1', 'Lapiz', 'Escritura'],
      ['B-2', 'Cuaderno grande con tapa dura', 'Papeleria'],
    ])
    expect(blocks[0].kind).toBe('text')
  })
})
