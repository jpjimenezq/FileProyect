import { useState } from 'react'
import { RectangleHorizontal, RectangleVertical } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { PAPER, gridFor, multiPageLayout } from '../lib/pdf/layout'
import type { PaperId, PerSheet } from '../lib/pdf/layout'
import { pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

/** Una hoja dibujada con sus casillas numeradas: se ve cómo quedará la primera hoja */
function Sheet({ perSheet, landscape, total }: { perSheet: PerSheet; landscape: boolean; total: number }) {
  const { cols, rows } = gridFor(perSheet, landscape)
  const [w, h] = landscape ? [220, 156] : [156, 220]
  return (
    <div className="grid gap-1.5 rounded border border-ink/30 bg-white p-2 shadow-md" style={{ width: w, height: h, gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {Array.from({ length: cols * rows }, (_, i) => (
        <div key={i} className={`flex items-center justify-center rounded-sm border text-xs font-bold ${i < total ? 'border-brand/40 bg-brand/10 text-brand' : 'border-dashed border-ink/15 text-ink/20'}`}>{i < total ? i + 1 : ''}</div>
      ))}
    </div>
  )
}

function MultiWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [perSheet, setPerSheet] = useState<PerSheet>(4)
  const [landscape, setLandscape] = useState(false)
  const [paper, setPaper] = useState<PaperId>('a4')
  const [border, setBorder] = useState(true)
  const sheets = numPages ? Math.ceil(numPages / perSheet) : 0

  return (
    <Workspace
      main={
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
          <PdfCard file={file} showPages onRemove={reset} />
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-semibold">Así quedará cada hoja</p>
            <Sheet perSheet={perSheet} landscape={landscape} total={numPages || perSheet} />
            {sheets > 0 && <p className="text-sm text-ink/60">{numPages} páginas → <b>{sheets}</b> {sheets === 1 ? 'hoja' : 'hojas'}</p>}
          </div>
        </div>
      }
      side={
        <>
          <Field label="Páginas por hoja">
            <Segmented<PerSheet> label="Páginas por hoja" value={perSheet} onChange={setPerSheet} options={[{ value: 2, label: '2' }, { value: 4, label: '4' }, { value: 6, label: '6' }, { value: 9, label: '9' }]} />
          </Field>
          <Field label="Orientación de la hoja">
            <Segmented<'v' | 'h'> label="Orientación" value={landscape ? 'h' : 'v'} onChange={(v) => setLandscape(v === 'h')} options={[{ value: 'v', label: 'Vertical', icon: RectangleVertical }, { value: 'h', label: 'Horizontal', icon: RectangleHorizontal }]} />
          </Field>
          <Field label="Tamaño de la hoja">
            <Segmented<PaperId> label="Papel" value={paper} onChange={setPaper} options={[{ value: 'a4', label: PAPER.a4.label }, { value: 'letter', label: PAPER.letter.label }, { value: 'a3', label: PAPER.a3.label }]} />
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={border} onChange={(e) => setBorder(e.target.checked)} /> Marco alrededor de cada página</label>
        </>
      }
      action={{
        label: 'Crear hojas',
        disabled: !numPages,
        onClick: () => run(async (progress) => [{ name: `${baseName(file)}_${perSheet}-por-hoja.pdf`, blob: pdfBlob(await multiPageLayout(file, { perSheet, landscape, border, paper }, progress)) }]),
      }}
    />
  )
}

export default function MultiPage() {
  return <ToolFrame id="multi-page" accept=".pdf">{(ctx) => <MultiWork {...ctx} />}</ToolFrame>
}
