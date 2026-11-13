import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { PDFFont } from 'pdf-lib'

const W = 595.28
const H = 841.89
const M = 56

const supported = (font: PDFFont, cache: Map<string, boolean>, ch: string) => {
  let ok = cache.get(ch)
  if (ok === undefined) {
    try {
      font.widthOfTextAtSize(ch, 10)
      ok = true
    } catch {
      ok = false
    }
    cache.set(ch, ok)
  }
  return ok
}

/** Genera un PDF de solo texto: cada elemento de `pages` empieza en una página nueva */
export async function textToPdf(pages: string[], opts: { mono?: boolean; fontSize?: number } = {}) {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(opts.mono ? StandardFonts.Courier : StandardFonts.Helvetica)
  const bold = await doc.embedFont(opts.mono ? StandardFonts.CourierBold : StandardFonts.HelveticaBold)
  const cache = new Map<string, boolean>()
  // Helvetica solo cubre alfabetos latinos (WinAnsi): lo demás se sustituye por "?"
  const clean = (s: string) =>
    [...s.replace(/\*\*|__|`/g, '').replace(/\t/g, '    ')]
      .map((c) => (supported(regular, cache, c) ? c : c === '‑' || c === '‐' ? '-' : '?'))
      .join('')

  for (const text of pages) {
    let page = doc.addPage([W, H])
    let y = H - M
    const ensure = (needed: number) => {
      if (y - needed < M) {
        page = doc.addPage([W, H])
        y = H - M
      }
    }

    for (const raw of text.split('\n')) {
      // en modo monoespaciado (código, JSON) no se interpreta Markdown
      const heading = opts.mono ? null : /^(#{1,3})\s+(.*)$/.exec(raw)
      const bullet = opts.mono ? null : /^\s*[-*•]\s+(.*)$/.exec(raw)
      const font = heading ? bold : regular
      const body = opts.fontSize ?? (opts.mono ? 10 : 11)
      const size = heading ? [0, body * 1.65, body * 1.4, body * 1.2][heading[1].length] : body
      const indent = bullet ? 14 : 0
      const content = clean(heading ? heading[2] : bullet ? bullet[1] : raw)
      const lineHeight = size * 1.4

      if (!content.trim()) {
        y -= lineHeight * 0.6
        continue
      }
      if (heading) y -= size * 0.5

      const lines: string[] = []
      if (opts.mono) {
        // código y JSON: se conserva la sangría y se corta por caracteres
        const perLine = Math.max(10, Math.floor((W - 2 * M - indent) / font.widthOfTextAtSize('M', size)))
        for (let i = 0; i < content.length; i += perLine) lines.push(content.slice(i, i + perLine))
      } else {
        let line = ''
        for (const word of content.split(/\s+/)) {
          const attempt = line ? `${line} ${word}` : word
          if (font.widthOfTextAtSize(attempt, size) > W - 2 * M - indent && line) {
            lines.push(line)
            line = word
          } else line = attempt
        }
        lines.push(line)
      }

      lines.forEach((l, i) => {
        ensure(lineHeight)
        y -= lineHeight
        if (bullet && i === 0) page.drawText('•', { x: M + 2, y, size, font, color: rgb(0.1, 0.1, 0.1) })
        page.drawText(l, { x: M + indent, y, size, font, color: rgb(0.1, 0.1, 0.1) })
      })
    }
  }
  if (!pages.length) doc.addPage([W, H])
  return doc.save()
}
