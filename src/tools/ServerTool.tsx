import { useState } from 'react'
import { PdfCard } from '../components/FileCards'
import { Eye, EyeOff, FileCode2, FileSpreadsheet, FileText, Presentation, Scale, Sparkles, X, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Segmented } from '../components/Illustrate'
import type { SegOption } from '../components/Illustrate'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Checkbox, Notice, Select } from '../components/ui'
import { fmtSize } from '../lib/files'
import { callTool, useCapabilities } from '../lib/api'

type OptionField =
  | { name: string; label: string; type: 'select'; choices: [string, string][]; initial: string }
  | { name: string; label: string; type: 'password'; required?: boolean; placeholder?: string }
  | { name: string; label: string; type: 'checkbox'; initial: boolean }
  | { name: string; label: string; type: 'segmented'; initial: string; choices: SegOption<string>[] }

interface Config {
  accept: string
  action: string
  /** Ayuda de una línea (≤110 caracteres) */
  hint?: string
  /** Detalle extra, plegado en «Más información» */
  more?: string
  fields?: OptionField[]
  /** Los archivos se suben al servidor; los PDF muestran miniatura, el resto solo su nombre */
  pdfInput?: boolean
}

const OFFICE = (accept: string, action: string, hint?: string, more?: string): Config => ({ accept, action, hint, more })

const CONFIG: Record<string, Config> = {
  compress: {
    accept: '.pdf', action: 'Comprimir PDF', pdfInput: true,
    fields: [{
      name: 'level', label: 'Nivel de compresión', type: 'segmented', initial: 'recommended',
      choices: [
        { value: 'extreme', label: 'Máxima', icon: Zap, desc: 'Archivo mucho más pequeño, con imágenes de menor calidad. Ideal para correo.' },
        { value: 'recommended', label: 'Recomendada', icon: Scale, desc: 'Buen equilibrio entre tamaño y calidad.' },
        { value: 'low', label: 'Calidad alta', icon: Sparkles, desc: 'Reduce poco el tamaño y mantiene la nitidez. Mejor para imprimir.' },
      ],
    }],
  },
  repair: { accept: '.pdf', action: 'Reparar PDF', pdfInput: true, hint: 'Intenta reconstruir un PDF dañado para que vuelva a abrirse.', more: 'Si el archivo está muy dañado, puede que no sea posible recuperarlo.' },
  'pdf-to-pdfa': { accept: '.pdf', action: 'Convertir a PDF/A', pdfInput: true },
  'word-to-pdf': OFFICE('.doc,.docx,.odt,.rtf', 'Convertir a PDF'),
  'ppt-to-pdf': OFFICE('.ppt,.pptx,.odp', 'Convertir a PDF'),
  'excel-to-pdf': OFFICE('.xls,.xlsx,.ods,.csv', 'Convertir a PDF'),
  'html-to-pdf': OFFICE('.html,.htm', 'Convertir a PDF', 'Sube un HTML con las imágenes y estilos incrustados.', 'Las imágenes y estilos externos no se descargan: incrústalos en el archivo antes de subirlo.'),
  'pdf-to-word': { accept: '.pdf', action: 'Convertir a Word', pdfInput: true },
  'pdf-to-ppt': { accept: '.pdf', action: 'Convertir a PowerPoint', pdfInput: true },
  protect: {
    accept: '.pdf', action: 'Proteger PDF', pdfInput: true,
    fields: [
      { name: 'password', label: 'Contraseña', type: 'password', required: true },
      { name: 'confirm', label: 'Repite la contraseña', type: 'password', required: true },
      { name: 'allowPrint', label: 'Permitir imprimir', type: 'checkbox', initial: true },
      { name: 'allowCopy', label: 'Permitir copiar texto', type: 'checkbox', initial: true },
    ],
  },
  unlock: {
    accept: '.pdf', action: 'Desbloquear PDF', pdfInput: true,
    hint: 'Quita la contraseña y las restricciones del PDF.',
    more: 'Úsalo solo con documentos que te pertenezcan o que tengas permiso para modificar.',
    fields: [{ name: 'password', label: 'Contraseña actual (si la tiene)', type: 'password' }],
  },
}

/** Icono y etiqueta según la extensión del archivo */
function fileKind(name: string): { icon: LucideIcon; label: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return { icon: FileSpreadsheet, label: 'Excel' }
  if (['ppt', 'pptx', 'odp'].includes(ext)) return { icon: Presentation, label: 'PowerPoint' }
  if (['html', 'htm'].includes(ext)) return { icon: FileCode2, label: 'HTML' }
  return { icon: FileText, label: 'Word' }
}

function FileInfoCard({ file, onRemove }: { file: File; onRemove: () => void }) {
  const { icon: Icon, label } = fileKind(file.name)
  return (
    <div className="relative flex w-full max-w-xs flex-col items-center gap-2 rounded-2xl border border-line bg-white px-6 py-8 text-center shadow-sm">
      <button onClick={onRemove} aria-label="Quitar archivo" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-ink/55 transition hover:bg-ink/5 hover:text-ink">
        <X size={18} />
      </button>
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Icon size={34} /></span>
      <p className="max-w-full break-words font-semibold">{file.name}</p>
      <p className="text-sm text-ink/60">{label} · {fmtSize(file.size)}</p>
    </div>
  )
}

