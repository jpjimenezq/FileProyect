import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { chunkText, mapLimit } from './ai'
import { textToPdf } from './pdf/textpdf'

describe('chunkText', () => {
  it('agrupa párrafos sin pasarse del máximo', () => {
    const text = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)].join('\n\n')
    const chunks = chunkText(text, 100)
    expect(chunks).toHaveLength(2)
    expect(chunks.every((c) => c.length <= 100)).toBe(true)
    expect(chunks.join('\n\n')).toBe(text)
  })
  it('parte un párrafo gigante por frases', () => {
    const para = Array.from({ length: 30 }, (_, i) => `Frase número ${i}.`).join(' ')
    const chunks = chunkText(para, 120)
    expect(chunks.length).toBeGreaterThan(3)
    expect(chunks.every((c) => c.length <= 120)).toBe(true)
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(para)
  })
})

describe('mapLimit', () => {
  it('conserva el orden y respeta el límite de concurrencia', async () => {
    let active = 0
    let peak = 0
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return n * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50, 60])
    expect(peak).toBe(2)
  })
})

describe('textToPdf', () => {
  it('crea una página por sección y desborda a más si el texto es largo', async () => {
    const long = Array.from({ length: 120 }, (_, i) => `Línea ${i} con acentos áéíóú y ñ.`).join('\n')
    const bytes = await textToPdf(['# Título\n\n- uno\n- dos\n\nTexto normal.', '', long])
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4)
  })
  it('no falla con caracteres fuera de WinAnsi', async () => {
    const doc = await PDFDocument.load(await textToPdf(['Hola 漢字 Привет €']))
    expect(doc.getPageCount()).toBe(1)
  })
})
