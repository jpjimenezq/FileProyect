import { useEffect, useState } from 'react'
import { PdfCard } from '../components/FileCards'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { fillForm, listFields } from '../lib/pdf/annotate'
import type { FieldInfo } from '../lib/pdf/annotate'
import { pdfBlob } from '../lib/pdf/ops'

function FormsWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const [fields, setFields] = useState<FieldInfo[]>()
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [flatten, setFlatten] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    listFields(file).then(
      (f) => { setFields(f); setValues(Object.fromEntries(f.map((x) => [x.name, x.value]))) },
      () => setFailed(true),
    )
  }, [file])

  const set = (name: string, v: string | boolean) => setValues((p) => ({ ...p, [name]: v }))

  return (
    <Workspace
      main={
        <div className="flex flex-col gap-6 md:flex-row">
          <PdfCard file={file} showPages onRemove={reset} />
          <div className="flex flex-1 flex-col gap-4">
            {failed && <p className="text-red-600">No se pudo leer el formulario del PDF.</p>}
            {!fields && !failed && <p className="text-gray-500">Buscando campos…</p>}
            {fields?.length === 0 && <p className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">Este PDF no tiene campos de formulario rellenables. Usa «Editar PDF» para escribir texto libre sobre él.</p>}
            {fields?.map((f) => (
              <Field key={f.name} label={f.name}>
                {f.type === 'text' && <input className={inputCls} value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value)} />}
                {f.type === 'checkbox' && <input type="checkbox" className="h-5 w-5" checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} />}
                {(f.type === 'dropdown' || f.type === 'list' || f.type === 'radio') && (
                  <select className={inputCls} value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value)}>
                    <option value="">—</option>
                    {f.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                )}
              </Field>
            ))}
          </div>
        </div>
      }
      side={
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
          <span>Aplanar el formulario (los campos dejan de ser editables)</span>
        </label>
      }
      action={{
        label: 'Guardar formulario',
        disabled: !fields?.length,
        onClick: () => run(async () => [{ name: `${baseName(file)}_rellenado.pdf`, blob: pdfBlob(await fillForm(file, values, flatten)) }]),
      }}
    />
  )
}

export default function Forms() {
  return <ToolFrame id="forms" accept=".pdf">{(ctx) => <FormsWork {...ctx} />}</ToolFrame>
}
