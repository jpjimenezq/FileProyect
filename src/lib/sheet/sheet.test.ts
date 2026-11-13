import { describe, expect, it } from 'vitest'
import { Evaluator, colIndex, colName, emptyBook, formatValue, key, offsetFormula, parseCsv, resize, shiftFormula, sheetFromRows, sheetToRows, toCsv } from './model'
import type { Workbook } from './model'

const book = (cells: Record<string, string>, name = 'Hoja 1'): Workbook => ({
  sheets: [{ name, colW: {}, cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { v }])) }],
})

describe('nombres de columna', () => {
  it('ida y vuelta', () => {
    expect(colName(0)).toBe('A')
    expect(colName(25)).toBe('Z')
    expect(colName(26)).toBe('AA')
    expect(colName(701)).toBe('ZZ')
    for (const n of [0, 5, 26, 100, 701, 702]) expect(colIndex(colName(n))).toBe(n)
  })
})

describe('fórmulas', () => {
  it('suma, referencias y funciones', () => {
    const b = book({ [key(0, 0)]: '2', [key(1, 0)]: '3', [key(2, 0)]: '=SUM(A1:A2)', [key(3, 0)]: '=A3*2', [key(4, 0)]: '=IF(A4>9,"grande","chico")' })
    const ev = new Evaluator(b)
    expect(ev.value('Hoja 1', 2, 0)).toBe(5)
    expect(ev.value('Hoja 1', 3, 0)).toBe(10)
    expect(ev.value('Hoja 1', 4, 0)).toBe('grande')
  })
  it('columnas enteras y entre hojas', () => {
    const b: Workbook = { sheets: [
      { name: 'Datos', colW: {}, cells: { [key(0, 0)]: { v: '10' }, [key(1, 0)]: { v: '20' } } },
      { name: 'Resumen', colW: {}, cells: { [key(0, 0)]: { v: '=SUM(Datos!A:A)' }, [key(1, 0)]: { v: "=Datos!A2+1" } } },
    ] }
    const ev = new Evaluator(b)
    expect(ev.value('Resumen', 0, 0)).toBe(30)
    expect(ev.value('Resumen', 1, 0)).toBe(21)
  })
  it('detecta ciclos y errores sin romperse', () => {
    const b = book({ [key(0, 0)]: '=B1', [key(0, 1)]: '=A1', [key(1, 0)]: '=1/0', [key(2, 0)]: '=A2+1', [key(3, 0)]: '=SUM(' })
    const ev = new Evaluator(b)
    expect(ev.value('Hoja 1', 0, 0)).toMatchObject({ error: expect.any(String) })
    expect(ev.value('Hoja 1', 1, 0)).toMatchObject({ error: '#DIV/0!' })
    expect(ev.value('Hoja 1', 2, 0)).toMatchObject({ error: '#DIV/0!' })
    expect(ev.value('Hoja 1', 3, 0)).toMatchObject({ error: expect.any(String) })
  })
  it('una fórmula que se incluye a sí misma es un ciclo', () => {
    const ev = new Evaluator(book({ [key(0, 0)]: '3', [key(1, 0)]: '=SUM(A1:A2)*2' }))
    expect(ev.value('Hoja 1', 1, 0)).toEqual({ error: '#CICLO!' })
  })
  it('texto, números y vacíos', () => {
    const ev = new Evaluator(book({ [key(0, 0)]: 'hola', [key(0, 1)]: '3.5', [key(0, 2)]: '=A1&"!"', [key(0, 3)]: '=B2+1' }))
    expect(ev.value('Hoja 1', 0, 0)).toBe('hola')
    expect(ev.value('Hoja 1', 0, 1)).toBe(3.5)
    expect(ev.value('Hoja 1', 0, 2)).toBe('hola!')
    expect(ev.value('Hoja 1', 0, 3)).toBe(1)
  })
})

describe('formato', () => {
  it('números según el formato', () => {
    expect(formatValue(0.256, 'pct')).toBe('25,6 %')
    expect(formatValue(1234.5, 'dec2')).toBe('1234,50')
    expect(formatValue(null)).toBe('')
    expect(formatValue({ error: '#REF!' })).toBe('#REF!')
    expect(formatValue(true)).toBe('VERDADERO')
    expect(formatValue(45000, 'date')).toMatch(/2023/)
  })
})

describe('referencias al copiar e insertar', () => {
  it('desplaza las relativas y respeta las absolutas', () => {
    expect(offsetFormula('A1+$B$2+C$3+$D4', 1, 1)).toBe('B2+$B$2+D$3+$D5')
    expect(offsetFormula('"A1"&A1', 2, 0)).toBe('"A1"&A3')
    expect(offsetFormula('SUM(A1:A3)', 0, 1)).toBe('SUM(B1:B3)')
  })
  it('insertar y borrar filas actualiza las fórmulas', () => {
    expect(shiftFormula('A1+A5', 'S', 'S', 'row', 2, 1)).toBe('A1+A6')
    expect(shiftFormula('A1+A5', 'S', 'S', 'row', 0, 2)).toBe('A3+A7')
    expect(shiftFormula('A1+A5+A3', 'S', 'S', 'row', 2, -1)).toBe('A1+A4+#REF!')
    expect(shiftFormula('B1', 'S', 'S', 'col', 0, 1)).toBe('C1')
    expect(shiftFormula('Otra!A1+A1', 'S', 'S', 'row', 0, 1)).toBe('Otra!A1+A2')
  })
  it('resize mueve celdas y fórmulas', () => {
    const b = book({ [key(0, 0)]: '5', [key(1, 0)]: '=A1*2' })
    const ins = resize(b, 0, 'row', 0, 1)
    expect(ins.sheets[0].cells[key(1, 0)].v).toBe('5')
    expect(ins.sheets[0].cells[key(2, 0)].v).toBe('=A2*2')
    expect(new Evaluator(ins).value('Hoja 1', 2, 0)).toBe(10)
    const del = resize(ins, 0, 'row', 1, -1)
    expect(Object.keys(del.sheets[0].cells)).toEqual([key(1, 0)])
    expect(del.sheets[0].cells[key(1, 0)].v).toBe('=#REF!*2')
  })
  it('insertar columnas mueve los anchos', () => {
    const b = book({ [key(0, 1)]: '1' })
    b.sheets[0].colW = { 1: 200 }
    expect(resize(b, 0, 'col', 0, 1).sheets[0].colW).toEqual({ 2: 200 })
  })
})

describe('CSV', () => {
  it('comillas, saltos de línea y separador automático', () => {
    expect(parseCsv('a;b\n"x;y";"di ""hola"""\n')).toEqual([['a', 'b'], ['x;y', 'di "hola"']])
    expect(parseCsv('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv('"uno\ndos",3')).toEqual([['uno\ndos', '3']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('ida y vuelta', () => {
    const rows = [['nombre', 'nota'], ['Ana, M.', '9'], ['dice "hola"', '']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
  it('hoja ⇄ filas calculando fórmulas', () => {
    const b: Workbook = { sheets: [sheetFromRows('T', [['1', '2', '=A1+B1'], ['x']])] }
    expect(sheetToRows(b, 0)).toEqual([['1', '2', '3'], ['x', '', '']])
    expect(emptyBook().sheets).toHaveLength(1)
  })
})
