import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib'
import type { PDFObject } from 'pdf-lib'

/** Imagen lista para guardar: JPEG y JPEG2000 se devuelven tal cual; el resto como píxeles RGB o gris */
export type RawImage =
  | { kind: 'jpeg'; width: number; height: number; bytes: Uint8Array }
  | { kind: 'jpx'; width: number; height: number; bytes: Uint8Array }
  | { kind: 'raw'; width: number; height: number; channels: 1 | 3; data: Uint8Array; alpha?: Uint8Array }

const name = (o: PDFObject | undefined) => (o instanceof PDFName ? o.decodeText() : undefined)
const num = (o: PDFObject | undefined) => (o instanceof PDFNumber ? o.asNumber() : undefined)

const filtersOf = (dict: PDFDict): string[] => {
  const f = dict.get(PDFName.of('Filter'))
  if (f instanceof PDFName) return [f.decodeText()]
  if (f instanceof PDFArray) return f.asArray().map((x) => name(x) ?? '')
  return []
}

// ── Espacios de color ───────────────────────────────────────────────────
type Space =
  | { kind: 'gray'; n: 1 }
  | { kind: 'rgb'; n: 3 }
  | { kind: 'cmyk'; n: 4 }
  | { kind: 'indexed'; n: 1; base: Space; palette: Uint8Array; hival: number }

function spaceOf(doc: PDFDocument, cs: PDFObject | undefined, depth = 0): Space | undefined {
  if (depth > 3) return undefined
  const resolved = cs instanceof PDFName ? cs : doc.context.lookup(cs)
  const n = name(resolved)
  if (n === 'DeviceGray' || n === 'G' || n === 'CalGray') return { kind: 'gray', n: 1 }
  if (n === 'DeviceRGB' || n === 'RGB' || n === 'CalRGB') return { kind: 'rgb', n: 3 }
  if (n === 'DeviceCMYK' || n === 'CMYK') return { kind: 'cmyk', n: 4 }
  if (!(resolved instanceof PDFArray)) return undefined
  const head = name(resolved.get(0))
  if (head === 'CalGray') return { kind: 'gray', n: 1 }
  if (head === 'CalRGB') return { kind: 'rgb', n: 3 }
  if (head === 'ICCBased') {
    const icc = doc.context.lookup(resolved.get(1))
    const comps = icc instanceof PDFRawStream ? num(icc.dict.get(PDFName.of('N'))) : undefined
    return comps === 1 ? { kind: 'gray', n: 1 } : comps === 3 ? { kind: 'rgb', n: 3 } : comps === 4 ? { kind: 'cmyk', n: 4 } : undefined
  }
  if (head === 'Indexed' || head === 'I') {
    const base = spaceOf(doc, resolved.get(1), depth + 1)
    const hival = num(resolved.get(2))
    const lookup = doc.context.lookup(resolved.get(3))
    let palette: Uint8Array | undefined
    if (lookup instanceof PDFString || lookup instanceof PDFHexString) palette = lookup.asBytes()
    else if (lookup instanceof PDFRawStream) palette = decodePDFRawStream(lookup).decode()
    if (base && base.kind !== 'indexed' && hival !== undefined && palette) return { kind: 'indexed', n: 1, base, palette, hival }
  }
  return undefined
}

/** Desempaqueta muestras de 1, 2, 4, 8 o 16 bits (cada fila empieza en un byte nuevo) a valores 0..(2^bpc − 1) */
function unpack(data: Uint8Array, width: number, height: number, comps: number, bpc: number): Uint16Array | undefined {
  const rowBytes = Math.ceil((width * comps * bpc) / 8)
  if (data.length < rowBytes * height) return undefined
  const out = new Uint16Array(width * height * comps)
  const perRow = width * comps
  for (let y = 0; y < height; y++) {
    const row = y * rowBytes
    for (let i = 0; i < perRow; i++) {
      let v: number
      if (bpc === 8) v = data[row + i]
      else if (bpc === 16) v = (data[row + i * 2] << 8) | data[row + i * 2 + 1]
      else {
        const bit = i * bpc
        v = (data[row + (bit >> 3)] >> (8 - bpc - (bit & 7))) & ((1 << bpc) - 1)
      }
      out[y * perRow + i] = v
    }
  }
  return out
}

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

