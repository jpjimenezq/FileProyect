import { useEffect, useMemo, useState } from 'react'
import type { Output } from './ToolFrame'
import { ImageLightbox, PdfLightbox } from './Lightbox'
import { PageThumb } from './PageThumb'
import { usePdf } from '../lib/usePdf'

const isPdf = (o: Output) => o.blob.type === 'application/pdf' || o.name.toLowerCase().endsWith('.pdf')
const isImage = (o: Output) => o.blob.type.startsWith('image/')

function PdfPreview({ output, all }: { output: Output; all: boolean }) {
  const file = useMemo(() => new File([output.blob], output.name, { type: 'application/pdf' }), [output])
  const { pdf, numPages } = usePdf(file)
  const [open, setOpen] = useState<number>()
  const shown = all ? Math.min(numPages, 8) : Math.min(numPages, 1)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex flex-wrap justify-center gap-3">
        {pdf && Array.from({ length: shown }, (_, i) => (
          <button key={i} onClick={() => setOpen(i + 1)} aria-label={`Ver la página ${i + 1} en grande`} className="flex flex-col items-center rounded-lg p-1 transition hover:bg-brand/10">
            <PageThumb pdf={pdf} pageNum={i + 1} width={all ? 120 : 110} zoom={false} />
            <span className="text-xs text-ink/55">{all ? i + 1 : output.name}</span>
          </button>
        ))}
        {!pdf && <span className="h-40 w-28 animate-pulse rounded bg-ink/10" />}
      </div>
      {all && numPages > shown && <p className="text-xs text-ink/50">y {numPages - shown} páginas más</p>}
      {open && pdf && <PdfLightbox pdf={pdf} page={open} onPage={setOpen} onClose={() => setOpen(undefined)} />}
    </div>
  )
}

function ImagePreview({ output }: { output: Output }) {
  const [url, setUrl] = useState<string>()
  const [big, setBig] = useState(false)
  useEffect(() => {
    const u = URL.createObjectURL(output.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [output])
  return (
    <figure className="flex flex-col items-center gap-1">
      <button type="button" onClick={() => setBig(true)} aria-label={`Ver ${output.name} en grande`} className="flex h-28 w-28 cursor-zoom-in items-center justify-center overflow-hidden rounded-lg bg-white shadow transition hover:shadow-lg [background-image:repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] [background-size:12px_12px]">
        {url && <img src={url} alt={output.name} className="max-h-full max-w-full" />}
      </button>
      {big && url && <ImageLightbox src={url} name={output.name} onClose={() => setBig(false)} />}
      <figcaption className="max-w-28 truncate text-xs text-ink/55" title={output.name}>{output.name}</figcaption>
    </figure>
  )
}

/** Cómo ha quedado el resultado, antes de descargarlo: páginas del PDF nuevo (clic para ampliar) o miniaturas de las imágenes */
export function ResultPreview({ outputs }: { outputs: Output[] }) {
  const pdfs = outputs.filter(isPdf)
  const images = outputs.filter(isImage)
  if (!pdfs.length && !images.length) return null

  return (
    <div className="w-full rounded-2xl border border-line bg-paper p-4">
      <p className="mb-3 text-center text-sm font-semibold">Así ha quedado <span className="font-normal text-ink/50">· haz clic en una página para verla en grande</span></p>
      <div className="thin-scroll flex max-h-[26rem] flex-wrap justify-center gap-4 overflow-y-auto">
        {pdfs.slice(0, 12).map((o, i) => <PdfPreview key={`${o.name}-${i}`} output={o} all={pdfs.length === 1} />)}
        {images.slice(0, 12).map((o, i) => <ImagePreview key={`${o.name}-${i}`} output={o} />)}
      </div>
      {pdfs.length + images.length > 12 && <p className="mt-2 text-center text-xs text-ink/50">Se muestran los primeros 12 archivos.</p>}
    </div>
  )
}
