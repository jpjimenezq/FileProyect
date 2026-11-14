import { useMemo, useState } from 'react'
import { EffectPreview, RasterNotice } from '../components/EffectPreview'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { scannerCanvas } from '../lib/pdf/effects'
import type { ScanLevel } from '../lib/pdf/effects'
import { pdfBlob } from '../lib/pdf/ops'
import { rasterizePdf } from '../lib/pdf/redact'
import { usePdf } from '../lib/usePdf'

function ScannerWork({ files, run }: FrameCtx) {
  const file = files[0]
  const { pdf, numPages } = usePdf(file)
  const [level, setLevel] = useState<ScanLevel>(2)
  const [bw, setBw] = useState(false)
  const effect = useMemo(() => (canvas: HTMLCanvasElement, info: { n: number }) => scannerCanvas(canvas, level, bw, info.n * 7919 + file.size), [level, bw, file.size])

  return (
    <Workspace
      main={<EffectPreview pdf={pdf} effect={effect} />}
      side={
        <>
          <Field label="Intensidad">
            <Segmented<ScanLevel> label="Intensidad" value={level} onChange={setLevel} options={[
              { value: 1, label: 'Suave', desc: 'Casi limpio, con un ligero giro.' },
              { value: 2, label: 'Normal', desc: 'Giro, grano y sombras en los bordes.' },
              { value: 3, label: 'Fuerte', desc: 'Como una fotocopia gastada.' },
            ]} />
          </Field>
          <Field label="Color">
            <Segmented<'gray' | 'bw'> label="Color" value={bw ? 'bw' : 'gray'} onChange={(v) => setBw(v === 'bw')} options={[{ value: 'gray', label: 'Grises' }, { value: 'bw', label: 'Blanco y negro' }]} />
          </Field>
          <RasterNotice />
        </>
      }
      action={{
        label: 'Aplicar efecto escáner',
        disabled: !numPages,
        onClick: () => run(async (progress) => [{
          name: `${baseName(file)}_escaneado.pdf`,
          blob: pdfBlob(await rasterizePdf(file, 2, progress, effect)),
        }]),
      }}
    />
  )
}

export default function Scanner() {
  return <ToolFrame id="scanner" accept=".pdf">{(ctx) => <ScannerWork {...ctx} />}</ToolFrame>
}
