import { useState } from 'react'
import { PdfCard } from '../components/FileCards'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import { Checkbox } from '../components/ui'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { pdfPlainTextPages } from '../lib/pdf/markdown'
import { loadPdf } from '../lib/pdf/render'
import { usePdf } from '../lib/usePdf'

function TextWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [separate, setSeparate] = useState(true)

  return (
    <Workspace
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={
        <>
          <Checkbox checked={separate} onChange={setSeparate} label="Marcar dónde empieza cada página" description="Si es un escaneo, usa antes «OCR PDF»." />
        </>
      }
      action={{
        label: 'Extraer texto',
        disabled: !numPages,
        onClick: () => run(async (progress) => {
          const pages = await pdfPlainTextPages(await loadPdf(file), progress)
          const text = pages.map((p, i) => (separate ? `--- Página ${i + 1} ---\n\n${p}` : p)).join('\n\n').trim()
          if (pages.join('').trim().length < 2) throw new Error('No se encontró texto en el PDF. Si es un escaneo, usa primero la herramienta OCR.')
          return [{ name: `${baseName(file)}.txt`, blob: new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' }), preview: text.slice(0, 3000) }]
        }),
      }}
    />
  )
}

export default function PdfToText() {
  return <ToolFrame id="pdf-to-text" accept=".pdf">{(ctx) => <TextWork {...ctx} />}</ToolFrame>
}