/** Convierte las muestras a RGB o gris de 8 bits, aplicando Decode, paleta y CMYK→RGB */
function toPixels(space: Space, samples: Uint16Array, count: number, bpc: number, decode: number[] | undefined): { channels: 1 | 3; data: Uint8Array } {
  const max = (1 << bpc) - 1
  const dec = (v: number, c: number) => {
    const d0 = decode?.[c * 2] ?? 0
    const d1 = decode?.[c * 2 + 1] ?? 1
    return d0 + (v / max) * (d1 - d0)
  }

  if (space.kind === 'gray') {
    const out = new Uint8Array(count)
    for (let i = 0; i < count; i++) out[i] = clamp8(dec(samples[i], 0) * 255)
    return { channels: 1, data: out }
  }
  if (space.kind === 'rgb') {
    const out = new Uint8Array(count * 3)
    for (let i = 0; i < count * 3; i++) out[i] = clamp8(dec(samples[i], i % 3) * 255)
    return { channels: 3, data: out }
  }
  if (space.kind === 'cmyk') {
    const out = new Uint8Array(count * 3)
    for (let i = 0; i < count; i++) {
      const c = dec(samples[i * 4], 0), m = dec(samples[i * 4 + 1], 1), y = dec(samples[i * 4 + 2], 2), k = dec(samples[i * 4 + 3], 3)
      out[i * 3] = clamp8(255 * (1 - c) * (1 - k))
      out[i * 3 + 1] = clamp8(255 * (1 - m) * (1 - k))
      out[i * 3 + 2] = clamp8(255 * (1 - y) * (1 - k))
    }
    return { channels: 3, data: out }
  }
  // indexed: la muestra es el índice de la paleta, que está en el espacio base
  const base = space.base
  const bn = base.n
  const out = new Uint8Array(count * 3)
  for (let i = 0; i < count; i++) {
    const idx = Math.min(samples[i], space.hival)
    const p = idx * bn
    let r = 0, g = 0, b = 0
    if (base.kind === 'gray') r = g = b = space.palette[p] ?? 0
    else if (base.kind === 'rgb') { r = space.palette[p] ?? 0; g = space.palette[p + 1] ?? 0; b = space.palette[p + 2] ?? 0 }
    else {
      const c = (space.palette[p] ?? 0) / 255, m = (space.palette[p + 1] ?? 0) / 255, y = (space.palette[p + 2] ?? 0) / 255, k = (space.palette[p + 3] ?? 0) / 255
      r = 255 * (1 - c) * (1 - k); g = 255 * (1 - m) * (1 - k); b = 255 * (1 - y) * (1 - k)
    }
    out[i * 3] = clamp8(r); out[i * 3 + 1] = clamp8(g); out[i * 3 + 2] = clamp8(b)
  }
  return { channels: 3, data: out }
}

const decodeArray = (dict: PDFDict) => {
  const d = dict.get(PDFName.of('Decode'))
  return d instanceof PDFArray ? d.asArray().map((x) => num(x) ?? 0) : undefined
}

/** Bytes de la imagen una vez deshechos los filtros de compresión de datos (no los de imagen) */
function plainBytes(stream: PDFRawStream, filters: string[]): Uint8Array | undefined {
  if (!filters.length) return stream.contents
  try { return decodePDFRawStream(stream).decode() } catch { return undefined }
}

