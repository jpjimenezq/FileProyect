import { useFitWidth } from '../lib/useFitWidth'
import { useState } from 'react'
import { PageCanvas } from '../components/PageCanvas'
import { RasterNotice } from '../components/EffectPreview'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { Checkbox, Notice, Slider } from '../components/ui'
import { baseName } from '../lib/files'
import { adjustCanvas } from '../lib/pdf/misc'
import { pdfBlob } from '../lib/pdf/ops'
import { rasterizePdf } from '../lib/pdf/redact'
import { usePdf } from '../lib/usePdf'

type Preset = 'custom' | 'scan' | 'dark' | 'light'
const PRESETS: Record<Exclude<Preset, 'custom'>, { brightness: number; contrast: number; gray: boolean }> = {
  scan: { brightness: 1.1, contrast: 1.5, gray: true },
  dark: { brightness: 0.85, contrast: 1.2, gray: false },
  light: { brightness: 1.2, contrast: 0.9, gray: false },
}

const pct = (v: number) => `${Math.round(v * 100)}%`

function ContrastWork({ files, run }: FrameCtx) {
  const pageWidth = useFitWidth(420)
  const file = files[0]
  const { pdf, numPages, error } = usePdf(file)
  const [brightness, setBrightness] = useState(1)
  const [contrast, setContrast] = useState(1)
  const [gray, setGray] = useState(false)
  const [preset, setPreset] = useState<Preset>('custom')

  const choose = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') { setBrightness(PRESETS[p].brightness); setContrast(PRESETS[p].contrast); setGray(PRESETS[p].gray) }
  }
  const touch = (fn: () => void) => { fn(); setPreset('custom') }

  return (
    <Workspace
      main={
        error ? <Notice kind="error">{error}</Notice> : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm font-semibold">Vista previa de la primera página</p>
            <div style={{ filter: `${gray ? 'grayscale(1) ' : ''}brightness(${brightness}) contrast(${contrast})` }}>
              {pdf && <PageCanvas pdf={pdf} pageNum={1} width={pageWidth} />}
            </div>
          </div>
        )
      }
      side={
        <>
          <Field label="Ajustes rápidos">
            <Segmented<Preset>
              label="Ajuste"
              value={preset}
              onChange={choose}
              options={[
                { value: 'scan', label: 'Limpiar escaneo', desc: 'Papel más blanco y texto más negro.' },
                { value: 'dark', label: 'Oscurecer', desc: 'Para documentos desvaídos.' },
                { value: 'light', label: 'Aclarar', desc: 'Para escaneos oscuros.' },
              ]}
            />
          </Field>
          <Slider label="Brillo" min={0.5} max={1.8} step={0.05} value={brightness} format={pct} onChange={(v) => touch(() => setBrightness(v))} />
          <Slider label="Contraste" min={0.5} max={2.5} step={0.05} value={contrast} format={pct} onChange={(v) => touch(() => setContrast(v))} />
          <Checkbox label="Escala de grises" checked={gray} onChange={(v) => touch(() => setGray(v))} />
          <RasterNotice />
        </>
      }
      action={{
        label: 'Aplicar ajustes',
        disabled: !numPages,
        onClick: () => run(async (progress) => [{ name: `${baseName(file)}_ajustado.pdf`, blob: pdfBlob(await rasterizePdf(file, 2, progress, (c) => adjustCanvas(c, { brightness, contrast, gray }))) }]),
      }}
    />
  )
}

export default function Contrast() {
  return <ToolFrame id="contrast" accept=".pdf">{(ctx) => <ContrastWork {...ctx} />}</ToolFrame>
}
