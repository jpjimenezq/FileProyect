import { useMemo, useState } from 'react'
import { Moon, SunMoon } from 'lucide-react'
import { EffectPreview } from '../components/EffectPreview'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
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
                { value: 'dark', label: 'Modo oscuro', icon: Moon, desc: 'Fondo oscuro y texto claro. Los colores conservan su tono (el rojo sigue siendo rojo).' },
                { value: 'negative', label: 'Negativo', icon: SunMoon, desc: 'Invierte absolutamente todos los colores, como un negativo de foto.' },
              ]}
            />
          </Field>
          {mode === 'dark' && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={keepImages} onChange={(e) => setKeepImages(e.target.checked)} />
              <span>Dejar las imágenes como están<span className="block text-xs text-ink/55">Las fotos y logotipos no cambian de color. Un escaneo que ocupa toda la página sí se invierte.</span></span>
            </label>
          )}
          <p className="text-xs text-ink/55">Las páginas se convierten en imágenes: el texto ya no se podrá seleccionar.</p>
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
