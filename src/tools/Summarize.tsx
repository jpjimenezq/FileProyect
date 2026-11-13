import { useState } from 'react'
import { PdfCard } from '../components/FileCards'
import { AlignLeft, List, ListTree } from 'lucide-react'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace, inputCls } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { summarize } from '../lib/ai'
import { pdfPageTexts } from '../lib/pdf/markdown'
import { loadPdf } from '../lib/pdf/render'
import { usePdf } from '../lib/usePdf'
import { AI_NOTICE, AiBanner, useAiBlocker } from './AiNotice'

function SummarizeWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const blocker = useAiBlocker()
  const [length, setLength] = useState('medium')
  const [language, setLanguage] = useState('auto')

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
          <Field label="Longitud del resumen">
            <Segmented<string>
              label="Longitud del resumen"
              value={length}
              onChange={setLength}
              options={[
                { value: 'short', label: 'Corto', icon: AlignLeft, desc: 'Un párrafo de 3 a 5 frases.' },
                { value: 'medium', label: 'Medio', icon: List, desc: 'De 5 a 10 viñetas con lo esencial.' },
                { value: 'long', label: 'Detallado', icon: ListTree, desc: 'Por secciones, con títulos y viñetas.' },
              ]}
            />
          </Field>
          <Field label="Idioma del resumen">
            <select className={inputCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="auto">El mismo del documento</option>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="fr">Francés</option>
              <option value="de">Alemán</option>
              <option value="pt">Portugués</option>
              <option value="it">Italiano</option>
            </select>
          </Field>
        </>
      }
      action={{
        label: 'Resumir PDF',
        disabled: !numPages || !!blocker,
        onClick: () => run(async (progress) => {
          const pages = await pdfPageTexts(await loadPdf(file), (f) => progress(f * 0.1))
          const text = await summarize(pages.join('\n\n'), { length, language }, (f) => progress(0.1 + f * 0.9))
          return [{ name: `${baseName(file)}_resumen.md`, blob: new Blob([text], { type: 'text/markdown;charset=utf-8' }), preview: text }]
        }),
      }}
    />
  )
}

export default function Summarize() {
  return <ToolFrame id="summarize" accept=".pdf" notice={AI_NOTICE}>{(ctx) => <SummarizeWork {...ctx} />}</ToolFrame>
}
