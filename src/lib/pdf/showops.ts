import { OPS, Util } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'

/** Una instrucción que escribe texto en el contenido de la página, con dónde cae y cuánto avanza */
export interface ShowInfo {
  /** Número de orden entre las instrucciones de texto de la página (el mismo que cuenta contentstream.ts) */
  ord: number
  /** Inicio y fin de la línea base del texto, en coordenadas de la página tal como se ve */
  x: number
  y: number
  endX: number
  size: number
  /** Valor del operador TJ que avanza lo mismo que este texto (en milésimas del cuerpo de letra) */
  advance: number
  removable: boolean
  /** Solo escribe espacios (suelen sobrar al final de una línea justificada) */
  blank: boolean
  /** Lo que escribe */
  text: string
  /** Giro del texto en grados sobre la página tal como se ve (0 = horizontal) */
  angle: number
  /** Opacidad con que se pinta (1 = opaco) */
  alpha: number
}

type M = number[]
const IDENT: M = [1, 0, 0, 1, 0, 0]
/** Los argumentos de las matrices llegan como lista de números o como una lista con un solo arreglo numérico */
const nums = (a: unknown): number[] => {
  const list = Array.from(a as ArrayLike<unknown>)
  return list.length === 1 && typeof list[0] === 'object' ? Array.from(list[0] as ArrayLike<number>) : (list as number[])
}
const apply = (m: M, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** Transparencia de relleno que fija un diccionario de estado gráfico (`ca`) */
export function alphaOf(args: unknown): number | undefined {
  let found: number | undefined
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      if (v.length === 2 && v[0] === 'ca' && typeof v[1] === 'number') found = v[1]
      else v.forEach(walk)
    }
  }
  walk(args)
  return found
}

interface GState { alpha: number; ctm: M; fontSize: number; charSpacing: number; wordSpacing: number; hScale: number; leading: number; rise: number; fm0: number; usable: boolean }

/**
 * Recorre las instrucciones de la página como las dibuja pdf.js y devuelve dónde cae cada texto y cuánto avanza.
 * Solo cuenta el texto de la propia página (no el de formularios XObject ni anotaciones, que no están en su contenido).
 */
export async function analyzeShows(page: PDFPageProxy): Promise<{ total: number; shows: ShowInfo[] }> {
  const viewport = page.getViewport({ scale: 1 })
  const list = await page.getOperatorList({ annotationMode: 0 } as never)
  let g: GState = { alpha: 1, ctm: viewport.transform as M, fontSize: 0, charSpacing: 0, wordSpacing: 0, hScale: 1, leading: 0, rise: 0, fm0: 0.001, usable: true }
  const stack: GState[] = []
  let tm: M = IDENT
  let tlm: M = IDENT
  let depth = 0
  let ord = 0
  const shows: ShowInfo[] = []

  const moveText = (tx: number, ty: number) => { tlm = Util.transform(tlm, [1, 0, 0, 1, tx, ty]); tm = tlm }

  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i]
    const a = list.argsArray[i] as unknown
    switch (fn) {
      case OPS.save: stack.push({ ...g }); break
      case OPS.restore: g = stack.pop() ?? g; break
      case OPS.transform: g = { ...g, ctm: Util.transform(g.ctm, nums(a)) }; break
      case OPS.paintFormXObjectBegin: {
        stack.push({ ...g })
        const m = (a as unknown[] | null)?.[0]
        if (m) g = { ...g, ctm: Util.transform(g.ctm, nums(m)) }
        depth++
        break
      }
      case OPS.paintFormXObjectEnd: g = stack.pop() ?? g; depth = Math.max(0, depth - 1); break
      case OPS.beginText: tm = IDENT; tlm = IDENT; break
      case OPS.setFont: {
        const [name, size] = a as [string, number]
        let fm0 = 0.001
        let usable = true
        try {
          const font = page.commonObjs.has(name) ? (page.commonObjs.get(name) as { fontMatrix?: number[]; isType3Font?: boolean; vertical?: boolean }) : undefined
          if (font?.fontMatrix?.[0]) fm0 = font.fontMatrix[0]
          if (font?.isType3Font || font?.vertical) usable = false
        } catch { /* la fuente aún no está cargada: se usan los valores habituales */ }
        g = { ...g, fontSize: size, fm0, usable }
        break
      }
      case OPS.setGState: { const al = alphaOf(a); if (al !== undefined) g = { ...g, alpha: al }; break }
      case OPS.setLeading: g = { ...g, leading: (a as number[])[0] }; break
      case OPS.setCharSpacing: g = { ...g, charSpacing: (a as number[])[0] }; break
      case OPS.setWordSpacing: g = { ...g, wordSpacing: (a as number[])[0] }; break
      case OPS.setHScale: g = { ...g, hScale: (a as number[])[0] / 100 }; break
      case OPS.setTextRise: g = { ...g, rise: (a as number[])[0] }; break
      case OPS.setTextMatrix: tm = nums(a); tlm = tm; break
      case OPS.moveText: { const [tx, ty] = nums(a); moveText(tx, ty); break }
      case OPS.setLeadingMoveText: { const [tx, ty] = nums(a); g = { ...g, leading: -ty }; moveText(tx, ty); break }
      case OPS.nextLine: moveText(0, -g.leading); break
      case OPS.showText: {
        const glyphs = (a as unknown[][])[0] as ({ width: number; isSpace?: boolean; unicode?: string } | number)[]
        let adv = 0
        for (const gl of glyphs) {
          if (typeof gl === 'number') adv += (-gl * g.fontSize) / 1000
          else adv += gl.width * g.fontSize * g.fm0 + (gl.isSpace ? g.wordSpacing : 0) + g.charSpacing
        }
        adv *= g.hScale
        const total = Util.transform(g.ctm, tm)
        const [x, y] = apply(total, 0, g.rise)
        const [endX] = apply(total, adv, g.rise)
        if (depth === 0) {
          shows.push({
            ord: ord++, x, y, endX, size: Math.hypot(total[0], total[1]) * Math.abs(g.fontSize),
            advance: g.fontSize !== 0 && g.hScale !== 0 ? (-adv / (g.fontSize * g.hScale)) * 1000 : 0,
            removable: g.usable && g.fontSize !== 0,
            text: glyphs.map((gl) => (typeof gl === 'number' ? '' : gl.unicode ?? '')).join(''),
            angle: (Math.atan2(total[1], total[0]) * 180) / Math.PI,
            alpha: g.alpha,
            blank: glyphs.every((gl) => typeof gl === 'number' || gl.isSpace === true || /^s*$/.test(gl.unicode ?? 'x')),
          })
        }
        tm = Util.transform(tm, [1, 0, 0, 1, adv, 0])
        break
      }
    }
  }
  return { total: ord, shows }
}
