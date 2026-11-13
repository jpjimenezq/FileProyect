/** Efectos sobre páginas ya convertidas en imagen. Trabajan con RGBA de 8 bits (como ImageData). */

/** Invierte los colores (el canal alfa no se toca) */
export function invertPixels(rgba: Uint8ClampedArray | Uint8Array) {
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255 - rgba[i]
    rgba[i + 1] = 255 - rgba[i + 1]
    rgba[i + 2] = 255 - rgba[i + 2]
  }
}

export function invertCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  invertPixels(data.data)
  ctx.putImageData(data, 0, 0)
  return canvas
}

export type ScanLevel = 1 | 2 | 3

/** Generador pseudoaleatorio con semilla: el mismo documento da siempre el mismo "ruido" */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

/** Gris, contraste, grano y oscurecimiento suave en los bordes; con `bw` además se binariza */
export function scanPixels(rgba: Uint8ClampedArray, width: number, height: number, level: ScanLevel, bw: boolean, rand: () => number) {
  const contrast = 1.1 + level * 0.12
  const noise = 3 + level * 5
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let g = rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11
      g = (g - 128) * contrast + 128
      // sombra en los bordes, como el cristal de un escáner
      const dx = Math.min(x, width - 1 - x) / width
      const dy = Math.min(y, height - 1 - y) / height
      g -= Math.max(0, 0.04 - Math.min(dx, dy)) * 700 * (level / 3)
      g += (rand() - 0.5) * 2 * noise
      if (bw) g = g < 150 ? 0 : 255
      const v = g < 0 ? 0 : g > 255 ? 255 : g
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v
    }
  }
}

/** Devuelve un canvas nuevo con la página ligeramente girada, sobre papel, y con el aspecto de un escaneo */
export function scannerCanvas(src: HTMLCanvasElement, level: ScanLevel, bw: boolean, seed: number) {
  const rand = seeded(seed)
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#f6f4ef'
  ctx.fillRect(0, 0, out.width, out.height)
  const angle = ((rand() - 0.5) * 2 * level * 0.5 * Math.PI) / 180
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate(angle)
  ctx.drawImage(src, -out.width / 2, -out.height / 2)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const data = ctx.getImageData(0, 0, out.width, out.height)
  scanPixels(data.data, out.width, out.height, level, bw, rand)
  ctx.putImageData(data, 0, 0)
  return out
}

/**
 * Modo oscuro: da la vuelta a la luminosidad (HSL) y conserva el tono y la saturación, así los colores
 * siguen siendo reconocibles. El blanco pasa a un gris casi negro y el negro a un blanco suave (más cómodo que el negativo puro).
 */
export function darkPixels(rgba: Uint8ClampedArray | Uint8Array) {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    let h = 0
    let s = 0
    if (d > 0) {
      s = d / (1 - Math.abs(2 * l - 1))
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      if (h < 0) h += 6
    }
    // 1 -> 0.08 (fondo) y 0 -> 0.9 (texto)
    const nl = 0.08 + (1 - l) * 0.82
    const c = (1 - Math.abs(2 * nl - 1)) * s
    const x = c * (1 - Math.abs((h % 2) - 1))
    const m = nl - c / 2
    const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]
    rgba[i] = Math.round((r1 + m) * 255)
    rgba[i + 1] = Math.round((g1 + m) * 255)
    rgba[i + 2] = Math.round((b1 + m) * 255)
  }
}
