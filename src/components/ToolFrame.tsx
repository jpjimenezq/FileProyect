import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { ArrowRight, CheckCircle2, Download, Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import { Dropzone } from './Dropzone'
import { ResultPreview } from './ResultPreview'
import { ApiError } from '../lib/api'
import { peekHandoff } from '../lib/handoff'
import { matchesAccept } from '../lib/files'
import { categoryOf, toolById } from '../tools/catalog'
import { useRangeFill } from './ui/useRangeFill'
import { Notice } from './ui/Notice'

export interface Output {
  name: string
  blob: Blob
  /** Aviso opcional que se muestra junto al resultado */
  note?: string
  /** Texto del resultado para leerlo en pantalla (p. ej. un resumen) */
  preview?: string
  /** Hojas de cálculo del resultado, para verlas como tablas antes de descargar */
  sheets?: { name: string; rows: string[][] }[]
}

export interface FrameCtx {
  files: File[]
  setFiles: (files: File[]) => void
  addFiles: (files: File[]) => void
  run: (job: (progress: (fraction: number) => void) => Promise<Output[]>) => void
  reset: () => void
}

interface Props {
  id: string
  accept: string
  multiple?: boolean
  children: (ctx: FrameCtx) => ReactNode
  /** Contenido extra bajo la zona de subida (p. ej. el botón de cámara) */
  emptyExtra?: (ctx: FrameCtx) => ReactNode
  /** Aviso de privacidad propio; sustituye al estándar de la herramienta */
  notice?: string
}

type Stage = 'edit' | 'processing' | 'done'

export function ToolFrame({ id, accept, multiple, children, emptyExtra, notice }: Props) {
  const tool = toolById(id)
  const Icon = tool.icon
  const [files, setFiles] = useState<File[]>(() => {
    const f = peekHandoff(tool.path)
    return f && matchesAccept(f, accept) ? [f] : []
  })
  const [stage, setStage] = useState<Stage>('edit')
  const [progress, setProgress] = useState(0)
  const [outputs, setOutputs] = useState<Output[]>([])
  const [error, setError] = useState<{ message: string; code?: string }>()

  const reset = () => { setFiles([]); setOutputs([]); setStage('edit'); setError(undefined) }

  const run: FrameCtx['run'] = async (job) => {
    setError(undefined)
    setProgress(0)
    setStage('processing')
    try {
      const result = await job(setProgress)
      setOutputs(result)
      setStage('done')
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : 'Ocurrió un error al procesar el archivo.', code: e instanceof ApiError ? e.code : undefined })
      setStage('edit')
    }
  }

  const download = async () => {
    if (outputs.length === 1) return saveAs(outputs[0].blob, outputs[0].name)
    const zip = new JSZip()
    outputs.forEach((o) => zip.file(o.name, o.blob))
    saveAs(await zip.generateAsync({ type: 'blob' }), `${tool.id}.zip`)
  }

  // al empezar a procesar, al terminar y al volver a empezar, se lleva la vista al principio de la herramienta:
  // en el móvil el botón está muy abajo y el resultado aparece arriba
  const top = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [stage])

  useRangeFill(top) // relleno de color en todos los deslizadores de la herramienta

  const ctx: FrameCtx = { files, setFiles, addFiles: (f) => setFiles((prev) => [...prev, ...f]), run, reset }

  return (
    <div ref={top} className="mx-auto max-w-6xl scroll-mt-16 px-4 py-8">
      <div className="mb-6 md:mb-8">
        <p className="mb-3 text-sm text-ink/60">
          <Link to="/" className="hover:text-brand">Herramientas</Link> / {categoryOf(tool).name}
        </p>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 md:grid-rows-[auto_auto]">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md md:row-span-2 md:h-14 md:w-14 md:rounded-2xl" style={{ background: categoryOf(tool).color }}>
            <Icon className="h-5 w-5 md:h-7 md:w-7" />
          </span>
          <h1 className="min-w-0 text-2xl font-bold md:self-end md:text-4xl">{tool.name}</h1>
          <p className="col-span-2 text-sm text-ink/70 md:col-span-1 md:self-start md:text-base">{tool.description}</p>
        </div>
      </div>

      {error && (
        <Notice kind="error" onClose={() => setError(undefined)} className="mb-6">
          <p>{error.message}</p>
          {(error.code === 'login' || error.code === 'quota') && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {error.code === 'login' && <Link to="/cuenta?registro=1" className="rounded-xl bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark">Crear cuenta gratis</Link>}
              <Link to="/precios" className="font-semibold text-brand hover:underline">Ver planes</Link>
            </div>
          )}
        </Notice>
      )}

      {stage === 'processing' && (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-line bg-white py-14 shadow-sm">
          <Loader2 className="animate-spin text-brand" size={40} />
          <p className="font-medium">Procesando… <span className="tabular-nums text-ink/60">{Math.round(progress * 100)} %</span></p>
          <div className="h-2 w-64 max-w-[80%] overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 rounded-3xl border border-line bg-white px-6 py-10 text-center shadow-sm">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-lime"><CheckCircle2 size={34} /></span>
          <h2 className="text-3xl font-bold">¡Listo!</h2>
          {outputs.length > 1 && <p className="text-ink/70">{outputs.length} archivos generados (se descargan en un ZIP).</p>}
          {outputs.length === 1 && <p className="text-ink/70">{outputs[0].name}</p>}
          {outputs[0]?.note && <p className="rounded-xl bg-paper px-4 py-3 text-sm">{outputs[0].note}</p>}
          <ResultPreview outputs={outputs} />
          {outputs[0]?.sheets && <SheetsPreview sheets={outputs[0].sheets} />}
          {outputs[0]?.preview && (
            <div className="w-full rounded-2xl border border-line bg-paper p-4 text-left">
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm">{outputs[0].preview}</pre>
              <button onClick={() => navigator.clipboard?.writeText(outputs[0].preview!)} className="mt-3 text-sm font-medium text-brand hover:underline">Copiar texto</button>
            </div>
          )}
          <button onClick={download} className="flex items-center gap-2 rounded-2xl bg-brand px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-brand/30 hover:bg-brand-dark">
            <Download /> {outputs.length > 1 ? 'Descargar ZIP' : 'Descargar'}
          </button>
          <button onClick={reset} className="flex items-center gap-2 text-sm text-ink/60 hover:text-brand">
            <RotateCcw size={14} /> Empezar de nuevo
          </button>
        </div>
      )}

      {stage === 'edit' && (files.length === 0 ? (
        <>
          <Dropzone accept={accept} multiple={multiple} label={multiple ? 'Elegir archivos' : 'Elegir archivo'} onFiles={setFiles} onError={(m) => setError({ message: m })} />
          {emptyExtra?.(ctx)}
        </>
      ) : (
        children(ctx)
      ))}

      {stage !== 'processing' && (
        <p className="mt-10 flex items-center justify-center gap-2 text-sm text-ink/60">
          <ShieldCheck size={16} /> {notice ?? 'Tus archivos no se conservan: se procesan y se descartan al terminar.'}
        </p>
      )}
    </div>
  )
}

