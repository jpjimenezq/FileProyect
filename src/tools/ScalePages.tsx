import { useState } from 'react'
import { Percent, Ruler } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Slider } from '../components/ui'
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
                { value: 'paper', label: 'Un papel', icon: Ruler, desc: 'Ajusta cada página al papel, sin deformarla.' },
                { value: 'percent', label: 'Porcentaje', icon: Percent, desc: 'Agranda o reduce todas las páginas por igual.' },
              ]}
            />
          </Field>
          {mode === 'paper' ? (
            <Field label="Papel">
              <Segmented<PaperId> label="Papel" value={paper} onChange={setPaper} options={(Object.keys(PAPER) as PaperId[]).map((p) => ({ value: p, label: PAPER[p].label }))} />
            </Field>
          ) : (
            <Slider label="Tamaño" min={25} max={200} step={5} value={percent} unit="%" onChange={setPercent} />
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
