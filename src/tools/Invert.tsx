import { useMemo, useState } from 'react'
import { Moon, SunMoon } from 'lucide-react'
import { EffectPreview, RasterNotice } from '../components/EffectPreview'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Checkbox } from '../components/ui'
import { baseName } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import { invertEffect } from '../lib/pdf/raster'
import type { InvertMode } from '../lib/pdf/raster'
import { rasterizePdf } from '../lib/pdf/redact'
import { usePdf } from '../lib/usePdf'

function InvertWork({ files, run }: FrameCtx) {
  const file = files[0]
  const { pdf, numPages } = usePdf(file)
  const [mode, setMode] = useState<InvertMode>('dark')
  const [keepImages, setKeepImages] = useState(true)
  const effect = useMemo(() => invertEffect(mode, keepImages), [mode, keepImages])

  return (
    <Workspace
      main={<EffectPreview pdf={pdf} effect={effect} />}
      side={
        <>
          <Field label="Tipo de inversión">
            <Segmented<InvertMode>
              label="Tipo de inversión"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'dark', label: 'Modo oscuro', icon: Moon, desc: 'Fondo oscuro y texto claro; los colores conservan su tono.' },
                { value: 'negative', label: 'Negativo', icon: SunMoon, desc: 'Invierte todos los colores, como un negativo de foto.' },
              ]}
            />
          </Field>
          {mode === 'dark' && (
            <Checkbox label="Dejar las imágenes como están" description="Fotos y logotipos no cambian de color." checked={keepImages} onChange={setKeepImages} />
          )}
          <RasterNotice />
        </>
      }
      action={{
        label: 'Invertir colores',
        disabled: !numPages,
        onClick: () => run(async (progress) => [{ name: `${baseName(file)}_${mode === 'dark' ? 'oscuro' : 'negativo'}.pdf`, blob: pdfBlob(await rasterizePdf(file, 2, progress, effect)) }]),
      }}
    />
  )
}

export default function Invert() {
  return <ToolFrame id="invert" accept=".pdf">{(ctx) => <InvertWork {...ctx} />}</ToolFrame>
}
