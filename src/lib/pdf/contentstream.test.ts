import { describe, expect, it } from 'vitest'
import { findShowOps, removeShowOps, scanContent } from './contentstream'

const kinds = (s: string) => findShowOps(s).map((o) => o.kind)

describe('findShowOps', () => {
  it('encuentra Tj, TJ, \' y "', () => {
    const s = "BT /F1 12 Tf 50 700 Td (Hola) Tj [(Mu) -20 (ndo)] TJ T* (otra) ' 1 2 (tres) \" ET"
    expect(kinds(s)).toEqual(['Tj', 'TJ', "'", '"'])
    const ops = findShowOps(s)
    expect(s.slice(ops[0].start, ops[0].end)).toBe('(Hola) Tj')
    expect(s.slice(ops[1].start, ops[1].end)).toBe('[(Mu) -20 (ndo)] TJ')
    expect(s.slice(ops[3].start, ops[3].end)).toBe('1 2 (tres) "')
    expect(ops[3]).toMatchObject({ aw: '1', ac: '2' })
    expect(ops.map((o) => o.ord)).toEqual([0, 1, 2, 3])
  })

  it('no confunde textos con paréntesis, escapes, hexadecimales ni comentarios', () => {
    const s = '(a \\) Tj (b)) Tj <48656C6C6F> Tj % (no) Tj\n[<41> (x)] TJ'
    expect(kinds(s)).toEqual(['Tj', 'Tj', 'TJ'])
    const ops = findShowOps(s)
    expect(s.slice(ops[0].start, ops[0].end)).toBe('(a \\) Tj (b)) Tj')
  })

  it('se salta las imágenes en línea (datos binarios que parecen operadores)', () => {
    const s = 'q BI /W 2 /H 2 /BPC 8 /CS /G ID (x) Tj \u0001\u0002 EI Q BT (real) Tj ET'
    const ops = findShowOps(s)
    expect(ops).toHaveLength(1)
    expect(s.slice(ops[0].start, ops[0].end)).toBe('(real) Tj')
  })

  it('un nombre o un número que se parece a un operador no cuenta', () => {
    expect(kinds('/Tj 5 Tf /TJ gs BT (a) Tj ET')).toEqual(['Tj'])
  })
})

describe('removeShowOps', () => {
  it('cambia el texto por un desplazamiento y respeta lo demás', () => {
    const s = 'BT 50 700 Td (Hola ) Tj (mundo) Tj ET'
    const ops = findShowOps(s)
    const out = removeShowOps(s, ops, new Map([[0, -30.5]]))
    expect(out).toBe('BT 50 700 Td [-30.5] TJ (mundo) Tj ET')
  })
  it('las variantes con efectos laterales los conservan', () => {
    const s = "BT 3 Tw (a) ' 1 2 (b) \" ET"
    const out = removeShowOps(s, findShowOps(s), new Map([[0, 10], [1, 0]]))
    expect(out).toBe('BT 3 Tw T* [10] TJ 1 Tw 2 Tc T* [0] TJ ET')
  })
  it('lo que no está en el mapa queda intacto', () => {
    const s = '(a) Tj (b) Tj'
    expect(removeShowOps(s, findShowOps(s), new Map([[1, 5]]))).toBe('(a) Tj [5] TJ')
  })
})

describe('bloques de marca de agua', () => {
  it('encuentra el bloque etiquetado y su cierre, aunque haya otros marcados dentro', () => {
    const s = 'BT (a) Tj ET /Artifact <</Type /Pagination /Subtype /Watermark>> BDC q /Span BMC BT (MARCA) Tj ET EMC Q EMC BT (b) Tj ET'
    const { marks, shows } = scanContent(s)
    expect(marks).toHaveLength(1)
    expect(s.slice(marks[0].start, marks[0].end)).toBe('/Artifact <</Type /Pagination /Subtype /Watermark>> BDC q /Span BMC BT (MARCA) Tj ET EMC Q EMC')
    expect(shows).toHaveLength(3)
  })
  it('un artefacto que no es marca de agua (pie, número de página) no cuenta', () => {
    expect(scanContent('/Artifact <</Type /Pagination /Subtype /Footer>> BDC BT (1) Tj ET EMC').marks).toHaveLength(0)
    expect(scanContent('/P BMC BT (x) Tj ET EMC').marks).toHaveLength(0)
  })
})
