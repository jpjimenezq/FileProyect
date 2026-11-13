import { useEffect, useState } from 'react'
import { AddMore } from '../components/Dropzone'
import { PdfCard } from '../components/FileCards'
import { SortableGrid } from '../components/SortableGrid'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Notice } from '../components/ui'
import { loadPdf } from '../lib/pdf/render'
import { mergePdfs, pdfBlob } from '../lib/pdf/ops'

const pageCounts = new WeakMap<File, number>()

/** Total de páginas de todos los archivos (undefined mientras se cuentan) */
function useTotalPages(files: File[]) {
  const [total, setTotal] = useState<number>()
  useEffect(() => {
    let alive = true
    setTotal(undefined)
    Promise.all(files.map(async (f) => {
      const known = pageCounts.get(f)
      if (known !== undefined) return known
      const doc = await loadPdf(f)
      pageCounts.set(f, doc.numPages)
      return doc.numPages
    })).then((n) => alive && setTotal(n.reduce((a, b) => a + b, 0)), () => alive && setTotal(undefined))
    return () => { alive = false }
  }, [files])
  return total
}

function MergeWork({ files, setFiles, addFiles, run }: FrameCtx) {
  const pages = useTotalPages(files)
  return (
    <Workspace
      main={
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ink/60">Arrastra los archivos para cambiar el orden.</p>
            <AddMore accept=".pdf" onFiles={addFiles} />
          </div>
          <SortableGrid
            items={files}
            keyOf={(f, i) => `${f.name}-${f.size}-${i}`}
            onChange={setFiles}
            render={(f, i) => (
              <div className="relative">
                <span className="absolute -left-1 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white shadow">{i + 1}</span>
                <PdfCard file={f} showPages onRemove={() => setFiles(files.filter((x) => x !== f))} />
              </div>
            )}
          />
        </>
      }
      side={
        <>
          <div>
            <p className="font-display text-2xl font-bold">{files.length} {files.length === 1 ? 'archivo' : 'archivos'}</p>
            <p className="text-sm text-ink/60">{pages === undefined ? 'Contando páginas…' : `${pages} ${pages === 1 ? 'página' : 'páginas'} en total`}</p>
          </div>
          {files.length < 2 && <Notice kind="info">Añade al menos otro PDF para poder unirlos.</Notice>}
        </>
      }
      action={{
        label: 'Unir PDF',
        disabled: files.length < 2,
        onClick: () => run(async (progress) => [{ name: 'unido.pdf', blob: pdfBlob(await mergePdfs(files, progress)) }]),
      }}
    />
  )
}

export default function Merge() {
  return <ToolFrame id="merge" accept=".pdf" multiple>{(ctx) => <MergeWork {...ctx} />}</ToolFrame>
}
