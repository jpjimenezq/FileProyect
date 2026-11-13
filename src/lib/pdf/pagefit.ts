import type { ImageOptions } from './ops'

const PAGE = { a4: [595.28, 841.89], letter: [612, 792] } as const

/** Tamaño de página en puntos para una imagen, según las opciones (el mismo criterio para PDF, Word y la vista previa) */
export function pageFor(img: { width: number; height: number }, o: ImageOptions) {
  const m = o.margin
  if (o.size === 'fit') return { pw: img.width * 0.75 + m * 2, ph: img.height * 0.75 + m * 2, w: img.width * 0.75, h: img.height * 0.75, m }
  const [bw, bh] = PAGE[o.size]
  const landscape = o.orientation === 'auto' ? img.width > img.height : o.orientation === 'landscape'
  const [pw, ph] = landscape ? [bh, bw] : [bw, bh]
  const scale = Math.min((pw - m * 2) / img.width, (ph - m * 2) / img.height)
  return { pw, ph, w: img.width * scale, h: img.height * scale, m }
}
