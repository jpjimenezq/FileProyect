// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { runsFromDom } from './textedit'
import type { EditRun } from './textedit'

const base: EditRun = { family: 'sans', bold: false, italic: false, size: 12, color: '#000000', text: '' }
const runs: EditRun[] = [{ ...base, text: 'Total: ' }, { ...base, bold: true, text: '1.250 €' }]

const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d }

describe('runsFromDom', () => {
  it('cada trozo conserva el estilo del tramo en que se escribió', () => {
    const out = runsFromDom(el('<span data-run="0">Total: </span><span data-run="1">2.500 €</span>'), runs)
    expect(out.map((r) => [r.text, r.bold])).toEqual([['Total: ', false], ['2.500 €', true]])
  })
  it('texto suelto (el navegador a veces lo saca del tramo) toma el estilo del anterior', () => {
    const out = runsFromDom(el('<span data-run="1">Hola</span> mundo'), runs)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ text: 'Hola mundo', bold: true })
  })
  it('un tramo vaciado desaparece y los espacios duros pasan a normales', () => {
    const out = runsFromDom(el('<span data-run="0"></span><span data-run="1">a&nbsp;b</span>'), runs)
    expect(out.map((r) => r.text)).toEqual(['a b'])
  })
  it('sin nada escrito no queda ningún tramo', () => {
    expect(runsFromDom(el('<span data-run="0"></span><br>'), runs)).toEqual([])
  })
})
