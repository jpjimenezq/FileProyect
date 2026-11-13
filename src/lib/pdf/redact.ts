import { PDFDocument } from 'pdf-lib'
import type { Item, RectItem } from './annotate'
import { loadPdf } from './render'
import type { Progress } from './ops'
import type { PageEffect } from './raster'

/**
 * Censura de verdad: las páginas con zonas marcadas se rasterizan con las zonas en negro,
 * así el texto de debajo desaparece del archivo y no se puede recuperar.
 */
export async function applyRedactions(file: File, items: Item[], onProgress?: Progress) {
  const regions = items.filter((i): i is RectItem => i.kind === 'redact')
  const pdf = await loadPdf(file)
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  const out = await PDFDocument.create()
  const pagesWithRedactions = [...new Set(regions.map((r) => r.page))]

  for (let n = 1; n <= pdf.numPages; n++) {
    if (!pagesWithRedactions.includes(n)) {
      const [copy] = await out.copyPages(src, [n - 1])
      out.addPage(copy)
    } else {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: 2.5 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      ctx.fillStyle = '#000'
      for (const r of regions.filter((x) => x.page === n)) ctx.fillRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height)
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo rasterizar la página'))), 'image/jpeg', 0.92))
      const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
      out.addPage([base.width, base.height]).drawImage(img, { x: 0, y: 0, width: base.width, height: base.height })
    }
    onProgress?.(n / pdf.numPages)
  }
  return out.save()
}

/** Convierte cada página en una imagen: el resultado ya no tiene texto seleccionable ni capas (aplanado total). `process` permite retocar cada página (invertir, efecto escáner…). */
export async function rasterizePdf(file: File, scale: number, onProgress?: Progress, process?: PageEffect) {
  const pdf = await loadPdf(file)
  const out = await PDFDocument.create()
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const finished = process ? await process(canvas, { page, viewport, n }) : canvas
    const blob = await new Promise<Blob>((res, rej) => finished.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo rasterizar la página'))), 'image/jpeg', 0.9))
    const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
    out.addPage([base.width, base.height]).drawImage(img, { x: 0, y: 0, width: base.width, height: base.height })
    onProgress?.(n / pdf.numPages)
  }
  return out.save()
}
