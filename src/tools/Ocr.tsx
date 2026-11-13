import { useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { createWorker } from 'tesseract.js'
import { FileSearch, FileText } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx, Output } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { pdfBlob } from '../lib/pdf/ops'
import { loadPdf, renderPage } from '../lib/pdf/render'
import { usePdf } from '../lib/usePdf'

function OcrWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
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
        progress(n / pdf.numPages)
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
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={
        <>
          <Field label="Idioma del documento">
            <select className={inputCls} value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="spa">Español</option>
              <option value="eng">Inglés</option>
              <option value="fra">Francés</option>
              <option value="deu">Alemán</option>
              <option value="por">Portugués</option>
              <option value="ita">Italiano</option>
              <option value="spa+eng">Español + Inglés</option>
            </select>
          </Field>
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
          <p className="text-xs text-gray-500">La primera vez se descargan los datos del idioma (necesitas conexión). El OCR puede tardar unos segundos por página.</p>
        </>
      }
      action={{ label: 'Aplicar OCR', disabled: !numPages, onClick: start }}
    />
  )
}

export default function Ocr() {
  return <ToolFrame id="ocr" accept=".pdf">{(ctx) => <OcrWork {...ctx} />}</ToolFrame>
}
