import { useEffect, useState } from 'react'
import { RotateCcw, RotateCw } from 'lucide-react'
import { PageThumb } from '../components/PageThumb'
import { Button, Notice } from '../components/ui'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { pdfBlob, rotatePages } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

const mod4 = (n: number) => ((n % 4) + 4) % 4

function RotateWork({ files, run }: FrameCtx) {
  const file = files[0]
  const { pdf, numPages, error } = usePdf(file)
  const [turns, setTurns] = useState<number[]>([])
  useEffect(() => { setTurns(new Array(numPages).fill(0)) }, [numPages])

  const rotate = (i: number, d: number) => setTurns((t) => t.map((v, j) => (j === i ? mod4(v + d) : v)))
  const rotateAll = (d: number) => setTurns((t) => t.map((v) => mod4(v + d)))

  return (
    <Workspace
      main={
        error ? <Notice kind="error">{error}</Notice> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] justify-items-center gap-4">
            {pdf && turns.map((t, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <PageThumb pdf={pdf} pageNum={i + 1} width={180} rotation={t} />
                <div className="flex items-center gap-1.5">
                  <button aria-label={`Girar la página ${i + 1} a la izquierda`} onClick={() => rotate(i, -1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-ink/70 transition hover:border-brand hover:text-brand sm:h-9 sm:w-9"><RotateCcw size={18} /></button>
                  <span className={`min-w-8 rounded-full px-2 py-0.5 text-center text-xs font-medium ${t ? 'bg-brand/10 text-brand' : 'bg-paper text-ink/60'}`}>{i + 1}</span>
                  <button aria-label={`Girar la página ${i + 1} a la derecha`} onClick={() => rotate(i, 1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-ink/70 transition hover:border-brand hover:text-brand sm:h-9 sm:w-9"><RotateCw size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      }
      side={
        <>
          <p className="text-sm text-ink/60">Gira todas las páginas a la vez o cada una con los botones de debajo.</p>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Girar todas las páginas</span>
            <div className="flex gap-2">
              <Button className="flex-1" icon={RotateCcw} onClick={() => rotateAll(-1)}>Izquierda</Button>
              <Button className="flex-1" icon={RotateCw} onClick={() => rotateAll(1)}>Derecha</Button>
            </div>
          </div>
          <Button variant="ghost" disabled={!turns.some(Boolean)} onClick={() => setTurns(new Array(numPages).fill(0))}>Restablecer</Button>
        </>
      }
      action={{
        label: 'Rotar PDF',
        disabled: !turns.some(Boolean),
        onClick: () => run(async () => [{ name: `${baseName(file)}_rotado.pdf`, blob: pdfBlob(await rotatePages(file, turns)) }]),
      }}
    />
  )
}

export default function Rotate() {
  return <ToolFrame id="rotate" accept=".pdf">{(ctx) => <RotateWork {...ctx} />}</ToolFrame>
}
