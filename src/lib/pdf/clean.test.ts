import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import { flattenForms, readMetadata, removeAnnotations, writeMetadata } from './clean'
import { listImages } from './imagedecode'
import { inkRatio } from './blank'

const toFile = async (doc: PDFDocument, name = 't.pdf') => new File([(await doc.save()) as BlobPart], name, { type: 'application/pdf' })

// PNG 2x2 RGBA y JPEG 1x1 mínimos para incrustar (se amplían a 32x32 con la función de dibujo)
function png(w: number, h: number, alpha: boolean) {
  const rgba = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) rgba.set([200, 30 + (i % 50), 90, alpha ? (i % 2 ? 255 : 128) : 255], i * 4)
  return rgba
}

async function pdfWithImages() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 300])
  // pdf-lib solo incrusta PNG/JPG ya codificados: se genera un PNG válido con un codificador mínimo
  const { deflateSync } = await import('node:zlib')
  const encode = (w: number, h: number, withAlpha: boolean) => {
    const raw = png(w, h, withAlpha)
    const rows = Buffer.alloc((w * 4 + 1) * h)
    for (let y = 0; y < h; y++) { rows[y * (w * 4 + 1)] = 0; Buffer.from(raw.subarray(y * w * 4, (y + 1) * w * 4)).copy(rows, y * (w * 4 + 1) + 1) }
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
      const body = Buffer.concat([Buffer.from(type), data])
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
      return Buffer.concat([len, body, crc])
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
    return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]))
  }
  const a = await doc.embedPng(encode(40, 30, true))
  const b = await doc.embedPng(encode(64, 64, false))
  page.drawImage(a, { x: 10, y: 10, width: 40, height: 30 })
  page.drawImage(b, { x: 100, y: 100, width: 64, height: 64 })
  page.drawImage(a, { x: 200, y: 200, width: 40, height: 30 }) // la misma imagen otra vez: no debe duplicarse
  return doc
}

// CRC-32 para los trozos PNG de la prueba
function crc32(buf: Buffer) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return crc ^ 0xffffffff
}

describe('metadatos', () => {
  it('lee, edita y borra', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.setTitle('Informe'); doc.setAuthor('Ana'); doc.setKeywords(['a', 'b'])
    const file = await toFile(doc)

    const meta = await readMetadata(file)
    expect(meta.title).toBe('Informe')
    expect(meta.author).toBe('Ana')

    const edited = new File([(await writeMetadata(file, { title: 'Nuevo', author: 'Luis', subject: 'Tema', keywords: 'uno, dos , ,tres' }, false)) as BlobPart], 'e.pdf')
    const after = await readMetadata(edited)
    expect(after.title).toBe('Nuevo')
    expect(after.subject).toBe('Tema')
    expect(after.keywords).toBe('uno dos tres')

    const cleared = new File([(await writeMetadata(edited, { title: '', author: '', subject: '', keywords: '' }, true)) as BlobPart], 'c.pdf')
    const none = await readMetadata(cleared)
    expect([none.title, none.author, none.subject, none.keywords]).toEqual(['', '', '', ''])
  })
})

describe('anotaciones', () => {
  async function withAnnots() {
    const doc = await PDFDocument.create()
    const page = doc.addPage()
    const mk = (subtype: string) => doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: subtype, Rect: [0, 0, 10, 10], Contents: PDFString.of('x') }))
    page.node.set(PDFName.of('Annots'), doc.context.obj([mk('Text'), mk('Highlight'), mk('Link')]))
    return toFile(doc)
  }
  const count = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPage(0).node.Annots()?.size() ?? 0

  it('quita todas', async () => {
    const r = await removeAnnotations(await withAnnots(), false)
    expect(r.removed).toBe(3)
    expect(await count(r.bytes)).toBe(0)
  })
  it('puede conservar los enlaces', async () => {
    const r = await removeAnnotations(await withAnnots(), true)
    expect(r.removed).toBe(2)
    expect(await count(r.bytes)).toBe(1)
  })
})

describe('aplanar', () => {
  it('convierte los campos en contenido fijo', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage()
    const tf = doc.getForm().createTextField('nombre')
    tf.setText('Ana')
    tf.addToPage(page, { x: 10, y: 10, width: 100, height: 20 })
    const r = await flattenForms(await toFile(doc))
    expect(r.fields).toBe(1)
    expect((await PDFDocument.load(r.bytes)).getForm().getFields()).toHaveLength(0)
  })
})

describe('imágenes', () => {
  it('extrae cada imagen una vez, con su transparencia', async () => {
    const { images, skipped } = await listImages(await toFile(await pdfWithImages()))
    expect(skipped).toBe(0)
    expect(images).toHaveLength(2)
    const small = images.find((i) => i.width === 40)!
    expect(small.kind).toBe('raw')
    if (small.kind === 'raw') {
      expect(small.data.length).toBe(40 * 30 * 3)
      expect(small.alpha?.length).toBe(40 * 30)
      expect(small.alpha![0]).toBe(128)
      expect(small.alpha![1]).toBe(255)
    }
  })
  it('ignora las imágenes más pequeñas que el mínimo', async () => {
    const { images } = await listImages(await toFile(await pdfWithImages()), 50)
    expect(images).toHaveLength(1)
    expect(images[0].width).toBe(64)
  })
  it('un PDF sin imágenes devuelve una lista vacía', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    expect((await listImages(await toFile(doc))).images).toEqual([])
  })
})

