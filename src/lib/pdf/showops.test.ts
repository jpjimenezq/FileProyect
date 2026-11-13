import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import { analyzeShows } from './showops'
import { bytesToLatin1, findShowOps, latin1ToBytes, removeShowOps } from './contentstream'

async function pdfWithContent(content: string) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  const key = page.node.newFontDictionary(font.name, font.ref)
  const stream = doc.context.flateStream(content.replace('/F1', key.toString()))
  page.node.set(PDFName.of('Contents'), doc.context.register(stream))
  return { bytes: new Uint8Array(await doc.save()), font }
}

const open = async (bytes: Uint8Array) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return (await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise).getPage(1)
}

const CONTENT = 'BT /F1 12 Tf 14 TL 50 700 Td (Hello ) Tj (World) Tj [(Ab) -100 (cd)] TJ T* (next) \' 2 Tc (zz) Tj ET'

describe('analizar las instrucciones de texto', () => {
  it('posición y avance de cada una', async () => {
    const { bytes, font } = await pdfWithContent(CONTENT)
    const { total, shows } = await analyzeShows((await open(bytes)) as never)
    expect(total).toBe(5)
    expect(shows.map((s) => s.removable)).toEqual([true, true, true, true, true])
    // «Hello » arranca en (50, 700) y «World» justo donde termina
    const hello = font.widthOfTextAtSize('Hello ', 12)
    expect(shows[0].x).toBeCloseTo(50, 1)
    expect(shows[0].y).toBeCloseTo(842 - 700, 1)
    expect(shows[0].endX).toBeCloseTo(50 + hello, 1)
    expect(shows[1].x).toBeCloseTo(50 + hello, 1)
    // el TJ con ajuste de -100 (hacia la derecha): «Ab» + «cd» + 100/1000 de cuerpo
    expect(shows[2].endX - shows[2].x).toBeCloseTo(font.widthOfTextAtSize('Ab', 12) + font.widthOfTextAtSize('cd', 12) + 1.2, 1)
    // «T*» y luego «'» bajan dos líneas (TL 14) y vuelven al margen
    expect(shows[3].x).toBeCloseTo(50, 1)
    expect(shows[3].y).toBeCloseTo(842 - 700 + 28, 1)
  })

  it('quitar una instrucción no mueve lo que va detrás en la misma línea', async () => {
    const { bytes } = await pdfWithContent(CONTENT)
    const before = await analyzeShows((await open(bytes)) as never)

    // reescribir el contenido quitando «Hello »
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    void pdfjs
    const doc = await PDFDocument.load(bytes)
    const page = doc.getPage(0)
    const ref = page.node.get(PDFName.of('Contents'))
    const { decodePDFRawStream } = await import('pdf-lib')
    const raw = doc.context.lookup(ref as never) as never
    const text = bytesToLatin1(decodePDFRawStream(raw).decode())
    const ops = findShowOps(text)
    expect(ops).toHaveLength(5)
    const out = removeShowOps(text, ops, new Map([[0, before.shows[0].advance]]))
    doc.context.assign(ref as never, doc.context.flateStream(latin1ToBytes(out)))
    const after = await analyzeShows((await open(new Uint8Array(await doc.save()))) as never)

    expect(after.total).toBe(5) // el desplazamiento cuenta como una instrucción de texto más
    expect(after.shows[1].x).toBeCloseTo(before.shows[1].x, 1)
    expect(after.shows[2].x).toBeCloseTo(before.shows[2].x, 1)
    expect(after.shows[4].x).toBeCloseTo(before.shows[4].x, 1)
  })
})
