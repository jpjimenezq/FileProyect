import { describe, expect, it } from 'vitest'
import { blocksToSheets, piecesToBlocks, piecesToGrid, toCell } from './tables'

const p = (str: string, x: number, y: number, w = str.length * 6) => ({ str, x, y, w, size: 10 })

describe('piecesToGrid', () => {
  it('reconstruye filas y columnas', () => {
    const grid = piecesToGrid([
      p('Nombre', 50, 700), p('Edad', 200, 700), p('Ciudad', 300, 700),
      p('Ana', 50, 680), p('31', 200, 680), p('Madrid', 300, 680),
      p('Luis', 50, 660), p('Lima', 300, 660),
    ])
    expect(grid).toEqual([['Nombre', 'Edad', 'Ciudad'], ['Ana', '31', 'Madrid'], ['Luis', '', 'Lima']])
  })
  it('une palabras cercanas en una sola celda', () => {
    expect(piecesToGrid([p('Total', 50, 700), p('general', 82, 700)])).toEqual([['Total general']])
  })
})

describe('piecesToBlocks', () => {
  it('separa el texto corrido de la tabla y no inventa columnas', () => {
    const blocks = piecesToBlocks([
      p('Informe de ventas del año', 50, 760), p('Este texto explica el contenido', 70, 745), p('del documento en detalle', 50, 730),
      p('Producto', 50, 700), p('Unidades', 220, 700), p('Precio', 330, 700),
      p('Lápiz', 50, 685), p('1.200', 230, 685), p('0,50', 340, 685),
      p('Cuaderno', 50, 670), p('85', 250, 670), p('3,20', 340, 670),
    ])
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'table'])
    expect(blocks[0].rows).toHaveLength(1) // las líneas seguidas son un solo párrafo
    expect(blocks[0].rows[0][0]).toContain('Este texto explica')
    expect(blocks[1].rows).toEqual([['Producto', 'Unidades', 'Precio'], ['Lápiz', '1.200', '0,50'], ['Cuaderno', '85', '3,20']])
  })

  it('columnas con números alineados a la derecha (inicios distintos) siguen siendo una columna', () => {
    const right = (s: string, edge: number, y: number) => p(s, edge - s.length * 6, y)
    const rows = piecesToBlocks([
      p('Concepto', 50, 700), p('Importe', 300, 700),
      p('Alquiler', 50, 680), right('1.250,00', 360, 680),
      p('Luz', 50, 660), right('95,40', 360, 660),
      p('Internet', 50, 640), right('39,90', 360, 640),
    ])[0].rows
    expect(rows.map((r) => r.length)).toEqual([2, 2, 2, 2])
    expect(rows[1]).toEqual(['Alquiler', '1.250,00'])
  })

  it('una línea suelta entre filas continúa la celda de arriba', () => {
    const [table] = piecesToBlocks([
      p('Nombre', 50, 700), p('Descripción', 200, 700),
      p('Ana', 50, 680), p('Responsable del', 200, 680),
      p('área de compras', 200, 668),
      p('Luis', 50, 648), p('Ventas', 200, 648),
    ])
    expect(table.rows).toEqual([['Nombre', 'Descripción'], ['Ana', 'Responsable del área de compras'], ['Luis', 'Ventas']])
  })

  it('un título ancho encima no funde las columnas', () => {
    const [title, table] = piecesToBlocks([
      p('Resumen trimestral de resultados por zona', 50, 720),
      p('Zona', 50, 700), p('T1', 200, 700), p('T2', 280, 700),
      p('Norte', 50, 680), p('10', 200, 680), p('12', 280, 680),
      p('Sur', 50, 660), p('8', 200, 660), p('9', 280, 660),
      p('Este', 50, 640), p('7', 200, 640), p('6', 280, 640),
      p('Oeste', 50, 620), p('5', 200, 620), p('4', 280, 620),
      p('Total', 50, 600), p('30', 200, 600), p('31', 280, 600),
      p('Nota', 50, 580), p('x', 200, 580), p('y', 280, 580),
      p('Fin', 50, 560), p('z', 200, 560), p('w', 280, 560),
    ])
    expect(title.kind).toBe('text')
    expect(table.kind).toBe('table')
    expect(table.rows[0]).toEqual(['Zona', 'T1', 'T2'])
    expect(table.rows).toHaveLength(8)
  })
})

describe('blocksToSheets', () => {
  const pages = [
    [{ kind: 'text' as const, rows: [['Título']] }, { kind: 'table' as const, rows: [['a', 'b'], ['1', '2']] }],
    [{ kind: 'text' as const, rows: [['Solo texto']] }],
  ]
  it('por defecto solo las tablas; las páginas sin tablas no crean hoja', () => {
    const sheets = blocksToSheets(pages, { includeText: false, layout: 'pages' })
    expect(sheets).toHaveLength(1)
    expect(sheets[0].rows).toEqual([['a', 'b'], ['1', '2']])
  })
  it('si no hay ninguna tabla, se copia el texto', () => {
    const sheets = blocksToSheets([[{ kind: 'text' as const, rows: [['Solo texto']] }]], { includeText: false, layout: 'pages' })
    expect(sheets[0].rows).toEqual([['Solo texto']])
  })
  it('con texto, y todo en una hoja', () => {
    expect(blocksToSheets(pages, { includeText: true, layout: 'pages' })[0].rows).toEqual([['Título'], [], ['a', 'b'], ['1', '2']])
    const one = blocksToSheets(pages, { includeText: false, layout: 'one' })
    expect(one).toHaveLength(1)
    expect(one[0].rows).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('toCell', () => {
  it('convierte números en formato español e inglés', () => {
    expect(toCell('1.234,56')).toBe(1234.56)
    expect(toCell('1,234.56')).toBe(1234.56)
    expect(toCell('12,5')).toBe(12.5)
    expect(toCell('1.234')).toBe(1234)
    expect(toCell('42')).toBe(42)
    expect(toCell('abc')).toBe('abc')
  })
  it('porcentajes', () => {
    expect(toCell('25%')).toBe(0.25)
    expect(toCell('12,5 %')).toBe(0.125)
  })
})

describe('listas con viñetas', () => {
  it('no son una tabla de dos columnas', () => {
    const blocks = piecesToBlocks([
      p('•', 50, 700, 4), p('Definición de negocio y base', 70, 700),
      p('•', 50, 680, 4), p('Adquisición y limpieza', 70, 680),
      p('1.', 50, 660, 8), p('Entrenamiento de modelos', 70, 660),
    ])
    expect(blocks.every((b) => b.kind === 'text')).toBe(true)
    expect(blocks[0].rows[0][0]).toContain('• Definición de negocio y base')
  })
})
