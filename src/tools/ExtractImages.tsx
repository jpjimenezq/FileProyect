import { useState } from 'react'
import { Image as ImageIcon, Images } from 'lucide-react'
import { PdfCard } from '../components/FileCards'
import { Segmented } from '../components/Illustrate'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { extractImages } from '../lib/pdf/images'
import { usePdf } from '../lib/usePdf'

function ImagesWork({ files, run, reset }: FrameCtx) {
  const file = files[0]
  const { numPages } = usePdf(file)
  const [min, setMin] = useState(120)

  return (
    <Workspace
      main={<div className="flex justify-center"><PdfCard file={file} showPages onRemove={reset} /></div>}
      side={
        <Field label="Qué imágenes sacar">
          <Segmented<number>
            label="Tamaño mínimo"
            value={min}
            onChange={setMin}
            options={[
              { value: 120, label: 'Solo las grandes', icon: ImageIcon, desc: 'Ignora iconos, líneas y adornos pequeños.' },
              { value: 1, label: 'Todas', icon: Images, desc: 'Incluye todas, hasta las más pequeñas.' },
            ]}
          />
        </Field>
      }
      action={{
        label: 'Extraer imágenes',
        disabled: !numPages,
        onClick: () => run(async (progress) => {
          const { files: found, skipped } = await extractImages(file, min, progress)
          if (!found.length) throw new Error(skipped ? `Las imágenes de este PDF son escaneos en blanco y negro comprimidos o usan un formato poco habitual (${skipped}). Para esas páginas usa «PDF a JPG».` : 'No se encontraron imágenes en el PDF.')
          const note = skipped ? `${skipped} ${skipped === 1 ? 'imagen es un escaneo comprimido o de un formato poco habitual y no se pudo extraer' : 'imágenes son escaneos comprimidos o de un formato poco habitual y no se pudieron extraer'}; para esas páginas usa «PDF a JPG».` : undefined
          return found.map((f, i) => ({ ...f, note: i === 0 ? note : undefined }))
        }),
      }}
    />
  )
}

export default function ExtractImages() {
  return <ToolFrame id="extract-images" accept=".pdf">{(ctx) => <ImagesWork {...ctx} />}</ToolFrame>
}
