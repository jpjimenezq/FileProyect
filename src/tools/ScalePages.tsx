import { useState } from 'react'
import { Percent, Ruler } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { PAPER, scalePages } from '../lib/pdf/layout'
import type { PaperId } from '../lib/pdf/layout'
import { pdfBlob } from '../lib/pdf/ops'
import { usePdf } from '../lib/usePdf'

function ScaleWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [mode, setMode] = useState<'paper' | 'percent'>('paper')
  const [paper, setPaper] = useState<PaperId>('a4')
  const [percent, setPercent] = useState(75)

  return (
    <Workspace
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={
        <>
          <Field label="Cambiar el tamaño a">
            <Segmented<'paper' | 'percent'>
              label="Modo"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'paper', label: 'Un papel', icon: Ruler, desc: 'Todas las páginas se ajustan al papel elegido, sin deformarse.' },
                { value: 'percent', label: 'Porcentaje', icon: Percent, desc: 'Cada página se hace más grande o más pequeña en la misma proporción.' },
              ]}
            />
          </Field>
          {mode === 'paper' ? (
            <Field label="Papel">
              <Segmented<PaperId> label="Papel" value={paper} onChange={setPaper} options={(Object.keys(PAPER) as PaperId[]).map((p) => ({ value: p, label: PAPER[p].label }))} />
            </Field>
          ) : (
            <Field label={`Tamaño: ${percent}%`}>
              <input type="range" min={25} max={200} step={5} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
            </Field>
          )}
        </>
      }
      action={{
        label: 'Escalar páginas',
        disabled: !numPages,
        onClick: () => run(async (progress) => [{ name: `${baseName(file)}_escalado.pdf`, blob: pdfBlob(await scalePages(file, mode === 'paper' ? { mode, paper } : { mode, percent }, progress)) }]),
      }}
    />
  )
}

export default function ScalePages() {
  return <ToolFrame id="scale-pages" accept=".pdf">{(ctx) => <ScaleWork {...ctx} />}</ToolFrame>
}
