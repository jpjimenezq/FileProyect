import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { createWorker } from 'tesseract.js'
import { FileSearch, FileText } from 'lucide-react'
import { PageThumb } from '../components/PageThumb'
import { RemoveButton } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import { Select } from '../components/ui'
import type { FrameCtx, Output } from '../components/ToolFrame'
import { baseName, fmtSize } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import { loadPdf, renderPage } from '../lib/pdf/render'
import { usePdf } from '../lib/usePdf'

function OcrWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { pdf: doc, numPages } = usePdf(file)
  const [lang, setLang] = useState('spa')
  const [output, setOutput] = useState<'pdf' | 'txt'>('pdf')

  const start = () => run(async (progress) => {
    const pdf = await loadPdf(file)
    const worker = await createWorker(lang)
    try {
      const merged = await PDFDocument.create()
      let text = ''
      const canvas = document.createElement('canvas')
      for (let n = 1; n <= pdf.numPages; n++) {
        await renderPage(pdf, n, canvas, 1800)
        const { data } = await worker.recognize(canvas, {}, { pdf: output === 'pdf', text: true })
        text += `${data.text}\n\n`
        if (output === 'pdf' && data.pdf) {
          const page = await PDFDocument.load(new Uint8Array(data.pdf))
          ;(await merged.copyPages(page, [0])).forEach((p) => merged.addPage(p))
        }
        progress(n / pdf.numPages, n < pdf.numPages ? `Página ${n + 1} de ${pdf.numPages}` : undefined)
      }
      const out: Output[] = output === 'pdf'
        ? [{ name: `${baseName(file)}_ocr.pdf`, blob: pdfBlob(await merged.save()) }]
        : [{ name: `${baseName(file)}.txt`, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) }]
      return out
    } finally {
      await worker.terminate()
    }
  })

  return (
    <Workspace
      main={
        <div className="flex justify-center">
          <div className="relative flex flex-col items-center gap-2">
            <RemoveButton onClick={reset} />
            {doc ? <PageThumb pdf={doc} pageNum={1} width={280} /> : <div className="h-[364px] w-[280px] animate-pulse bg-paper" />}
            <p className="max-w-[280px] truncate text-center text-sm font-medium" title={file.name}>{file.name}</p>
            <p className="text-xs text-ink/60">{fmtSize(file.size)}{numPages ? ` · ${numPages} ${numPages === 1 ? 'página' : 'págs.'}` : ''}</p>
          </div>
        </div>
      }
      side={
        <>
          <Select label="Idioma del documento" hint="La primera vez se descarga el idioma (necesitas conexión)." value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="spa">Español</option>
            <option value="eng">Inglés</option>
            <option value="fra">Francés</option>
            <option value="deu">Alemán</option>
            <option value="por">Portugués</option>
            <option value="ita">Italiano</option>
            <option value="spa+eng">Español + Inglés</option>
          </Select>
          <Field label="Resultado">
            <Segmented<'pdf' | 'txt'>
              label="Resultado"
              value={output}
              onChange={setOutput}
              options={[
                { value: 'pdf', label: 'PDF', icon: FileSearch, desc: 'Igual que el original, pero con texto que se puede buscar y copiar.' },
                { value: 'txt', label: 'Texto', icon: FileText, desc: 'Un archivo .txt con el texto, sin imágenes ni formato.' },
              ]}
            />
          </Field>
        </>
      }
      action={{ label: 'Aplicar OCR', disabled: !numPages, onClick: start }}
    />
  )
}

export default function Ocr() {
  return <ToolFrame id="ocr" accept=".pdf">{(ctx) => <OcrWork {...ctx} />}</ToolFrame>
}
