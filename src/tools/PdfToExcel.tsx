import { useState } from 'react'
import { Files, Sheet } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { ToolFrame, Workspace } from '../components/ToolFrame'
import { Checkbox } from '../components/ui'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { loadPdf } from '../lib/pdf/render'
import { blocksToSheets, extractBlocks, sheetsToXlsx } from '../lib/pdf/tables'
import type { ExcelOptions } from '../lib/pdf/tables'
import { usePdf } from '../lib/usePdf'

function ExcelWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [layout, setLayout] = useState<ExcelOptions['layout']>('pages')
  const [includeText, setIncludeText] = useState(false)
  return (
    <Workspace
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={
        <div className="space-y-4">
          <Segmented<ExcelOptions['layout']>
            label="Hojas"
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'pages', label: 'Una por página', icon: Files, desc: 'Cada página del PDF en su propia hoja.' },
              { value: 'one', label: 'Una sola', icon: Sheet, desc: 'Todas las tablas seguidas en una hoja.' },
            ]}
          />
          <Checkbox checked={includeText} onChange={setIncludeText} label="Incluir el texto que no está en tablas" description="Si es un escaneo, usa antes OCR." />
        </div>
      }
      action={{
        label: 'Convertir a Excel',
        disabled: !numPages,
        onClick: () => run(async (progress) => {
          const pages = await extractBlocks(await loadPdf(file), (f) => progress(f * 0.9))
          if (!pages.some((blocks) => blocks.length)) throw new Error('No se encontró texto en el PDF. Si es un escaneo, usa primero la herramienta OCR.')
          const sheets = blocksToSheets(pages, { layout, includeText })
          const buf = await sheetsToXlsx(sheets)
          const tables = pages.reduce((n, b) => n + b.filter((x) => x.kind === 'table').length, 0)
          return [{
            name: `${baseName(file)}.xlsx`,
            blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            sheets,
            note: tables ? `Se detectaron ${tables} ${tables === 1 ? 'tabla' : 'tablas'}.` : 'No se detectaron tablas claras: se copió el texto línea a línea.',
          }]
        }),
      }}
    />
  )
}

export default function PdfToExcel() {
  return <ToolFrame id="pdf-to-excel" accept=".pdf">{(ctx) => <ExcelWork {...ctx} />}</ToolFrame>
}
