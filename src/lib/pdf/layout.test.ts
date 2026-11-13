import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { PAPER, addStamp, gridFor, multiPageLayout, pageSelected, scalePages, splitBySize, stampCenter } from './layout'
import { darkPixels, invertPixels, scanPixels, seeded } from './effects'

async function makePdf(pages: number, textLines = 0) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([300, 400])
    for (let l = 0; l < textLines; l++) p.drawText(`Página ${i + 1} línea ${l} con ${Math.random().toString(36).slice(2)}`, { x: 20, y: 380 - l * 8, size: 6, font })
  }
  return new File([(await doc.save()) as BlobPart], 't.pdf', { type: 'application/pdf' })
}

const sizes = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getSize())

describe('varias páginas por hoja', () => {
  it('cuadrícula según orientación', () => {
    expect(gridFor(2, true)).toEqual({ cols: 2, rows: 1 })
    expect(gridFor(2, false)).toEqual({ cols: 1, rows: 2 })
    expect(gridFor(6, true)).toEqual({ cols: 3, rows: 2 })
    expect(gridFor(6, false)).toEqual({ cols: 2, rows: 3 })
    expect(gridFor(9, false)).toEqual({ cols: 3, rows: 3 })
  })

  it('agrupa las páginas en hojas del tamaño elegido', async () => {
    const out = await multiPageLayout(await makePdf(9), { perSheet: 4, landscape: true, border: true, paper: 'a4' })
    const s = await sizes(out)
    expect(s).toHaveLength(3) // 4 + 4 + 1
    expect(s[0].width).toBeCloseTo(PAPER.a4.h)
    expect(s[0].height).toBeCloseTo(PAPER.a4.w)
  })
})

describe('escalar páginas', () => {
  it('a un papel concreto, respetando la orientación de cada página', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([300, 400])
    doc.addPage([400, 300])
    const out = await scalePages(new File([(await doc.save()) as BlobPart], 'a.pdf'), { mode: 'paper', paper: 'letter' })
    const s = await sizes(out)
    expect([s[0].width, s[0].height]).toEqual([612, 792])
    expect([s[1].width, s[1].height]).toEqual([792, 612])
  })

  it('por porcentaje', async () => {
    const s = await sizes(await scalePages(await makePdf(1), { mode: 'percent', percent: 50 }))
    expect([s[0].width, s[0].height]).toEqual([150, 200])
  })
})

describe('estampar', () => {
  it('las 9 posiciones quedan dentro de la hoja con su margen', () => {
    const c = (p: Parameters<typeof stampCenter>[0]) => stampCenter(p, 600, 800, 100, 40, 20)
    expect(c('tl')).toEqual({ x: 70, y: 780 - 20 })
    expect(c('br')).toEqual({ x: 530, y: 40 })
    expect(c('mc')).toEqual({ x: 300, y: 400 })
    expect(c('tc').x).toBe(300)
  })

  it('elige las páginas a estampar', () => {
    const sel = (m: Parameters<typeof pageSelected>[0]) => [0, 1, 2, 3].filter((i) => pageSelected(m, i, 4))
    expect(sel('all')).toEqual([0, 1, 2, 3])
    expect(sel('first')).toEqual([0])
    expect(sel('last')).toEqual([3])
    expect(sel('odd')).toEqual([0, 2])
    expect(sel('even')).toEqual([1, 3])
  })

  it('genera el PDF con y sin marco, girado', async () => {
    const base = { text: 'APROBADO', size: 28, color: '#16a34a', opacity: 0.8, rotation: -15, position: 'tr' as const, margin: 24, pages: 'first' as const, imageScale: 0.3 }
    const plain = await addStamp(await makePdf(3), { ...base, frame: false })
    const framed = await addStamp(await makePdf(3), { ...base, frame: true })
    expect((await PDFDocument.load(plain)).getPageCount()).toBe(3)
    expect(framed.length).toBeGreaterThan(plain.length - 1)
  })
})

describe('dividir por tamaño', () => {
  it('cada parte cabe en el límite y no se pierde ninguna página', async () => {
    const file = await makePdf(24, 40)
    const one = (await splitBySize(file, Number.MAX_SAFE_INTEGER))[0].bytes.length
    const limit = Math.round(one / 3)
    const parts = await splitBySize(file, limit)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every((p) => p.oversize || p.bytes.length <= limit)).toBe(true)
    expect(parts.reduce((n, p) => n + (p.to - p.from), 0)).toBe(24)
    // partes consecutivas, sin huecos
    parts.forEach((p, i) => { if (i) expect(p.from).toBe(parts[i - 1].to) })
    expect((await PDFDocument.load(parts[0].bytes)).getPageCount()).toBe(parts[0].to - parts[0].from)
  })

  it('una página que no cabe va sola y se marca', async () => {
    const parts = await splitBySize(await makePdf(3, 40), 10)
    expect(parts).toHaveLength(3)
    expect(parts.every((p) => p.oversize)).toBe(true)
  })
})

describe('efectos', () => {
  it('invertir cambia los colores y respeta la transparencia', () => {
    const px = new Uint8ClampedArray([10, 20, 30, 128, 255, 255, 255, 255])
    invertPixels(px)
    expect([...px]).toEqual([245, 235, 225, 128, 0, 0, 0, 255])
  })

  it('modo oscuro: el blanco se vuelve casi negro, el negro blanco suave y el tono se conserva', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 200, 40, 40, 255, 128, 128, 128, 255])
    darkPixels(px)
    expect(px[0]).toBeLessThan(40) // fondo blanco -> oscuro
    expect(px[4]).toBeGreaterThan(200) // texto negro -> claro
    // un rojo sigue siendo rojo (el canal rojo domina) y se oscurece/aclara según su luminosidad
    expect(px[8]).toBeGreaterThan(px[9] + 30)
    expect(px[8]).toBeGreaterThan(px[10] + 30)
    // un gris neutro sigue siendo neutro
    expect(px[12]).toBe(px[13])
    expect(px[13]).toBe(px[14])
    // el canal alfa no se toca
    expect([px[3], px[7], px[11], px[15]]).toEqual([255, 255, 255, 255])
  })

  it('el generador con semilla es repetible', () => {
    const a = seeded(42)
    const b = seeded(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(seeded(1)()).not.toBe(seeded(2)())
  })

  it('el efecto escáner da grises, y en blanco y negro solo 0 o 255', () => {
    const w = 40, h = 40
    const img = () => new Uint8ClampedArray(Array.from({ length: w * h }, (_, i) => (i % 7 ? [200, 180, 160, 255] : [20, 40, 60, 255])).flat())
    const gray = img()
    scanPixels(gray, w, h, 2, false, seeded(7))
    for (let i = 0; i < gray.length; i += 4) expect(gray[i]).toBe(gray[i + 1])
    const bw = img()
    scanPixels(bw, w, h, 2, true, seeded(7))
    expect(new Set([...bw].filter((_, i) => i % 4 === 0))).toEqual(new Set([0, 255]))
  })
})
