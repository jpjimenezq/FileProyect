import { useState } from 'react'
import { FileCode2, FileText } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { translatePages } from '../lib/ai'
import { pdfPageTexts } from '../lib/pdf/markdown'
import { pdfBlob } from '../lib/pdf/ops'
import { loadPdf } from '../lib/pdf/render'
import { textToPdf } from '../lib/pdf/textpdf'
import { usePdf } from '../lib/usePdf'
import { AI_NOTICE, AiBanner, useAiBlocker } from './AiNotice'

const LANGUAGES: [string, string][] = [['es', 'Español'], ['en', 'Inglés'], ['fr', 'Francés'], ['de', 'Alemán'], ['pt', 'Portugués'], ['it', 'Italiano'], ['ca', 'Catalán']]

function TranslateWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const blocker = useAiBlocker()
  const [target, setTarget] = useState('en')
  const [format, setFormat] = useState<'pdf' | 'md'>('pdf')

  return (
    <Workspace
      main={
        <div className="flex flex-col items-center gap-4">
          <PdfCard file={file} showPages onRemove={reset} />
          <AiBanner blocker={blocker} />
        </div>
      }
      side={
        <>
          <Field label="Traducir a">
            <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
              {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Resultado">
            <Segmented<'pdf' | 'md'>
              label="Resultado"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'pdf', label: 'PDF', icon: FileText, desc: 'Un PDF nuevo con el texto traducido, una página por página original.' },
                { value: 'md', label: 'Markdown', icon: FileCode2, desc: 'Texto con títulos y listas, fácil de copiar y editar.' },
              ]}
            />
          </Field>
          <p className="text-xs text-gray-500">Se traduce el texto del PDF y se genera un documento nuevo: se pierde el diseño original, las imágenes y las tablas. Si es un escaneo, usa antes OCR.</p>
        </>
      }
      action={{
        label: 'Traducir PDF',
        disabled: !numPages || !!blocker,
        onClick: () => run(async (progress) => {
          const pages = await pdfPageTexts(await loadPdf(file), (f) => progress(f * 0.05))
          const translated = await translatePages(pages, target, (f) => progress(0.05 + f * 0.9))
          if (format === 'md') {
            const md = translated.join('\n\n---\n\n')
            return [{ name: `${baseName(file)}_${target}.md`, blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), preview: md.slice(0, 3000) }]
          }
          return [{
            name: `${baseName(file)}_${target}.pdf`,
            blob: pdfBlob(await textToPdf(translated)),
            note: target === 'ca' ? undefined : 'Documento nuevo generado con el texto traducido; el diseño original no se conserva.',
            preview: translated.join('\n\n').slice(0, 3000),
          }]
        }),
      }}
    />
  )
}

export default function Translate() {
  return <ToolFrame id="translate" accept=".pdf" notice={AI_NOTICE}>{(ctx) => <TranslateWork {...ctx} />}</ToolFrame>
}