/** Fuerza de la contraseña: 0 débil, 1 aceptable, 2 fuerte */
function strength(pw: string): 0 | 1 | 2 {
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length
  if (pw.length >= 12 && kinds >= 3) return 2
  if (pw.length >= 8 && kinds >= 2) return 1
  return 0
}
const STRENGTH = [
  { label: 'Débil', bar: 'bg-red-500', text: 'text-red-600' },
  { label: 'Aceptable', bar: 'bg-amber-400', text: 'text-amber-700' },
  { label: 'Fuerte', bar: 'bg-brand', text: 'text-brand' },
] as const

function PasswordField({ label, value, onChange, meter, hint }: { label: string; value: string; onChange: (v: string) => void; meter?: boolean; hint?: string }) {
  const [shown, setShown] = useState(false)
  const st = STRENGTH[strength(value)]
  return (
    <Field label={label} hint={hint}>
      <span className="relative block">
        <input type={shown ? 'text' : 'password'} autoComplete="new-password" className={`${inputCls} w-full pr-11`} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={shown}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink/55 transition hover:bg-ink/5 hover:text-brand">
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {meter && value && (
        <span className="flex items-center gap-2" aria-live="polite">
          <span className="flex flex-1 gap-1">
            {[0, 1, 2].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength(value) ? st.bar : 'bg-line'}`} />)}
          </span>
          <span className={`text-xs font-semibold ${st.text}`}>{st.label}</span>
        </span>
      )}
    </Field>
  )
}

function ServerWork({ id, files, run, reset, retry }: FrameCtx & { id: string; retry: () => void }) {
  const cfg = CONFIG[id]
  const file = files[0]
  const caps = useCapabilities()
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries((cfg.fields ?? []).map((f) => [f.name, f.type === 'password' ? '' : f.initial])),
  )
  const set = (name: string, v: string | boolean) => setValues((p) => ({ ...p, [name]: v }))

  const offline = caps === 'offline'
  const unavailable = offline ? 'No hay conexión con el servidor.' : caps && !caps.tools[id] ? 'Esta herramienta no está disponible ahora mismo.' : undefined
  const missing = (cfg.fields ?? []).some((f) => f.type === 'password' && f.required && !values[f.name])
  const mismatch = id === 'protect' && values.password !== values.confirm

  return (
    <Workspace
      main={
        <div className="flex flex-col items-center gap-4">
          {cfg.pdfInput ? <PdfCard file={file} showPages onRemove={reset} /> : <FileInfoCard file={file} onRemove={reset} />}
          {unavailable && (
            <Notice kind="warn" className="w-full max-w-md" action={offline ? { label: 'Reintentar', onClick: retry } : undefined}>
              {unavailable}{offline && ' Comprueba tu conexión.'}
            </Notice>
          )}
        </div>
      }
      side={
        <>
          {cfg.fields?.map((f) => {
            if (f.type === 'checkbox') {
              return <Checkbox key={f.name} label={f.label} checked={Boolean(values[f.name])} onChange={(v) => set(f.name, v)} />
            }
            if (f.type === 'segmented') {
              return (
                <Field key={f.name} label={f.label}>
                  <Segmented value={String(values[f.name])} onChange={(v) => set(f.name, v)} options={f.choices} label={f.label} />
                </Field>
              )
            }
            if (f.type === 'select') {
              return (
                <Select key={f.name} label={f.label} value={String(values[f.name])} onChange={(e) => set(f.name, e.target.value)}>
                  {f.choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              )
            }
            return <PasswordField key={f.name} label={f.label} value={String(values[f.name])} onChange={(v) => set(f.name, v)} meter={id === 'protect' && f.name === 'password'} />
          })}
          {mismatch && values.confirm !== '' && <p role="alert" className="text-xs text-red-600">Las contraseñas no coinciden.</p>}
          {cfg.hint && <p className="text-xs leading-snug text-ink/60">{cfg.hint}</p>}
          {cfg.more && (
            <details className="text-xs text-ink/60">
              <summary className="cursor-pointer font-semibold text-brand">Más información</summary>
              <p className="mt-1.5 leading-snug">{cfg.more}</p>
            </details>
          )}
        </>
      }
      action={{
        label: cfg.action,
        disabled: !!unavailable || caps === null || missing || mismatch,
        onClick: () => run(async (progress) => {
          const { confirm: _confirm, ...options } = values
          void _confirm
          return [await callTool(id, file, options, progress)]
        }),
      }}
    />
  )
}

/** Al reintentar se vuelve a montar el formulario, que así vuelve a pedir las capacidades al servidor */
function ServerGate(props: FrameCtx & { id: string }) {
  const [attempt, setAttempt] = useState(0)
  return <ServerWork key={attempt} {...props} retry={() => setAttempt((n) => n + 1)} />
}

export function ServerTool({ id }: { id: string }) {
  const cfg = CONFIG[id]
  return <ToolFrame id={id} accept={cfg.accept}>{(ctx) => <ServerGate {...ctx} id={id} />}</ToolFrame>
}
