import { useEffect, useState } from 'react'
import { PdfCard } from '../components/FileCards'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { readMetadata, writeMetadata } from '../lib/pdf/clean'
import type { Metadata } from '../lib/pdf/clean'
import { pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

const fmt = (d?: Date) => (d ? d.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

function MetadataWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [meta, setMeta] = useState<Metadata>()
  const [form, setForm] = useState({ title: '', author: '', subject: '', keywords: '' })
  const [clear, setClear] = useState(false)

  useEffect(() => {
    readMetadata(file).then((m) => {
      setMeta(m)
      setForm({ title: m.title, author: m.author, subject: m.subject, keywords: m.keywords })
    })
  }, [file])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Workspace
      main={
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
          <PdfCard file={file} showPages onRemove={reset} />
          <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl bg-paper p-5 text-sm">
            <dt className="font-semibold">Páginas</dt><dd>{numPages || '…'}</dd>
            <dt className="font-semibold">Creado con</dt><dd className="break-words">{meta?.creator || '—'}</dd>
            <dt className="font-semibold">Generado por</dt><dd className="break-words">{meta?.producer || '—'}</dd>
            <dt className="font-semibold">Creación</dt><dd>{fmt(meta?.created)}</dd>
            <dt className="font-semibold">Última edición</dt><dd>{fmt(meta?.modified)}</dd>
          </dl>
        </div>
      }
      side={
        <>
          <fieldset disabled={clear} className="flex flex-col gap-4 disabled:opacity-40">
            <Field label="Título"><input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
            <Field label="Autor"><input className={inputCls} value={form.author} onChange={(e) => set('author', e.target.value)} /></Field>
            <Field label="Asunto"><input className={inputCls} value={form.subject} onChange={(e) => set('subject', e.target.value)} /></Field>
            <Field label="Palabras clave"><input className={inputCls} placeholder="separadas por comas" value={form.keywords} onChange={(e) => set('keywords', e.target.value)} /></Field>
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={clear} onChange={(e) => setClear(e.target.checked)} />
            <span>Quitar todos los metadatos<span className="block text-xs text-ink/55">Borra autor, título, programa y fechas del archivo.</span></span>
          </label>
        </>
      }
      action={{
        label: clear ? 'Quitar metadatos' : 'Guardar metadatos',
        disabled: !meta,
        onClick: () => run(async () => [{ name: `${baseName(file)}_${clear ? 'sin-metadatos' : 'editado'}.pdf`, blob: pdfBlob(await writeMetadata(file, form, clear)) }]),
      }}
    />
  )
}

export default function MetadataTool() {
  return <ToolFrame id="metadata" accept=".pdf">{(ctx) => <MetadataWork {...ctx} />}</ToolFrame>
}
