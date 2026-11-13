import { useEffect, useState } from 'react'
import { RotateCcw, RotateCw } from 'lucide-react'
import { PageThumb } from '../components/PageThumb'
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
        error ? <p className="text-center text-red-600">{error}</p> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] justify-items-center gap-4">
            {pdf && turns.map((t, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <PageThumb pdf={pdf} pageNum={i + 1} width={180} rotation={t} />
                <div className="flex items-center gap-2 text-gray-600">
                  <button aria-label="Girar a la izquierda" onClick={() => rotate(i, -1)} className="rounded p-1 hover:bg-gray-200"><RotateCcw size={16} /></button>
                  <span className="text-xs">{i + 1}</span>
                  <button aria-label="Girar a la derecha" onClick={() => rotate(i, 1)} className="rounded p-1 hover:bg-gray-200"><RotateCw size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      }
      side={
        <>
          <p className="text-sm text-gray-600">Gira todas las páginas o cada una por separado.</p>
          <div className="flex gap-2 text-sm">
            <button className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-300 py-2 hover:bg-gray-50" onClick={() => rotateAll(-1)}><RotateCcw size={16} /> Todo</button>
            <button className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-300 py-2 hover:bg-gray-50" onClick={() => rotateAll(1)}><RotateCw size={16} /> Todo</button>
          </div>
          <button className="text-sm text-gray-600 hover:text-brand" onClick={() => setTurns(new Array(numPages).fill(0))}>Restablecer</button>
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