export function Workspace({ main, side, action }: { main: ReactNode; side?: ReactNode; action: { label: string; onClick: () => void; disabled?: boolean } }) {
  return (
    // en < lg el botón vive en una barra fija inferior (solo mientras existe el Workspace): el contenido deja hueco debajo
    <div className="grid gap-6 max-lg:pb-24 lg:grid-cols-[1fr_21rem]">
      <div className="dots min-w-0 rounded-3xl border border-line bg-white p-4 md:p-6">{main}</div>
      <aside className="flex h-fit min-w-0 flex-col gap-5 rounded-3xl border border-line bg-white p-4 shadow-sm sm:p-5 max-lg:[&:not(:has(input,select,textarea,summary,a,[role=radio],button:not([data-ws-action])))]:gap-0 max-lg:[&:not(:has(input,select,textarea,summary,a,[role=radio],button:not([data-ws-action])))]:border-0 max-lg:[&:not(:has(input,select,textarea,summary,a,[role=radio],button:not([data-ws-action])))]:bg-transparent max-lg:[&:not(:has(input,select,textarea,summary,a,[role=radio],button:not([data-ws-action])))]:p-0 max-lg:[&:not(:has(input,select,textarea,summary,a,[role=radio],button:not([data-ws-action])))]:shadow-none lg:sticky lg:top-24">
        {side}
        <div className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:border-line max-lg:bg-white max-lg:px-4 max-lg:pt-3 max-lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-lg:shadow-[0_-6px_20px_rgba(22,21,43,0.10)] lg:contents">
          <button
            data-ws-action
            onClick={action.onClick}
            disabled={action.disabled}
            className="mx-auto flex w-full max-w-lg items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-3.5 text-lg font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none lg:max-w-none lg:py-4"
          >
            {action.label} <ArrowRight size={20} />
          </button>
        </div>
      </aside>
    </div>
  )
}

export function Field({ label, children, hint, value }: { label: string; children: ReactNode; /** Ayuda de una línea bajo el control */ hint?: string; /** Valor actual, a la derecha de la etiqueta */ value?: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold">
      {value === undefined ? label : (
        <span className="flex items-baseline justify-between gap-2">
          <span>{label}</span>
          <span className="font-normal tabular-nums text-ink/60">{value}</span>
        </span>
      )}
      {children}
      {hint && <span className="text-xs font-normal leading-snug text-ink/55">{hint}</span>}
    </label>
  )
}

/** Aspecto de campos de texto/selects: a juego con los estilos globales de index.css */
export const inputCls = 'rounded-xl border border-line bg-paper px-3 py-2 font-normal transition hover:border-ink/30 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15'

const MAX_ROWS = 12
const MAX_COLS = 10

/** Las primeras filas de cada hoja como una tabla real (con barra de desplazamiento si no cabe) */
function SheetsPreview({ sheets }: { sheets: { name: string; rows: string[][] }[] }) {
  const shown = sheets.filter((s) => s.rows.length).slice(0, 3)
  if (!shown.length) return null
  return (
    <div className="w-full space-y-4 text-left">
      {shown.map((s) => {
        const cols = Math.min(MAX_COLS, Math.max(...s.rows.map((r) => r.length)))
        return (
          <figure key={s.name} className="overflow-hidden rounded-2xl border border-line bg-white">
            <figcaption className="border-b border-line bg-paper px-4 py-2 text-sm font-semibold">{s.name} <span className="font-normal text-ink/50">· {s.rows.length} filas</span></figcaption>
            <div className="thin-scroll max-h-72 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {s.rows.slice(0, MAX_ROWS).map((r, i) => (
                    <tr key={i} className={i === 0 ? 'bg-paper/60 font-semibold' : ''}>
                      {Array.from({ length: cols }, (_, c) => <td key={c} className="max-w-[16rem] truncate border border-line/70 px-2.5 py-1.5" title={r[c]}>{r[c] ?? ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(s.rows.length > MAX_ROWS || Math.max(...s.rows.map((r) => r.length)) > MAX_COLS) && <p className="border-t border-line px-4 py-1.5 text-xs text-ink/50">Vista parcial: el archivo trae todo.</p>}
          </figure>
        )
      })}
    </div>
  )
}
