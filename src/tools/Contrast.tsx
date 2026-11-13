import { useFitWidth } from '../lib/useFitWidth'
import { useState } from 'react'
import { PageCanvas } from '../components/PageCanvas'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
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
        error ? <p className="text-center text-red-600">{error}</p> : (
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
                { value: 'scan', label: 'Limpiar escaneo', desc: 'Más contraste y en grises: deja el papel más blanco y el texto más negro.' },
                { value: 'dark', label: 'Oscurecer', desc: 'Para documentos desvaídos o con poca tinta.' },
                { value: 'light', label: 'Aclarar', desc: 'Para escaneos demasiado oscuros.' },
              ]}
            />
          </Field>
          <Field label={`Brillo: ${Math.round(brightness * 100)}%`}><input type="range" min={0.5} max={1.8} step={0.05} value={brightness} onChange={(e) => touch(() => setBrightness(Number(e.target.value)))} /></Field>
          <Field label={`Contraste: ${Math.round(contrast * 100)}%`}><input type="range" min={0.5} max={2.5} step={0.05} value={contrast} onChange={(e) => touch(() => setContrast(Number(e.target.value)))} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={gray} onChange={(e) => touch(() => setGray(e.target.checked))} /> Escala de grises</label>
          <p className="text-xs text-ink/55">Las páginas se convierten en imágenes: el texto ya no se podrá seleccionar.</p>
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
