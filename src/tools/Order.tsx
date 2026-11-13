import { useEffect, useState } from 'react'
import { PageThumb } from '../components/PageThumb'
import { SortableGrid } from '../components/SortableGrid'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { extractPages, pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

function OrderWork({ files, run }: FrameCtx) {
  const file = files[0]
  const { pdf, numPages, error } = usePdf(file)
  const [order, setOrder] = useState<number[]>([])
  useEffect(() => { setOrder(Array.from({ length: numPages }, (_, i) => i + 1)) }, [numPages])

  const changed = order.some((n, i) => n !== i + 1)

  return (
    <Workspace
      main={
        error ? <p className="text-center text-red-600">{error}</p> : (
          <SortableGrid
            items={order}
            keyOf={(n) => n}
            onChange={setOrder}
            render={(n, i) => (
              <div className="flex flex-col items-center">
                {pdf && <PageThumb pdf={pdf} pageNum={n} width={180} />}
                <span className="text-xs text-gray-600">{i + 1}{n !== i + 1 ? ` (antes ${n})` : ''}</span>
              </div>
            )}
          />
        )
      }
      side={
        <>
          <p className="text-sm text-gray-600">Arrastra las páginas para cambiar su orden.</p>
          <div className="flex gap-2 text-sm">
            <button className="flex-1 rounded-lg border border-gray-300 py-1.5 hover:bg-gray-50" onClick={() => setOrder([...order].reverse())}>Invertir</button>
            <button className="flex-1 rounded-lg border border-gray-300 py-1.5 hover:bg-gray-50" onClick={() => setOrder([...order].sort((a, b) => a - b))}>Restablecer</button>
          </div>
        </>
      }
      action={{
        label: 'Ordenar PDF',
        disabled: !changed,
        onClick: () => run(async () => [{ name: `${baseName(file)}_ordenado.pdf`, blob: pdfBlob(await extractPages(file, order)) }]),
      }}
    />
  )
}

export default function Order() {
  return <ToolFrame id="order" accept=".pdf">{(ctx) => <OrderWork {...ctx} />}</ToolFrame>
}
