import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { analyzeBox, classifyFont, extractLines, groupLines } from './textedit'
import type { EditRun, RawItem, RunStyle, TextLine } from './textedit'
import { applyAnnotations, isWinAnsi, unsupportedChars } from './annotate'
import type { EditItem } from './annotate'

const sans = { family: 'sans' as const, bold: false, italic: false }
const style = () => sans
/** Anchura aproximada, suficiente para agrupar */
const measure = (text: string, s: RunStyle) => text.length * s.size * 0.5

const item = (str: string, x: number, baseline: number, w = str.length * 5, size = 10, fontName = 'f1'): RawItem => ({ str, x, baseline, w, size, fontName })

describe('clasificar fuentes', () => {
  it('familia, negrita y cursiva por el nombre', () => {
    expect(classifyFont('ABCDEF+Arial-BoldMT')).toEqual({ family: 'sans', bold: true, italic: false })
    expect(classifyFont('TimesNewRomanPS-ItalicMT')).toEqual({ family: 'serif', bold: false, italic: true })
    expect(classifyFont('CourierNewPSMT')).toEqual({ family: 'mono', bold: false, italic: false })
    expect(classifyFont('Calibri-Bold')).toEqual({ family: 'sans', bold: true, italic: false })
    expect(classifyFont(undefined, 'serif').family).toBe('serif')
  })
})

describe('agrupar en líneas', () => {
  it('une fragmentos de la misma línea y separa líneas y bloques lejanos', () => {
    const lines = groupLines([
      item('Hola', 50, 100), item(' ', 70, 100, 2.5), item('mundo', 72.5, 100),
      item('segunda línea', 50, 115),
      item('columna derecha', 400, 100),
    ], style, measure, 1, 595, 842)
    expect(lines.map((l) => l.text)).toEqual(['Hola mundo', 'columna derecha', 'segunda línea'])
    expect(lines[0].id).toBe('1:50:100')
    expect(lines[0].x).toBeCloseTo(50 / 595)
    expect(lines[0].baseline).toBeCloseTo(100 / 842)
  })

  it('crea un tramo nuevo cuando cambia el estilo y calcula el estrechamiento', () => {
    const bold = (n: string) => (n === 'b' ? { ...sans, bold: true } : sans)
    const [line] = groupLines([item('Total: ', 50, 100, 35), item('1.250 €', 85, 100, 35, 10, 'b')], bold, measure, 1, 595, 842)
    expect(line.runs.map((r) => [r.text, r.bold])).toEqual([['Total: ', false], ['1.250 €', true]])
    // 70 pt de ancho real frente a los 35 pt (7 letras × 5) de media estándar de cada tramo
    expect(line.k).toBeCloseTo(70 / (7 * 5 + 7 * 5))
  })

  it('un hueco ancho entre fragmentos sin espacio se rellena con uno', () => {
    const [line] = groupLines([item('Nombre', 50, 100, 30), item('Edad', 90, 100, 20)], style, measure, 1, 595, 842)
    expect(line.text).toBe('Nombre Edad')
  })
})

describe('color del fondo y del texto', () => {
  it('fondo = color más frecuente alrededor; texto = el píxel más distinto', () => {
    const W = 40
    const H = 20
    const data = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < W * H; i++) { data[i * 4] = 250; data[i * 4 + 1] = 240; data[i * 4 + 2] = 200; data[i * 4 + 3] = 255 }
    const px = (x: number, y: number) => (y * W + x) * 4
    for (let x = 10; x < 20; x++) { const i = px(x, 10); data[i] = 200; data[i + 1] = 0; data[i + 2] = 0 }
    const { bg, color } = analyzeBox(data, W, H, { x: 8, y: 6, w: 16, h: 10 })
    expect(bg).toBe('#faf0c8')
    expect(color).toBe('#c80000')
  })
  it('sin diferencia, el texto es negro', () => {
    const data = new Uint8ClampedArray(30 * 30 * 4).fill(255)
    expect(analyzeBox(data, 30, 30, { x: 8, y: 8, w: 10, h: 10 })).toEqual({ bg: '#ffffff', color: '#000000' })
  })
})

describe('letras que admite el PDF', () => {
  it('WinAnsi', () => {
    expect([...'áéñ¿¡€“”–'].every(isWinAnsi)).toBe(true)
    expect(unsupportedChars('Hola ñ ž ł 漢')).toEqual(['ł', '漢'])
  })
})

describe('editar el texto de un PDF real', () => {
  it('lee las líneas y las reescribe en su sitio', async () => {
    const doc = await PDFDocument.create()
    const helv = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const times = await doc.embedFont(StandardFonts.TimesRoman)
    const page = doc.addPage([595, 842])
    page.drawText('Hola mundo desde FileProyect', { x: 72, y: 700, size: 14, font: helv })
    page.drawText('Titulo importante', { x: 72, y: 650, size: 18, font: bold })
    page.drawText('Un parrafo con tipografia serif', { x: 72, y: 600, size: 12, font: times })
    page.drawText('Izquierda', { x: 72, y: 550, size: 11, font: helv })
    page.drawText('Derecha', { x: 400, y: 550, size: 11, font: helv })
    const original = new Uint8Array(await doc.save())

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const load = async (bytes: Uint8Array) => (await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise)
    const real = (text: string, s: RunStyle) => (s.family === 'serif' ? times : s.bold ? bold : helv).widthOfTextAtSize(text, s.size)

    const pdf = await load(original)
    const lines = await extractLines((await pdf.getPage(1)) as never, 1, real)
    expect(lines.map((l) => l.text)).toEqual(['Hola mundo desde FileProyect', 'Titulo importante', 'Un parrafo con tipografia serif', 'Izquierda', 'Derecha'])
    expect(lines[1].runs[0]).toMatchObject({ family: 'sans', bold: true, size: 18 })
    expect(lines[2].runs[0].family).toBe('serif')
    expect(lines[0].k).toBe(1)
    expect(lines.every((l) => l.cut?.complete)).toBe(true)
    expect(lines[0].baseline * 842).toBeCloseTo(842 - 700, 0)

    // reescribir la primera y la tercera línea
    const edit = (l: TextLine, text: string): EditItem => ({
      id: l.id, page: 1, kind: 'edit', line: l.id, x: l.x, y: l.y, w: l.w, h: l.h, k: l.k, W: l.W, H: l.H, bg: '#ffffff', orig: l.text, cut: l.cut,
      runs: [{ ...l.runs[0], text } as EditRun],
      layout: [{ baseline: l.baseline, ws: 0, runs: [{ ...l.runs[0], text } as EditRun] }],
    })
    const out = await applyAnnotations(new File([original], 'a.pdf'), [edit(lines[0], 'Texto nuevo con ñ, é y €'), edit(lines[2], 'Serif cambiado')])
    const after = await extractLines((await (await load(out)).getPage(1)) as never, 1, real)
    const texts = after.map((l) => l.text)
    // el texto viejo ya no está en el archivo: solo queda lo nuevo y lo que no se tocó
    expect(texts).toEqual(['Texto nuevo con ñ, é y €', 'Titulo importante', 'Serif cambiado', 'Izquierda', 'Derecha'])
    // el texto nuevo queda en la misma línea base y con el mismo tamaño
    const nuevo = after.find((l) => l.text.startsWith('Texto nuevo'))!
    expect(nuevo.baseline * 842).toBeCloseTo(842 - 700, 0)
    expect(nuevo.runs[0].size).toBeCloseTo(14, 0)
    expect(after.find((l) => l.text === 'Serif cambiado')!.runs[0].family).toBe('serif')
  })
})
