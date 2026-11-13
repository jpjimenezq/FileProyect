import type { Progress } from './pdf/ops'
import { ApiError, apiFetch } from './api'

export const CHUNK = 9000
export const MAX_DOC_CHARS = 200_000

export type AiTask = 'summarize' | 'translate' | 'markdown'

export async function aiCall(task: AiTask, text: string, options: Record<string, string> = {}): Promise<string> {
  let res: Response
  try {
    res = await apiFetch(`/api/ai/${task}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, options }) })
  } catch {
    throw new Error('No se pudo conectar con el servidor.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? 'Error del servicio de IA.', data.code)
  return data.text as string
}

/** Parte un texto en trozos de como máximo `max` caracteres respetando párrafos y, si hace falta, frases */
export function chunkText(text: string, max = CHUNK): string[] {
  const pieces: string[] = []
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= max) { pieces.push(para); continue }
    let rest = para
    while (rest.length > max) {
      const cut = Math.max(rest.lastIndexOf('. ', max), rest.lastIndexOf('\n', max))
      const at = cut > max * 0.5 ? cut + 1 : max
      pieces.push(rest.slice(0, at))
      rest = rest.slice(at).trimStart()
    }
    pieces.push(rest)
  }
  const chunks: string[] = []
  let current = ''
  for (const p of pieces.filter((x) => x.trim())) {
    if (current && current.length + p.length + 2 > max) { chunks.push(current); current = p } else current = current ? `${current}\n\n${p}` : p
  }
  if (current) chunks.push(current)
  return chunks
}

/** Ejecuta `fn` sobre cada elemento con como máximo `limit` llamadas a la vez, conservando el orden */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>, onDone?: () => void): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
      onDone?.()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export function assertUsable(text: string) {
  if (text.trim().length < 20) throw new Error('No se encontró texto en el PDF. Si es un escaneo, usa primero la herramienta OCR.')
  if (text.length > MAX_DOC_CHARS) throw new Error(`El documento es demasiado largo (${Math.round(text.length / 1000)}k caracteres; el máximo es ${MAX_DOC_CHARS / 1000}k).`)
}

/** Resumen por etapas: se resume cada trozo y luego se resumen los resúmenes */
export async function summarize(text: string, opts: { length: string; language: string }, progress?: Progress) {
  assertUsable(text)
  let parts = chunkText(text)
  if (parts.length === 1) {
    const r = await aiCall('summarize', parts[0], opts)
    progress?.(1)
    return r
  }

  let done = 0
  let total = parts.length + 1
  const tick = () => progress?.(Math.min(0.95, ++done / total))
  for (;;) {
    const partial = await mapLimit(parts, 3, (p) => aiCall('summarize', p, { length: 'medium', language: opts.language }), tick)
    const combined = partial.join('\n\n')
    if (combined.length <= CHUNK) {
      const r = await aiCall('summarize', combined, opts)
      progress?.(1)
      return r
    }
    parts = chunkText(combined)
    total += parts.length
  }
}

/** Traduce página a página para conservar la correspondencia con el PDF original */
export async function translatePages(pages: string[], target: string, progress?: Progress) {
  assertUsable(pages.join('\n\n'))
  let done = 0
  return mapLimit(
    pages,
    3,
    async (page) => {
      if (!page.trim()) return ''
      const out: string[] = []
      for (const chunk of chunkText(page)) out.push(await aiCall('translate', chunk, { target }))
      return out.join('\n\n')
    },
    () => progress?.(++done / pages.length),
  )
}

/** Limpia el Markdown heurístico con IA */
export async function cleanMarkdown(markdown: string, progress?: Progress) {
  assertUsable(markdown)
  const chunks = chunkText(markdown)
  let done = 0
  const out = await mapLimit(chunks, 3, (c) => aiCall('markdown', c), () => progress?.(++done / chunks.length))
  return out.join('\n\n') + '\n'
}
