import { useEffect, useState } from 'react'
import { PageThumb } from '../components/PageThumb'
import { Button, Notice } from '../components/ui'
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
        error ? <Notice kind="error">{error}</Notice> : (
          <SortableGrid
            items={order}
            keyOf={(n) => n}
            onChange={setOrder}
            render={(n, i) => (
              <div className="flex flex-col items-center gap-1">
                {pdf && <PageThumb pdf={pdf} pageNum={n} width={180} />}
                <span className="flex items-center gap-1.5 text-xs font-medium text-ink/70">
                  <span className="rounded-full bg-paper px-2 py-0.5">{i + 1}</span>
                  {n !== i + 1 && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-brand">antes p. {n}</span>}
                </span>
              </div>
            )}
          />
        )
      }
      side={
        <>
          <p className="text-sm text-ink/60">Arrastra las páginas para cambiar su orden. En el móvil usa las flechas.</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setOrder([...order].reverse())}>Invertir orden</Button>
            <Button variant="ghost" className="flex-1" disabled={!changed} onClick={() => setOrder([...order].sort((a, b) => a - b))}>Restablecer</Button>
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
