import { listImages } from './imagedecode'
import type { RawImage } from './imagedecode'
import type { Progress } from './ops'

/** Convierte píxeles RGB/gris (+ transparencia opcional) a PNG con un canvas */
async function rawToPng(img: Extract<RawImage, { kind: 'raw' }>): Promise<Blob> {
  const { width, height, channels, data, alpha } = img
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    if (channels === 3) {
      rgba[p] = data[i * 3]; rgba[p + 1] = data[i * 3 + 1]; rgba[p + 2] = data[i * 3 + 2]
    } else {
      rgba[p] = rgba[p + 1] = rgba[p + 2] = data[i]
    }
    rgba[p + 3] = alpha ? alpha[i] : 255
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.putImageData(new ImageData(rgba, width, height), 0, 0)
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo crear la imagen'))), 'image/png'))
}

export async function extractImages(file: File, minSize: number, onProgress?: Progress) {
  const { images, skipped } = await listImages(file, minSize)
  const out: { name: string; blob: Blob }[] = []
  for (const [i, img] of images.entries()) {
    const n = String(i + 1).padStart(2, '0')
    if (img.kind === 'jpeg') out.push({ name: `imagen-${n}.jpg`, blob: new Blob([img.bytes as BlobPart], { type: 'image/jpeg' }) })
    else if (img.kind === 'jpx') out.push({ name: `imagen-${n}.jp2`, blob: new Blob([img.bytes as BlobPart], { type: 'image/jp2' }) })
    else out.push({ name: `imagen-${n}.png`, blob: await rawToPng(img) })
    onProgress?.((i + 1) / images.length)
  }
  return { files: out, skipped }
}
