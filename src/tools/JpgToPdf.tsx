import { useState } from 'react'
import { AddMore } from '../components/Dropzone'
import { RemoveButton } from '../components/FileCards'
import { PagePreview } from '../components/PagePreview'
import { FileText, Maximize, RectangleHorizontal, RectangleVertical, RotateCw } from 'lucide-react'
import { Segmented } from '../components/Illustrate'
import { SortableGrid } from '../components/SortableGrid'
import { Field, ToolFrame, Workspace } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { pdfBlob } from '../lib/pdf/ops'
import { prepareImage, preparedToPdf } from '../lib/doc/photos'
import type { ImageOptions } from '../lib/pdf/ops'

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'

export function JpgWork({ files, setFiles, addFiles, run, outName = 'imagenes.pdf' }: FrameCtx & { outName?: string }) {
  const [opts, setOpts] = useState<ImageOptions>({ orientation: 'auto', size: 'a4', margin: 20 })
  const set = <K extends keyof ImageOptions>(k: K, v: ImageOptions[K]) => setOpts((o) => ({ ...o, [k]: v }))

  return (
    <Workspace
      main={
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ink/60">Arrastra las imágenes para cambiar el orden.</p>
            <AddMore accept={IMAGE_ACCEPT} onFiles={addFiles} label="Añadir imágenes" />
          </div>
          <SortableGrid
            minCol="9rem"
            items={files}
            keyOf={(f, i) => `${f.name}-${f.size}-${i}`}
            onChange={setFiles}
            render={(f) => (
              <div className="relative flex w-36 flex-col items-center gap-2 sm:w-44">
                <RemoveButton onClick={() => setFiles(files.filter((x) => x !== f))} />
                <PagePreview file={f} opts={opts} />
                <p className="w-full truncate text-center text-xs font-medium" title={f.name}>{f.name}</p>
              </div>
            )}
          />
        </>
      }
      side={
        <>
          <Field label="Tamaño de página">
            <Segmented<ImageOptions['size']>
              label="Tamaño de página"
              value={opts.size}
              onChange={(v) => set('size', v)}
              options={[
                { value: 'a4', label: 'A4', icon: FileText },
                { value: 'letter', label: 'Carta', icon: FileText },
                { value: 'fit', label: 'Como la imagen', icon: Maximize, desc: 'Cada página tiene justo el tamaño de su imagen.' },
              ]}
            />
          </Field>
          {opts.size !== 'fit' && (
            <Field label="Orientación">
              <Segmented<ImageOptions['orientation']>
                label="Orientación"
                value={opts.orientation}
                onChange={(v) => set('orientation', v)}
                options={[
                  { value: 'auto', label: 'Automática', icon: RotateCw, desc: 'Vertical u horizontal según cada imagen.' },
                  { value: 'portrait', label: 'Vertical', icon: RectangleVertical },
                  { value: 'landscape', label: 'Horizontal', icon: RectangleHorizontal },
                ]}
              />
            </Field>
          )}
          <Field label="Margen">
            <Segmented<number>
              label="Margen"
              value={opts.margin}
              onChange={(v) => set('margin', v)}
              options={[{ value: 0, label: 'Ninguno' }, { value: 20, label: 'Pequeño' }, { value: 50, label: 'Grande' }]}
            />
          </Field>
        </>
      }
      action={{
        label: 'Convertir a PDF',
        onClick: () => run(async (progress) => {
          const images = []
          for (const [i, f] of files.entries()) { images.push(await prepareImage(f)); progress(((i + 1) / files.length) * 0.4) }
          return [{ name: outName, blob: pdfBlob(await preparedToPdf(images, opts, (p) => progress(0.4 + p * 0.6))) }]
        }),
      }}
    />
  )
}

export default function JpgToPdf() {
  return <ToolFrame id="jpg-to-pdf" accept={IMAGE_ACCEPT} multiple>{(ctx) => <JpgWork {...ctx} />}</ToolFrame>
}
