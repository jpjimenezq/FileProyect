// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Evaluator, key } from './model'
import type { Workbook } from './model'
import { exportXlsx, importXlsx } from './xlsx'

const sample: Workbook = {
  sheets: [
    {
      name: 'Ventas',
      colW: { 0: 140 },
      cells: {
        [key(0, 0)]: { v: 'Producto', s: { b: true, bg: '#ffff00' } },
        [key(0, 1)]: { v: 'Precio', s: { b: true, align: 'right' } },
        [key(1, 0)]: { v: 'Lápiz' },
        [key(1, 1)]: { v: '2.5', s: { fmt: 'eur', color: '#ff0000' } },
        [key(2, 0)]: { v: 'Total' },
        [key(2, 1)]: { v: '=SUM(B2:B2)*2', s: { i: true, fmt: 'dec2' } },
      },
    },
    { name: 'Notas', colW: {}, cells: { [key(0, 0)]: { v: '=Ventas!B3' } } },
  ],
}

const read = async () => importXlsx(new Uint8Array(await (await exportXlsx(sample)).arrayBuffer()))

describe('Excel (.xlsx)', () => {
  it('conserva hojas, valores y fórmulas', async () => {
    const back = await read()
    expect(back.sheets.map((s) => s.name)).toEqual(['Ventas', 'Notas'])
    expect(back.sheets[0].cells[key(1, 0)].v).toBe('Lápiz')
    expect(back.sheets[0].cells[key(1, 1)].v).toBe('2.5')
    expect(back.sheets[0].cells[key(2, 1)].v).toBe('=SUM(B2:B2)*2')
    expect(new Evaluator(back).value('Notas', 0, 0)).toBe(5)
  })
  it('conserva estilos, formatos y anchos', async () => {
    const back = await read()
    const head = back.sheets[0].cells[key(0, 0)].s!
    expect(head.b).toBe(true)
    expect(head.bg).toBe('#ffff00')
    expect(back.sheets[0].cells[key(0, 1)].s!.align).toBe('right')
    expect(back.sheets[0].cells[key(1, 1)].s).toMatchObject({ fmt: 'eur', color: '#ff0000' })
    expect(back.sheets[0].cells[key(2, 1)].s).toMatchObject({ i: true, fmt: 'dec2' })
    expect(back.sheets[0].colW[0]).toBeGreaterThan(100)
  })
  it('rechaza archivos que no son Excel', async () => {
    await expect(importXlsx(new TextEncoder().encode('no es un zip'))).rejects.toThrow()
  })
})
