import { useState } from 'react'
import { Monitor, Printer, Smartphone } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx, Output } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { pageToBlob } from '../lib/pdf/render'
import { loadPdf } from '../lib/pdf/render'
import { usePdf } from '../lib/usePdf'

function PdfToJpgWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [scale, setScale] = useState(2)
  const [format, setFormat] = useState<'jpg' | 'png'>('jpg')

  const start = () => run(async (progress) => {
    const pdf = await loadPdf(file)
    const out: Output[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      out.push({ name: `${baseName(file)}_pagina-${n}.${format}`, blob: await pageToBlob(pdf, n, scale, 0.92, format === 'png' ? 'image/png' : 'image/jpeg') })
      progress(n / pdf.numPages)
    }
    return out
  })

  return (
    <Workspace
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={
        <>
        <Field label="Formato">
          <Segmented<'jpg' | 'png'>
            label="Formato"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'jpg', label: 'JPG', desc: 'Pesa menos. Ideal para fotos y para compartir.' },
              { value: 'png', label: 'PNG', desc: 'Sin pérdida de calidad: mejor para texto y dibujos, pero pesa más.' },
            ]}
          />
        </Field>
        <Field label="Calidad de imagen">
          <Segmented<number>
            label="Calidad de imagen"
            value={scale}
            onChange={setScale}
            options={[
              { value: 1.4, label: 'Compartir', icon: Smartphone, desc: 'Para compartir: archivos pequeños.' },
              { value: 2, label: 'Pantalla', icon: Monitor, desc: 'Para pantalla: nítida y de peso medio.' },
              { value: 3, label: 'Imprimir', icon: Printer, desc: 'Para imprimir: la más nítida y pesada.' },
            ]}
          />
        </Field>
        </>
      }
      action={{ label: `Convertir a ${format.toUpperCase()}`, disabled: !numPages, onClick: start }}
    />
  )
}

export default function PdfToJpg() {
  return <ToolFrame id="pdf-to-jpg" accept=".pdf">{(ctx) => <PdfToJpgWork {...ctx} />}</ToolFrame>
}
