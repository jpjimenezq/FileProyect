import { useCallback, useEffect, useRef, useState } from 'react'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { Download, FilePlus2, Paperclip, Trash2 } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName, fmtSize } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import { addAttachments, listAttachments, removeAttachments } from '../lib/pdf/structure'
import type { Attachment } from '../lib/pdf/structure'

function AttachmentsWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const [list, setList] = useState<Attachment[]>()
  const [toAdd, setToAdd] = useState<File[]>([])
  const input = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => { listAttachments(file).then(setList, () => setList([])) }, [file])
  useEffect(refresh, [refresh])

  const downloadAll = async () => {
    if (!list) return
    const zip = new JSZip()
    list.forEach((a) => zip.file(a.name, a.bytes))
    saveAs(await zip.generateAsync({ type: 'blob' }), `${baseName(file)}_adjuntos.zip`)
  }

  return (
    <Workspace
      main={
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
          <PdfCard file={file} showPages onRemove={reset} />
          <div className="w-full max-w-md">
            <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold"><Paperclip size={18} /> Archivos dentro del PDF {list && <span className="text-sm font-medium text-ink/45">{list.length}</span>}</h3>
            {!list ? <p className="text-sm text-ink/55">Buscando…</p> : list.length === 0 ? (
              <p className="rounded-2xl bg-paper p-4 text-sm text-ink/60">Este PDF no tiene archivos adjuntos. Puedes añadirlos con el botón de la derecha.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.map((a) => (
                  <li key={a.name} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                    <Paperclip size={16} className="shrink-0 text-ink/40" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold" title={a.name}>{a.name}</span><span className="text-xs text-ink/50">{fmtSize(a.size)}</span></span>
                    <button onClick={() => saveAs(new Blob([a.bytes as BlobPart]), a.name)} aria-label={`Descargar ${a.name}`} className="rounded-full p-2 text-brand hover:bg-brand/10"><Download size={16} /></button>
                  </li>
                ))}
              </ul>
            )}
            {list && list.length > 1 && <button onClick={downloadAll} className="mt-3 text-sm font-semibold text-brand hover:underline">Descargar todos en un ZIP</button>}
          </div>
        </div>
      }
      side={
        <>
          <input ref={input} type="file" multiple hidden onChange={(e) => { setToAdd((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
          <button onClick={() => input.current?.click()} className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/25 py-4 text-sm font-semibold hover:border-brand hover:text-brand"><FilePlus2 size={18} /> Elegir archivos para añadir</button>
          {toAdd.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm">
              {toAdd.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-paper px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
                  <span className="text-xs text-ink/50">{fmtSize(f.size)}</span>
                  <button onClick={() => setToAdd(toAdd.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`} className="text-ink/40 hover:text-brand"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {list && list.length > 0 && (
            <button
              onClick={() => run(async () => [{ name: `${baseName(file)}_sin-adjuntos.pdf`, blob: pdfBlob(await removeAttachments(file)), note: `Se quitaron ${list.length} archivo(s) adjunto(s).` }])}
              className="rounded-xl border border-red-300 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              Quitar todos los adjuntos
            </button>
          )}
        </>
      }
      action={{
        label: 'Añadir al PDF',
        disabled: toAdd.length === 0,
        onClick: () => run(async () => [{ name: `${baseName(file)}_con-adjuntos.pdf`, blob: pdfBlob(await addAttachments(file, toAdd)), note: `Se añadieron ${toAdd.length} archivo(s).` }]),
      }}
    />
  )
}

export default function Attachments() {
  return <ToolFrame id="attachments" accept=".pdf">{(ctx) => <AttachmentsWork {...ctx} />}</ToolFrame>
}
