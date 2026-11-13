import { useState } from 'react'
import { PdfCard } from '../components/FileCards'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { cleanMarkdown } from '../lib/ai'
import { useCapabilities } from '../lib/api'
import { pdfToMarkdown } from '../lib/pdf/markdown'
import { loadPdf } from '../lib/pdf/render'
import { usePdf } from '../lib/usePdf'

function MarkdownWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const caps = useCapabilities()
  const aiReady = caps !== null && caps !== 'offline' && caps.ai
  const [useAi, setUseAi] = useState(false)

  return (
    <Workspace
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={
        <>
          <p className="text-sm text-gray-600">Convierte títulos, listas y párrafos. Las tablas e imágenes no se incluyen. Si es un escaneo, usa antes OCR.</p>
          <label className={`flex items-start gap-2 text-sm ${aiReady ? '' : 'opacity-50'}`}>
            <input type="checkbox" className="mt-0.5" disabled={!aiReady} checked={useAi && aiReady} onChange={(e) => setUseAi(e.target.checked)} />
            <span>
              Mejorar con IA
              <span className="block text-xs text-gray-500">{aiReady ? 'Envía el texto a DeepSeek (servicio externo).' : 'No disponible: falta configurar la IA.'}</span>
            </span>
          </label>
        </>
      }
      action={{
        label: 'Convertir a Markdown',
        disabled: !numPages,
        onClick: () => run(async (progress) => {
          let md = await pdfToMarkdown(await loadPdf(file), (f) => progress(f * 0.2))
          if (md.trim().length < 2) throw new Error('No se encontró texto en el PDF. Si es un escaneo, usa primero la herramienta OCR.')
          if (useAi && aiReady) md = await cleanMarkdown(md, (f) => progress(0.2 + f * 0.8))
          return [{ name: `${baseName(file)}.md`, blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }) }]
        }),
      }}
    />
  )
}

export default function PdfToMarkdown() {
  return <ToolFrame id="pdf-to-md" accept=".pdf">{(ctx) => <MarkdownWork {...ctx} />}</ToolFrame>
}
