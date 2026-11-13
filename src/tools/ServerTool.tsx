import { useState } from 'react'
import { PdfCard } from '../components/FileCards'
import { Scale, Sparkles, Zap } from 'lucide-react'
import { Segmented } from '../components/Illustrate'
import type { SegOption } from '../components/Illustrate'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
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
  hint?: string
  fields?: OptionField[]
  /** Los archivos se suben al servidor; los PDF muestran miniatura, el resto solo su nombre */
  pdfInput?: boolean
}

const OFFICE = (accept: string, action: string, hint?: string): Config => ({ accept, action, hint })

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
  repair: { accept: '.pdf', action: 'Reparar PDF', pdfInput: true, hint: 'Intenta reconstruir la estructura del PDF. Si está muy dañado puede no ser posible.' },
  'pdf-to-pdfa': { accept: '.pdf', action: 'Convertir a PDF/A', pdfInput: true },
  'word-to-pdf': OFFICE('.doc,.docx,.odt,.rtf', 'Convertir a PDF'),
  'ppt-to-pdf': OFFICE('.ppt,.pptx,.odp', 'Convertir a PDF'),
  'excel-to-pdf': OFFICE('.xls,.xlsx,.ods,.csv', 'Convertir a PDF'),
  'html-to-pdf': OFFICE('.html,.htm', 'Convertir a PDF', 'Sube un archivo HTML. Las imágenes y estilos externos no se descargan: incrústalos en el archivo.'),
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
    hint: 'Quita la contraseña y las restricciones. Solo debes usarlo con documentos que te pertenezcan o tengas permiso para modificar.',
    fields: [{ name: 'password', label: 'Contraseña actual (si la tiene)', type: 'password' }],
  },
}

function ServerWork({ id, files, run, reset }: FrameCtx & { id: string }) {
  const cfg = CONFIG[id]
  const file = files[0]
  const caps = useCapabilities()
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries((cfg.fields ?? []).map((f) => [f.name, f.type === 'password' ? '' : f.initial])),
  )
  const set = (name: string, v: string | boolean) => setValues((p) => ({ ...p, [name]: v }))

  const unavailable = caps === 'offline' ? 'No hay conexión. Inténtalo de nuevo en unos segundos.' : caps && !caps.tools[id] ? 'Esta herramienta no está disponible ahora mismo.' : undefined
  const missing = (cfg.fields ?? []).some((f) => f.type === 'password' && f.required && !values[f.name])
  const mismatch = id === 'protect' && values.password !== values.confirm

  return (
    <Workspace
      main={
        <div className="flex flex-col items-center gap-4">
          {cfg.pdfInput ? <PdfCard file={file} showPages onRemove={reset} /> : (
            <div className="relative rounded-xl bg-white px-8 py-10 text-center shadow">
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-gray-500">{fmtSize(file.size)}</p>
              <button onClick={reset} className="mt-3 text-sm text-brand hover:underline">Quitar</button>
            </div>
          )}
          {unavailable && <p role="alert" className="max-w-md rounded-lg bg-yellow-50 p-3 text-center text-sm text-yellow-800">{unavailable}</p>}
        </div>
      }
      side={
        <>
          {cfg.fields?.map((f) => {
            if (f.type === 'checkbox') {
              return <label key={f.name} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} /> {f.label}</label>
            }
            if (f.type === 'segmented') {
              return (
                <Field key={f.name} label={f.label}>
                  <Segmented value={String(values[f.name])} onChange={(v) => set(f.name, v)} options={f.choices} label={f.label} />
                </Field>
              )
            }
            return (
              <Field key={f.name} label={f.label}>
                {f.type === 'select'
                  ? <select className={inputCls} value={String(values[f.name])} onChange={(e) => set(f.name, e.target.value)}>{f.choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  : <input type="password" autoComplete="new-password" className={inputCls} value={String(values[f.name])} onChange={(e) => set(f.name, e.target.value)} />}
              </Field>
            )
          })}
          {mismatch && values.confirm !== '' && <p className="text-xs text-red-600">Las contraseñas no coinciden.</p>}
          {cfg.hint && <p className="text-xs text-gray-500">{cfg.hint}</p>}
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

export function ServerTool({ id }: { id: string }) {
  const cfg = CONFIG[id]
  return <ToolFrame id={id} accept={cfg.accept}>{(ctx) => <ServerWork {...ctx} id={id} />}</ToolFrame>
}
