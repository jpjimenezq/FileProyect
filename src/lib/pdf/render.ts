import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const cache = new WeakMap<File, Promise<PDFDocumentProxy>>()

export function loadPdf(file: File) {
  let doc = cache.get(file)
  if (!doc) {
    // pdf.js transfiere el buffer al worker, así que se le pasa una copia
    doc = file.arrayBuffer().then((buf) => pdfjs.getDocument({ data: new Uint8Array(buf) }).promise)
    cache.set(file, doc)
  }
  return doc
}

const active = new WeakMap<HTMLCanvasElement, RenderTask>()
const chains = new WeakMap<HTMLCanvasElement, Promise<void>>()

/**
 * Un canvas no admite dos render() a la vez (StrictMode, cambio de página…):
 * se cancela el render en curso y los nuevos esperan en cola a que termine.
 */
export function renderPage(pdf: PDFDocumentProxy, pageNum: number, canvas: HTMLCanvasElement, width: number) {
  active.get(canvas)?.cancel()
  const run = (chains.get(canvas) ?? Promise.resolve()).then(async () => {
    const page = await pdf.getPage(pageNum)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: width / base.width })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const task = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport })
    active.set(canvas, task)
    try {
      await task.promise
    } catch (e) {
      if (!(e instanceof pdfjs.RenderingCancelledException)) throw e
    }
  })
  chains.set(canvas, run.catch(() => {}))
  return run
}

export async function pageToBlob(pdf: PDFDocumentProxy, pageNum: number, scale: number, quality = 0.92, type: 'image/jpeg' | 'image/png' = 'image/jpeg') {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo generar la imagen'))), type, quality))
}
