import { describe, expect, it } from 'vitest'
import { alignedX, fillVariables, formatDate, pageHasText, pagesWithText, toPageSpace, toWinAnsi } from './headerfooter'

const v = { page: 2, total: 3, date: new Date(2026, 0, 5), file: 'informe' }

describe('fillVariables', () => {
  it('sustituye las cuatro variables', () => {
    expect(fillVariables('Página {pagina} de {total} · {fecha} · {archivo}', v)).toBe('Página 2 de 3 · 05/01/2026 · informe')
  })
  it('admite tilde y mayúsculas y repeticiones', () => {
    expect(fillVariables('{página} {PAGINA} {Total}', v)).toBe('2 2 3')
  })
  it('deja intacto lo que no es variable', () => {
    expect(fillVariables('{otra} {pagina', v)).toBe('{otra} {pagina')
  })
})

describe('formatDate', () => {
  it('usa dd/mm/aaaa con ceros', () => {
    expect(formatDate(new Date(2026, 10, 14))).toBe('14/11/2026')
    expect(formatDate(new Date(2026, 2, 9))).toBe('09/03/2026')
  })
})

describe('rango de páginas', () => {
  it('respeta «desde» y «omitir la primera»', () => {
    expect(pagesWithText(5, { from: 1, skipFirst: false })).toEqual([1, 2, 3, 4, 5])
    expect(pagesWithText(5, { from: 1, skipFirst: true })).toEqual([2, 3, 4, 5])
    expect(pagesWithText(5, { from: 3, skipFirst: true })).toEqual([3, 4, 5])
    expect(pagesWithText(3, { from: 9, skipFirst: false })).toEqual([])
  })
  it('trata «desde» menor que 1 como 1', () => {
    expect(pageHasText(1, { from: 0, skipFirst: false })).toBe(true)
  })
})

describe('alignedX', () => {
  it('coloca según la alineación', () => {
    expect(alignedX('l', 600, 100, 30)).toBe(30)
    expect(alignedX('c', 600, 100, 30)).toBe(250)
    expect(alignedX('r', 600, 100, 30)).toBe(470)
  })
})

describe('toWinAnsi', () => {
  it('conserva tildes y ñ y quita lo no latino', () => {
    expect(toWinAnsi('Año ñandú á€')).toBe('Año ñandú á€')
    expect(toWinAnsi('Hola 😀 世界')).toBe('Hola  ')
    expect(toWinAnsi('a\nb')).toBe('a b')
  })
})

describe('toPageSpace', () => {
  const box = { x: 10, y: 20, width: 200, height: 300 }
  it('sin giro suma el origen de la caja', () => {
    expect(toPageSpace(box, 0, 5, 7)).toEqual({ x: 15, y: 27, angle: 0 })
  })
  it('con giro de 90 la esquina inferior izquierda visible es la superior izquierda del PDF', () => {
    expect(toPageSpace(box, 90, 0, 0)).toEqual({ x: 210, y: 20, angle: 90 })
  })
  it('con giro de 180 y 270', () => {
    expect(toPageSpace(box, 180, 0, 0)).toEqual({ x: 210, y: 320, angle: 180 })
    expect(toPageSpace(box, 270, 0, 0)).toEqual({ x: 10, y: 320, angle: 270 })
  })
})
