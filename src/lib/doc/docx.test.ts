// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { exportDocx, toHalfPoints, cssColor } from './docxExport'
import type { PMNode } from './docxExport'
import { importDocx } from './docxImport'

const p = (text: string, marks: PMNode['marks'] = [], attrs: PMNode['attrs'] = {}): PMNode => ({ type: 'paragraph', attrs, content: [{ type: 'text', text, marks }] })

const sample: PMNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Informe anual' }] },
    p('Texto centrado en negrita', [{ type: 'bold' }], { textAlign: 'center' }),
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Mezcla de ' },
        { type: 'text', text: 'rojo', marks: [{ type: 'textStyle', attrs: { color: '#ff0000', fontSize: '24px', fontFamily: 'Georgia' } }] },
        { type: 'text', text: ' y ' },
        { type: 'text', text: 'resaltado', marks: [{ type: 'highlight', attrs: { color: '#ffff00' } }, { type: 'italic' }, { type: 'underline' }] },
        { type: 'text', text: ' con enlace', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
      ],
    },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [p('Uno'), { type: 'bulletList', content: [{ type: 'listItem', content: [p('Uno punto uno')] }] }] },
      { type: 'listItem', content: [p('Dos')] },
    ] },
    { type: 'orderedList', content: [{ type: 'listItem', content: [p('Primero')] }, { type: 'listItem', content: [p('Segundo')] }] },
    { type: 'table', content: [
      { type: 'tableRow', content: [
        { type: 'tableHeader', attrs: { colspan: 2, rowspan: 1 }, content: [p('Cabecera')] },
      ] },
      { type: 'tableRow', content: [
        { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [p('A1')] },
        { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [p('B1', [{ type: 'bold' }])] },
      ] },
    ] },
  ],
}

const toData = async (doc: PMNode) => new Uint8Array(await (await exportDocx(doc, { title: 'Prueba' })).arrayBuffer())

describe('conversión de unidades', () => {
  it('tamaños de letra a medios puntos', () => {
    expect(toHalfPoints('16px')).toBe(24)
    expect(toHalfPoints('12pt')).toBe(24)
    expect(toHalfPoints('abc')).toBeUndefined()
  })
  it('colores CSS a RRGGBB', () => {
    expect(cssColor('#f00')).toBe('FF0000')
    expect(cssColor('rgb(0, 128, 255)')).toBe('0080FF')
    expect(cssColor('#16a34a')).toBe('16A34A')
    expect(cssColor('rojo')).toBeUndefined()
  })
})

describe('Word (.docx): exportar e importar', () => {
  it('genera un archivo .docx válido (un zip con document.xml)', async () => {
    const data = await toData(sample)
    expect(data[0]).toBe(0x50) // "PK"
    expect(data[1]).toBe(0x4b)
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(data)
    expect(zip.file('word/document.xml')).toBeTruthy()
    expect(await zip.file('word/document.xml')!.async('string')).toContain('Informe anual')
  })

  it('ida y vuelta: títulos, alineación y marcas se conservan', async () => {
    const back = await importDocx(await toData(sample))
    const [heading, centered, mixed] = back.content!
    expect(heading.type).toBe('heading')
    expect(heading.attrs?.level).toBe(1)
    expect(heading.content![0].text).toBe('Informe anual')

    expect(centered.attrs?.textAlign).toBe('center')
    expect(centered.content![0].marks?.some((m) => m.type === 'bold')).toBe(true)

    const red = mixed.content!.find((n) => n.text === 'rojo')!
    const style = red.marks!.find((m) => m.type === 'textStyle')!.attrs!
    expect(style.color).toBe('#ff0000')
    expect(style.fontFamily).toBe('Georgia')
    expect(style.fontSize).toBe('24px')

    const marked = mixed.content!.find((n) => n.text === 'resaltado')!
    expect(marked.marks!.map((m) => m.type).sort()).toEqual(['highlight', 'italic', 'underline'])
    expect(marked.marks!.find((m) => m.type === 'highlight')!.attrs!.color).toBe('#ffff00')

    const link = mixed.content!.find((n) => n.text === ' con enlace')!
    expect(link.marks!.some((m) => m.type === 'link' && String(m.attrs!.href).startsWith('https://example.com'))).toBe(true)
  })

  it('ida y vuelta: listas con niveles', async () => {
    const back = await importDocx(await toData(sample))
    const bullets = back.content!.find((n) => n.type === 'bulletList')!
    expect(bullets.content).toHaveLength(2)
    expect(bullets.content![0].content!.some((n) => n.type === 'bulletList')).toBe(true)
    expect(bullets.content![0].content![1].content![0].content![0].content![0].text).toBe('Uno punto uno')
    const ordered = back.content!.find((n) => n.type === 'orderedList')!
    expect(ordered.content!.map((i) => i.content![0].content![0].text)).toEqual(['Primero', 'Segundo'])
  })

  it('ida y vuelta: tablas con celdas combinadas', async () => {
    const back = await importDocx(await toData(sample))
    const table = back.content!.find((n) => n.type === 'table')!
    expect(table.content).toHaveLength(2)
    expect(table.content![0].content![0].attrs?.colspan).toBe(2)
    expect(table.content![1].content!.map((c) => c.content![0].content![0].text)).toEqual(['A1', 'B1'])
  })

  it('un documento vacío da un párrafo vacío', async () => {
    const back = await importDocx(await toData({ type: 'doc', content: [] }))
    expect(back.content!.length).toBeGreaterThanOrEqual(1)
  })

  it('las fórmulas LaTeX se guardan como texto centrado', async () => {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await toData({ type: 'doc', content: [{ type: 'latexBlock', attrs: { latex: 'x^{2}+y' } }] }))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('x^{2}+')
    expect(xml).toContain('w:jc w:val="center"')
  })

  it('rechaza archivos que no son .docx', async () => {
    await expect(importDocx(new TextEncoder().encode('esto no es un zip'))).rejects.toThrow()
  })
})
