import { PdfCard } from '../components/FileCards'
import { PageThumb } from '../components/PageThumb'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Notice } from '../components/ui'
import { baseName } from '../lib/files'
import { toSinglePage } from '../lib/pdf/misc'
import { pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

const SHOWN = 6
const LIMIT = 17

function SingleWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { pdf, numPages } = usePdf(file)
  const pages = Math.min(numPages, SHOWN)
  return (
    <Workspace
      main={
        <div className="flex flex-col items-center gap-6">
          <PdfCard file={file} showPages onRemove={reset} />
          {pdf && numPages > 1 && (
            <div className="flex w-full max-w-xl flex-col items-center gap-2">
              <p className="text-sm font-semibold">Así quedarán, una debajo de otra</p>
              <div className="thin-scroll flex max-w-full gap-2 overflow-x-auto p-1">
                {Array.from({ length: pages }, (_, i) => <PageThumb key={i} pdf={pdf} pageNum={i + 1} width={72} zoom={false} />)}
                {numPages > SHOWN && <span className="flex w-16 shrink-0 items-center justify-center text-sm text-ink/60">+{numPages - SHOWN} más</span>}
              </div>
            </div>
          )}
        </div>
      }
      side={
        <>
          <p className="text-sm text-ink/65">Junta todas las páginas en una sola página larga, sin cortes.</p>
          {numPages > LIMIT && <Notice kind="warn">Con más de {LIMIT} páginas A4 puede no caber.</Notice>}
        </>
      }
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