/** Canal alfa a partir de una SMask (cualquier profundidad de bits, en gris) */
function alphaOf(doc: PDFDocument, smask: PDFObject | undefined, width: number, height: number): Uint8Array | undefined {
  const sm = doc.context.lookup(smask)
  if (!(sm instanceof PDFRawStream)) return undefined
  if (num(sm.dict.get(PDFName.of('Width'))) !== width || num(sm.dict.get(PDFName.of('Height'))) !== height) return undefined
  const f = filtersOf(sm.dict)
  if (f.some((x) => ['DCTDecode', 'JPXDecode', 'CCITTFaxDecode', 'JBIG2Decode'].includes(x))) return undefined
  const bytes = plainBytes(sm, f)
  const bpc = num(sm.dict.get(PDFName.of('BitsPerComponent'))) ?? 8
  const samples = bytes && unpack(bytes, width, height, 1, bpc)
  if (!samples) return undefined
  const max = (1 << bpc) - 1
  const out = new Uint8Array(width * height)
  for (let i = 0; i < out.length; i++) out[i] = clamp8((samples[i] / max) * 255)
  return out
}

/**
 * Recorre los objetos del PDF buscando imágenes y las devuelve listas para guardar.
 * - JPEG y JPEG2000: se devuelven sin tocar (misma calidad que el original).
 * - Resto: gris, RGB, CMYK, ICC, paleta (Indexed) y máscaras de 1 bit, de 1 a 16 bits por componente, con
 *   los filtros Flate, LZW, ASCII85, ASCIIHex y RunLength, y con su transparencia (SMask).
 * - `special` cuenta las que no se pueden: escaneos CCITT/JBIG2 y espacios de color poco habituales.
 */
export async function listImages(file: File, minSize = 1) {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false })
  const objects = doc.context.enumerateIndirectObjects()

  // las imágenes usadas como máscara de otra no son contenido propio
  const masks = new Set<PDFObject>()
  for (const [, obj] of objects) {
    if (obj instanceof PDFRawStream && name(obj.dict.get(PDFName.of('Subtype'))) === 'Image') {
      const sm = doc.context.lookup(obj.dict.get(PDFName.of('SMask')))
      if (sm) masks.add(sm)
    }
  }

  const images: RawImage[] = []
  let special = 0
  const seen = new Set<string>()
  const add = (img: RawImage, key: string) => {
    if (!seen.has(key)) { seen.add(key); images.push(img) }
  }

  for (const [, obj] of objects) {
    if (!(obj instanceof PDFRawStream) || masks.has(obj)) continue
    if (name(obj.dict.get(PDFName.of('Subtype'))) !== 'Image') continue
    const width = num(obj.dict.get(PDFName.of('Width'))) ?? 0
    const height = num(obj.dict.get(PDFName.of('Height'))) ?? 0
    if (width < minSize || height < minSize) continue

    const f = filtersOf(obj.dict)
    const last = f[f.length - 1]
    if (f.length === 1 && last === 'DCTDecode') { add({ kind: 'jpeg', width, height, bytes: obj.contents }, `j${obj.contents.length}:${obj.contents.subarray(0, 64).join(',')}`); continue }
    if (f.length === 1 && last === 'JPXDecode') { add({ kind: 'jpx', width, height, bytes: obj.contents }, `x${obj.contents.length}:${obj.contents.subarray(0, 64).join(',')}`); continue }
    if (f.some((x) => ['DCTDecode', 'JPXDecode', 'CCITTFaxDecode', 'JBIG2Decode'].includes(x))) { special++; continue }

    const bytes = plainBytes(obj, f)
    const isMask = obj.dict.get(PDFName.of('ImageMask')) === PDFBool.True
    const bpc = isMask ? 1 : num(obj.dict.get(PDFName.of('BitsPerComponent'))) ?? 8
    const space: Space | undefined = isMask ? { kind: 'gray', n: 1 } : spaceOf(doc, obj.dict.get(PDFName.of('ColorSpace')))
    if (!bytes || !space || ![1, 2, 4, 8, 16].includes(bpc)) { special++; continue }

    const samples = unpack(bytes, width, height, space.n, bpc)
    if (!samples) { special++; continue }
    const { channels, data } = toPixels(space, samples, width * height, bpc, decodeArray(obj.dict))
    const alpha = isMask ? undefined : alphaOf(doc, obj.dict.get(PDFName.of('SMask')), width, height)
    add({ kind: 'raw', width, height, channels, data, alpha }, `r${width}x${height}:${data.subarray(0, 256).join(',')}:${data.length}`)
  }
  return { images, skipped: special }
}
