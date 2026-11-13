import { useState } from 'react'
import { PdfCard } from '../components/FileCards'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { removeAnnotations } from '../lib/pdf/clean'
import { pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

function AnnotationsWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [keepLinks, setKeepLinks] = useState(true)

  return (
    <Workspace
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={
        <>
          <p className="text-sm text-ink/65">Quita comentarios, resaltados, notas y sellos añadidos con otros programas.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={keepLinks} onChange={(e) => setKeepLinks(e.target.checked)} />
            Conservar los enlaces
          </label>
        </>
      }
      action={{
        label: 'Quitar anotaciones',
        disabled: !numPages,
        onClick: () => run(async () => {
          const { bytes, removed } = await removeAnnotations(file, keepLinks)
          if (!removed) throw new Error('Este PDF no tiene anotaciones que quitar.')
          return [{ name: `${baseName(file)}_sin-anotaciones.pdf`, blob: pdfBlob(bytes), note: `Se quitaron ${removed} anotación(es).` }]
        }),
      }}
    />
  )
}

export default function RemoveAnnotations() {
  return <ToolFrame id="remove-annots" accept=".pdf">{(ctx) => <AnnotationsWork {...ctx} />}</ToolFrame>
}
