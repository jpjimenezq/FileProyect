import { describe, expect, it } from 'vitest'
import { jpegOrientation } from './photos'

/** JPG mínimo con un bloque EXIF que solo trae la etiqueta de orientación */
function jpegWith(orientation: number, littleEndian: boolean) {
  const u16 = (n: number) => (littleEndian ? [n & 255, n >> 8] : [n >> 8, n & 255])
  const u32 = (n: number) => (littleEndian ? [n & 255, (n >> 8) & 255, 0, 0] : [0, 0, (n >> 8) & 255, n & 255])
  const tiff = [...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)]
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const len = exif.length + 2
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...exif, 0xff, 0xda, 0, 2])
}

describe('jpegOrientation', () => {
  it('lee la orientación en little y big endian', () => {
    expect(jpegOrientation(jpegWith(6, true))).toBe(6)
    expect(jpegOrientation(jpegWith(8, false))).toBe(8)
    expect(jpegOrientation(jpegWith(1, true))).toBe(1)
  })
  it('sin EXIF, o si no es un JPG, es 1', () => {
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1)
    expect(jpegOrientation(new Uint8Array([1, 2, 3, 4]))).toBe(1)
  })
})