describe('inkRatio', () => {
  const px = (r: number, g: number, b: number, a = 255, n = 100) => new Uint8ClampedArray(Array.from({ length: n }, () => [r, g, b, a]).flat())
  it('una página blanca o transparente no tiene tinta', () => {
    expect(inkRatio(px(255, 255, 255))).toBe(0)
    expect(inkRatio(px(0, 0, 0, 0))).toBe(0)
  })
  it('mide la fracción de píxeles oscuros', () => {
    const data = px(255, 255, 255)
    data.set([0, 0, 0, 255], 0)
    data.set([20, 20, 20, 255], 4)
    expect(inkRatio(data)).toBeCloseTo(0.02)
  })
})


describe('imágenes: formatos poco habituales', () => {
  type Dict = Record<string, unknown>
  /** PDF con un único objeto imagen definido a mano (sin dibujarlo en la página: basta con que exista) */
  async function withImage(dict: Dict, bytes: Uint8Array, flate = true) {
    const doc = await PDFDocument.create()
    doc.addPage()
    const base = { Type: 'XObject', Subtype: 'Image', ...dict } as never
    doc.context.register(flate ? doc.context.flateStream(bytes, base) : doc.context.stream(bytes, base))
    return listImages(await toFile(doc))
  }
  const raw = (r: Awaited<ReturnType<typeof listImages>>) => {
    const img = r.images[0]
    if (img?.kind !== 'raw') throw new Error('se esperaba una imagen en bruto')
    return img
  }

  it('paleta (Indexed) de 8 bits', async () => {
    const palette = PDFHexString.of('ff00000000ff')
    const img = raw(await withImage({ Width: 2, Height: 1, BitsPerComponent: 8, ColorSpace: ['Indexed', 'DeviceRGB', 1, palette] }, new Uint8Array([0, 1])))
    expect(img.channels).toBe(3)
    expect([...img.data]).toEqual([255, 0, 0, 0, 0, 255])
  })

  it('gris de 1 bit, con las filas alineadas a byte', async () => {
    // 10 píxeles por fila: 10101010 10 → 2 bytes por fila
    const img = raw(await withImage({ Width: 10, Height: 2, BitsPerComponent: 1, ColorSpace: 'DeviceGray' }, new Uint8Array([0xaa, 0x80, 0x55, 0x00])))
    expect(img.channels).toBe(1)
    expect([...img.data.slice(0, 4)]).toEqual([255, 0, 255, 0])
    expect([img.data[8], img.data[9]]).toEqual([255, 0]) // los 2 bits que quedan del segundo byte (10)
    expect(img.data[10]).toBe(0) // la segunda fila empieza en 01010101
    expect(img.data[11]).toBe(255)
  })

  it('gris de 4 bits', async () => {
    const img = raw(await withImage({ Width: 3, Height: 1, BitsPerComponent: 4, ColorSpace: 'DeviceGray' }, new Uint8Array([0xf0, 0x80])))
    expect([...img.data]).toEqual([255, 0, 136])
  })

  it('respeta el array Decode invertido', async () => {
    const img = raw(await withImage({ Width: 2, Height: 1, BitsPerComponent: 8, ColorSpace: 'DeviceGray', Decode: [1, 0] }, new Uint8Array([0, 255])))
    expect([...img.data]).toEqual([255, 0])
  })

  it('CMYK se convierte a RGB', async () => {
    const img = raw(await withImage({ Width: 2, Height: 1, BitsPerComponent: 8, ColorSpace: 'DeviceCMYK' }, new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255])))
    expect(img.channels).toBe(3)
    expect([...img.data]).toEqual([255, 255, 255, 0, 0, 0])
  })

  it('JPEG2000 se devuelve sin tocar', async () => {
    const bytes = new Uint8Array([0, 0, 0, 12, 0x6a, 0x50, 0x20, 0x20])
    const r = await withImage({ Width: 8, Height: 8, BitsPerComponent: 8, ColorSpace: 'DeviceRGB', Filter: 'JPXDecode' }, bytes, false)
    expect(r.images[0].kind).toBe('jpx')
  })

  it('los escaneos CCITT se cuentan como no admitidos', async () => {
    const r = await withImage({ Width: 8, Height: 8, BitsPerComponent: 1, ColorSpace: 'DeviceGray', Filter: 'CCITTFaxDecode' }, new Uint8Array(8), false)
    expect(r.images).toEqual([])
    expect(r.skipped).toBe(1)
  })

  it('las imágenes diminutas se incluyen con el mínimo por defecto', async () => {
    const r = await withImage({ Width: 4, Height: 4, BitsPerComponent: 8, ColorSpace: 'DeviceGray' }, new Uint8Array(16))
    expect(r.images).toHaveLength(1)
  })
})
