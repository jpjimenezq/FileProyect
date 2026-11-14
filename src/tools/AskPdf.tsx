import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Loader2, SendHorizontal } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { ToolFrame } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Button, Notice } from '../components/ui'
import { ApiError } from '../lib/api'
import { askPdf } from '../lib/ai'
import type { Turn } from '../lib/ai'
import { pdfPageTexts } from '../lib/pdf/markdown'
import { loadPdf } from '../lib/pdf/render'
import { AI_NOTICE, useAiBlocker } from './AiNotice'

const SUGGESTIONS = ['Resume este documento en pocas frases', '¿Cuáles son los puntos más importantes?', '¿Qué fechas o cifras se mencionan?', '¿Quiénes son las personas u organizaciones citadas?']
const MAX_QUESTION = 500
const CITE = /\((?:p|pp|pág|págs)\.\s*[\d\s,;–-]+\)/gi

/** Muestra una respuesta convirtiendo las citas «(p. 3)» en chips */
function Answer({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(CITE)) {
    const at = m.index ?? 0
    out.push(text.slice(last, at))
    out.push(
      <span key={at} className="mx-0.5 inline-block whitespace-nowrap rounded-full bg-brand/10 px-2 py-0.5 align-baseline text-xs font-semibold text-brand">
        {m[0].slice(1, -1)}
      </span>,
    )
    last = at + m[0].length
  }
  out.push(text.slice(last))
  return <p className="whitespace-pre-wrap break-words">{out}</p>
}

function AskWork({ files, reset }: FrameCtx) {
  const file = files[0]
  const blocker = useAiBlocker()
  const [pages, setPages] = useState<string[]>()
  const [loadError, setLoadError] = useState<string>()
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<{ message: string; code?: string; question: string }>()
  const [copied, setCopied] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setPages(undefined)
    setLoadError(undefined)
    loadPdf(file)
      .then((pdf) => pdfPageTexts(pdf))
      .then((p) => {
        if (!alive) return
        if (p.join('').trim().length < 20) setLoadError('No se encontró texto en el PDF. Si es un escaneo, usa primero la herramienta OCR.')
        else setPages(p)
      })
      .catch(() => alive && setLoadError('No se pudo leer el PDF.'))
    return () => { alive = false }
  }, [file])

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [turns, thinking, error])

  const ready = !!pages && !blocker
  const send = async (raw: string, base: Turn[] = turns) => {
    const q = raw.trim().slice(0, MAX_QUESTION)
    if (!q || !pages || blocker || thinking) return
    setError(undefined)
    setDraft('')
    setTurns([...base, { role: 'user', text: q }])
    setThinking(true)
    try {
      const answer = await askPdf(pages, q, base)
      setTurns((t) => [...t, { role: 'assistant', text: answer }])
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : 'No se pudo obtener la respuesta.', code: e instanceof ApiError ? e.code : undefined, question: q })
    } finally {
      setThinking(false)
    }
  }

  const retry = () => {
    if (!error) return
    // la pregunta fallida es el último turno: se vuelve a enviar con el historial anterior
    send(error.question, turns.slice(0, -1))
  }

  const copy = async () => {
    const text = turns.map((t) => `${t.role === 'user' ? 'Tú' : 'Respuesta'}: ${t.text}`).join('\n\n')
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* sin permiso de portapapeles */ }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PdfCard file={file} showPages onRemove={reset} />
      {blocker && <Notice kind="warn">{blocker}</Notice>}
      {loadError && <Notice kind="error">{loadError}</Notice>}

      <div className="flex flex-col rounded-3xl border border-line bg-white shadow-sm">
        <div className="flex max-h-[55vh] min-h-52 flex-col gap-3 overflow-y-auto p-4 md:p-5" aria-live="polite">
          {turns.length === 0 && (
            <div className="my-auto flex flex-col items-center gap-3 py-4 text-center">
              <p className="font-medium">{ready || (!pages && !blocker && !loadError) ? 'Pregunta lo que quieras sobre tu documento' : 'No se puede preguntar todavía'}</p>
              {!pages && !loadError && <p className="flex items-center gap-2 text-sm text-ink/60"><Loader2 size={14} className="animate-spin" /> Leyendo el documento…</p>}
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" disabled={!ready} onClick={() => send(s)} className="min-h-10 rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm text-ink/80 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) =>
            t.role === 'user' ? (
              <div key={i} className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white">{t.text}</div>
            ) : (
              <div key={i} className="max-w-[92%] self-start rounded-2xl rounded-bl-md bg-paper px-4 py-2.5 text-sm leading-relaxed"><Answer text={t.text} /></div>
            ),
          )}
          {thinking && (
            <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-md bg-paper px-4 py-2.5 text-sm text-ink/60">
              <Loader2 size={14} className="animate-spin" /> Pensando…
            </div>
          )}
          {error && (
            <Notice kind="error" action={{ label: 'Reintentar', onClick: retry }}>
              <p>{error.message}</p>
              {error.code === 'login' && <Link to="/cuenta?registro=1" className="mt-1 inline-block font-semibold underline">Crear cuenta gratis</Link>}
              {error.code === 'quota' && <Link to="/precios" className="mt-1 inline-block font-semibold underline">Ver planes</Link>}
            </Notice>
          )}
          <div ref={end} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(draft) }}
          className="sticky bottom-0 z-10 flex items-end gap-2 rounded-b-3xl border-t border-line bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:p-4"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft) }
            }}
            rows={1}
            maxLength={MAX_QUESTION}
            disabled={!ready}
            aria-label="Tu pregunta"
            placeholder={ready ? 'Escribe tu pregunta…' : 'Preguntar no está disponible'}
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition [field-sizing:content] focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
          />
          <Button type="submit" variant="primary" disabled={!ready || thinking || !draft.trim()} aria-label="Enviar pregunta" className="h-11 w-11 shrink-0 !p-0">
            <SendHorizontal size={18} />
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink/55">Intro para enviar · Mayús + Intro para un salto de línea</p>
        {turns.length > 0 && (
          <Button size="sm" icon={copied ? Check : Copy} onClick={copy}>{copied ? 'Copiada' : 'Copiar conversación'}</Button>
        )}
      </div>
    </div>
  )
}

export default function AskPdf() {
  return <ToolFrame id="ask-pdf" accept=".pdf" notice={AI_NOTICE}>{(ctx) => <AskWork {...ctx} />}</ToolFrame>
}
