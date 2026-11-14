import type { Progress } from './pdf/ops'
import { ApiError, apiFetch } from './api'

export const CHUNK = 9000
export const MAX_DOC_CHARS = 200_000

export type AiTask = 'summarize' | 'translate' | 'markdown' | 'ask'

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

/** Máximo de caracteres de fragmentos por pregunta (el servidor admite 20.000 por petición) */
export const ASK_CHARS = 18_000
const FRAGMENT = 1500

const STOP = new Set(
  ('de la el en y a los las del se que un una por con para es al lo como mas pero sus le ya o fue este ha si porque esta son entre cuando muy sin sobre ' +
    'tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra ' +
    'el tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros cual cuales cuanto cuantos cuantas dice dicen habla trata ' +
    'the of and to in is are what which who how does do this that with for on about where when why from document pdf').split(' '),
)

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Palabras con contenido de una pregunta: sin tildes, mayúsculas ni palabras vacías */
export function keywords(question: string): string[] {
  const words = plain(question).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 && !STOP.has(w))
  return [...new Set(words)]
}

/**
 * Elige los fragmentos del documento más relevantes para la pregunta y los devuelve con la marca «[p. N]» al principio de cada uno.
 * Si todo cabe en `limit` se envía el documento entero; si no, se puntúa cada fragmento por las palabras de la pregunta que contiene.
 */
export function pickFragments(pages: string[], question: string, limit = ASK_CHARS): string {
  const all: { page: number; index: number; text: string; score: number }[] = []
  pages.forEach((pageText, i) => {
    if (!pageText.trim()) return
    for (const part of chunkText(pageText, FRAGMENT)) all.push({ page: i + 1, index: all.length, text: `[p. ${i + 1}] ${part.trim()}`, score: 0 })
  })
  const words = keywords(question)
  for (const f of all) {
    const t = plain(f.text)
    f.score = words.reduce((sum, w) => {
      const n = t.split(w).length - 1
      return sum + (n ? 1 + Math.min(n - 1, 4) * 0.25 : 0)
    }, 0)
  }
  const ranked = [...all].sort((a, b) => b.score - a.score || a.index - b.index)
  const chosen: typeof all = []
  let used = 0
  for (const f of ranked) {
    const cost = f.text.length + 2
    if (used + cost > limit) continue
    chosen.push(f)
    used += cost
  }
  return chosen.sort((a, b) => a.index - b.index).map((f) => f.text).join('\n\n')
}

export interface Turn { role: 'user' | 'assistant'; text: string }

/** Últimos turnos de la conversación como texto plano para dar contexto a la pregunta */
export function formatHistory(turns: Turn[], count = 3): string {
  return turns
    .slice(-count * 2)
    .map((t) => `${t.role === 'user' ? 'Usuario' : 'Asistente'}: ${t.text.replace(/\s+/g, ' ').slice(0, 600)}`)
    .join('\n')
}

/** Responde una pregunta sobre el documento usando solo los fragmentos más relevantes */
export async function askPdf(pages: string[], question: string, history: Turn[] = []) {
  const q = question.trim()
  const fragments = pickFragments(pages, q)
  if (!fragments) throw new Error('No se encontró texto en el PDF. Si es un escaneo, usa primero la herramienta OCR.')
  return aiCall('ask', fragments, { question: q, history: formatHistory(history) })
}
