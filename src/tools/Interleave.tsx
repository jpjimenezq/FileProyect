import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { AddMore } from '../components/Dropzone'
import { PdfCard } from '../components/FileCards'
import { PageThumb } from '../components/PageThumb'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Button, Notice, Switch } from '../components/ui'
import { baseName } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import { interleaveOrder, interleavePdfs } from '../lib/pdf/pages'
import { usePdf } from '../lib/usePdf'

const PREVIEW = 6
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function InterleaveWork({ files, setFiles, addFiles, run }: FrameCtx) {
  const [reverse, setReverse] = useState(false)
  const a = usePdf(files[0])
  const b = usePdf(files[1] ?? files[0])
  // exactamente dos PDF: si se sueltan más, se quedan los dos primeros
  useEffect(() => { if (files.length > 2) setFiles(files.slice(0, 2)) }, [files, setFiles])

  const order = useMemo(() => interleaveOrder(a.numPages, b.numPages, reverse), [a.numPages, b.numPages, reverse])

  if (files.length < 2) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p>Has elegido <b>{files[0].name}</b>. Añade el segundo PDF para mezclarlos.</p>
        <AddMore accept=".pdf" onFiles={addFiles} label="Añadir segundo PDF" />
      </div>
    )
  }

  const ready = !!a.pdf && !!b.pdf
  const unequal = ready && a.numPages !== b.numPages
  const error = a.error ?? b.error
  const [fa, fb] = files

  return (
    <Workspace
      main={error ? <Notice kind="error">{error}</Notice> : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-center gap-6">
            {[['A', fa], ['B', fb]].map(([tag, f]) => (
              <div key={tag as string} className="relative">
                <span className="absolute -left-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white shadow">{tag as string}</span>
                <PdfCard file={f as File} showPages />
              </div>
            ))}
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold">Así quedarán las primeras páginas</h2>
            {ready ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
                {order.slice(0, PREVIEW).map((it, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <PageThumb pdf={(it.src === 'A' ? a.pdf : b.pdf)!} pageNum={it.page} width={88} zoom={false} />
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${it.src === 'A' ? 'bg-brand/10 text-brand' : 'bg-lime/60 text-ink'}`}>{it.label}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-ink/60">Leyendo los PDF…</p>}
          </div>
        </div>
      )}
      side={
        <>
          <div>
            <p className="font-display text-2xl font-bold">{ready ? plural(order.length, 'página', 'páginas') : 'Leyendo…'}</p>
            <p className="text-sm text-ink/60">{ready ? `A tiene ${a.numPages} y B tiene ${b.numPages}` : 'Contando páginas'}</p>
          </div>
          <Switch checked={reverse} onChange={setReverse} label="El segundo está en orden inverso" description="Para escáneres que devuelven las caras del dorso al revés." />
          <Button icon={ArrowLeftRight} onClick={() => setFiles([fb, fa])}>Intercambiar A y B</Button>
          {unequal && <Notice kind="warn">Tienen distinto número de páginas: las que sobran de {a.numPages > b.numPages ? 'A' : 'B'} van al final.</Notice>}
        </>
      }
      action={{
        label: 'Intercalar PDF',
        disabled: !ready,
        onClick: () => run(async (progress) => [{ name: `${baseName(fa)}_intercalado.pdf`, blob: pdfBlob(await interleavePdfs(fa, fb, reverse, (f) => progress(f))) }]),
      }}
    />
  )
}

export default function Interleave() {
  return <ToolFrame id="interleave" accept=".pdf" multiple>{(ctx) => <InterleaveWork {...ctx} />}</ToolFrame>
}
