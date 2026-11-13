import { useState } from 'react'
import { FileImage, TextCursorInput } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { baseName } from '../lib/files'
import { flattenForms } from '../lib/pdf/clean'
import { pdfBlob } from '../lib/pdf/ops'
import { rasterizePdf } from '../lib/pdf/redact'
import { usePdf } from '../lib/usePdf'

type Mode = 'forms' | 'all'

function FlattenWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [mode, setMode] = useState<Mode>('forms')

  return (
    <Workspace
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={
        <Field label="Qué aplanar">
          <Segmented<Mode>
            label="Modo"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'forms', label: 'Formularios', icon: TextCursorInput, desc: 'Los campos rellenados pasan a ser texto fijo. El resto del PDF no cambia.' },
              { value: 'all', label: 'Todo', icon: FileImage, desc: 'Cada página se convierte en una imagen: nada se puede editar ni seleccionar. El archivo pesa más.' },
            ]}
          />
        </Field>
      }
      action={{
        label: 'Aplanar PDF',
        disabled: !numPages,
        onClick: () => run(async (progress) => {
          if (mode === 'all') return [{ name: `${baseName(file)}_aplanado.pdf`, blob: pdfBlob(await rasterizePdf(file, 2, progress)) }]
          const { bytes, fields } = await flattenForms(file)
          if (!fields) throw new Error('Este PDF no tiene campos de formulario. Prueba con «Todo» para convertir las páginas en imágenes.')
          return [{ name: `${baseName(file)}_aplanado.pdf`, blob: pdfBlob(bytes), note: `Se aplanaron ${fields} campo(s).` }]
        }),
      }}
    />
  )
}

export default function Flatten() {
  return <ToolFrame id="flatten" accept=".pdf">{(ctx) => <FlattenWork {...ctx} />}</ToolFrame>
}
