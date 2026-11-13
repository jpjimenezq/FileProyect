import { describe, expect, it } from 'vitest'
import { groupParagraphs, layoutBlock, layoutRuns, mergeJustifiedRows } from './paragraphs'
import type { EditRun, RunStyle, TextLine } from './textedit'

const W = 595
const H = 842
const style: RunStyle = { family: 'sans', bold: false, italic: false, size: 11, color: '#000000' }
const measure = (text: string, s: RunStyle) => text.length * s.size * 0.5 // 5,5 pt por letra

function line(text: string, x: number, baseline: number, w = text.length * 5.5, k = 1): TextLine {
  const runs: EditRun[] = [{ ...style, text }]
  return {
    id: `1:${Math.round(x)}:${Math.round(baseline)}`, x: x / W, y: (baseline - 0.85 * 11) / H, w: w / W, h: 11.77 / H, baseline: baseline / H, k, W, H, runs, text,
    cut: { total: 100, ops: [{ ord: Math.round(baseline), advance: 0 }], complete: true },
  }
}

// un párrafo justificado de 442 pt de ancho a 12,6 pt entre líneas y la última más corta
const paragraph = (y0: number, n: number, x = 85) => Array.from({ length: n }, (_, i) => line(`texto de la linea numero ${i} del parrafo`, x, y0 + i * 12.6, i === n - 1 ? 150 : 442, 0.9 + i * 0.01))

describe('groupParagraphs', () => {
  it('une las líneas seguidas de un párrafo justificado', () => {
    const [b, ...rest] = groupParagraphs(paragraph(150, 6))
    expect(rest).toHaveLength(0)
    expect(b.multi).toBe(true)
    expect(b.justify).toBe(true)
    expect(b.baselines).toHaveLength(6)
    expect(b.lineGap).toBeCloseTo(12.6, 1)
    expect(b.x * W).toBeCloseTo(85)
    expect(b.w * W).toBeCloseTo(442)
    expect(b.k).toBeCloseTo(0.9) // el menor: la línea menos estirada
    expect(b.text.split(' ')).toContain('numero')
    expect(b.cut?.ops).toHaveLength(6)
    expect(b.cut?.complete).toBe(true)
  })

  it('separa párrafos (línea corta, hueco mayor) y los elementos de una lista', () => {
    const lines = [
      ...paragraph(150, 4), // termina con una línea corta
      ...paragraph(150 + 4 * 12.6 + 12.6, 3), // hueco de una línea más
      line('i. primer elemento de una lista', 85, 300, 262),
      line('ii. segundo elemento de la lista', 85, 313, 270),
    ]
    const blocks = groupParagraphs(lines)
    expect(blocks.map((b) => b.baselines.length)).toEqual([4, 3, 1, 1])
    expect(blocks[2].multi).toBe(false)
  })

  it('un título suelto no se pega al párrafo de debajo', () => {
    const blocks = groupParagraphs([line('ANEXO I', 283, 81, 45), ...paragraph(144, 5)])
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toBe('ANEXO I')
  })

  it('la primera línea con sangría sigue en el mismo párrafo', () => {
    const lines = [line('con sangria al empezar el parrafo y mucho texto mas', 100, 200, 427), ...paragraph(212.6, 3).map((l, i) => (i === 2 ? l : l))]
    const blocks = groupParagraphs(lines)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].baselines).toHaveLength(4)
  })

  it('tras un guion al final de línea no se añade espacio', () => {
    const [b] = groupParagraphs([line('la palabra impor-', 85, 200, 440), line('tante continúa aquí', 85, 212.6, 300)])
    expect(b.text).toBe('la palabra impor-tante continúa aquí') // el guion se conserva: no se sabe si era de sílabas
  })
})

describe('mergeJustifiedRows', () => {
  it('una línea justificada con huecos grandes e iguales vuelve a ser una sola línea', () => {
    const row = (y: number) => [line('correo', 85, y, 31), line('electronico:', 151, y, 56), line('h2r@holcim.com', 241, y, 149), line('y', 423, y, 6), line('h2r-ingresos-', 463, y, 65)]
    // las gaps son 35, 34, 34, 34: justificada de 85 a 528
    const merged = mergeJustifiedRows([...paragraph(540, 3), ...row(578.6), ...paragraph(591.2, 2)])
    const r = merged.find((l) => l.text.startsWith('correo'))!
    expect(r.text).toBe('correo electronico: h2r@holcim.com y h2r-ingresos-')
    expect(r.x * W).toBeCloseTo(85)
    expect((r.x + r.w) * W).toBeCloseTo(528)
    expect(merged.length).toBe(3 + 1 + 2)
  })

  it('un hueco enorme (campo para rellenar) no se une', () => {
    const merged = mergeJustifiedRows([line('Yo', 85, 144, 13), line('en calidad de aspirante', 288, 144, 239), ...paragraph(157, 4)])
    expect(merged.map((l) => l.text).slice(0, 2)).toEqual(['Yo', 'en calidad de aspirante'])
  })
})

describe('layoutRuns', () => {
  const run = (text: string, bold = false): EditRun => ({ ...style, bold, text })

  it('reparte las palabras al ancho dado sin partirlas', () => {
    const lines = layoutRuns([run('uno dos tres cuatro cinco seis siete')], { width: 100, k: 1, justify: false, measure })
    expect(lines.map((l) => l.runs.map((r) => r.text).join(''))).toEqual(['uno dos tres', 'cuatro cinco seis', 'siete'])
    expect(lines.every((l) => l.ws === 0)).toBe(true)
  })

  it('justifica todas las líneas menos la última, repartiendo lo que sobra entre los espacios', () => {
    const lines = layoutRuns([run('uno dos tres cuatro cinco seis siete')], { width: 100, k: 1, justify: true, measure })
    // «uno dos tres» mide 12 letras × 5,5 = 66 → sobran 34 pt entre 2 espacios
    expect(lines[0].ws).toBeCloseTo(34 / 2, 5)
    expect(lines[lines.length - 1].ws).toBe(0)
  })

  it('respeta el estilo de cada tramo y el estrechamiento', () => {
    const lines = layoutRuns([run('hola '), run('mundo', true)], { width: 1000, k: 0.8, justify: false, measure })
    expect(lines).toHaveLength(1)
    expect(lines[0].runs.map((r) => [r.text, r.bold])).toEqual([['hola ', false], ['mundo', true]])
  })

  it('sin ancho (una sola línea) nunca parte el texto', () => {
    expect(layoutRuns([run('a b c d e f g h i j k l m n o p q r s t u v w x y z')], { width: Infinity, k: 1, justify: true, measure })).toHaveLength(1)
  })

  it('una palabra más larga que la línea se queda sola', () => {
    const lines = layoutRuns([run('a supercalifragilistico b')], { width: 50, k: 1, justify: false, measure })
    expect(lines.map((l) => l.runs[0].text)).toEqual(['a', 'supercalifragilistico', 'b'])
  })
})

describe('layoutBlock', () => {
  it('usa las líneas base originales y sigue por debajo con el interlineado', () => {
    const [b] = groupParagraphs(paragraph(150, 3))
    const runs: EditRun[] = [{ ...style, text: 'palabra '.repeat(80).trim() }]
    const lines = layoutBlock(b, runs, measure)
    expect(lines.length).toBeGreaterThan(3)
    expect(lines.slice(0, 3).map((l) => l.baseline)).toEqual(b.baselines)
    expect(lines[3].baseline * H - lines[2].baseline * H).toBeCloseTo(b.lineGap, 1)
  })
})
