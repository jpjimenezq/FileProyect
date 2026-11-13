import { PdfCard } from '../components/FileCards'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { toSinglePage } from '../lib/pdf/misc'
import { pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

function SingleWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  return (
    <Workspace
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={<p className="text-sm text-ink/65">Pone todas las páginas una debajo de otra en una sola página larga, sin cortes. Útil para leer en pantalla o compartir un documento corto. Admite hasta unas 17 páginas A4.</p>}
      action={{
        label: 'Unir en una página',
        disabled: !numPages,
        onClick: () => run(async (progress) => [{ name: `${baseName(file)}_una-pagina.pdf`, blob: pdfBlob(await toSinglePage(file, progress)) }]),
      }}
    />
  )
}

export default function SinglePage() {
  return <ToolFrame id="single-page" accept=".pdf">{(ctx) => <SingleWork {...ctx} />}</ToolFrame>
}
