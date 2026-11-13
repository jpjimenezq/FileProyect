import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, X } from 'lucide-react'
import { fmtSize } from '../lib/files'
import { usePdf } from '../lib/usePdf'
import { PageThumb } from './PageThumb'
import { ImageLightbox, ZoomButton } from './Lightbox'

export function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Quitar" className="absolute -right-2 -top-2 z-10 rounded-full bg-ink/80 p-1 text-white shadow hover:bg-brand">
      <X size={14} />
    </button>
  )
}

export function PdfCard({ file, onRemove, showPages }: { file: File; onRemove?: () => void; showPages?: boolean }) {
  const { pdf, numPages, error } = usePdf(file)
  return (
    <div className="relative flex w-52 flex-col items-center gap-2">
      {onRemove && <RemoveButton onClick={onRemove} />}
      {pdf ? (
        <PageThumb pdf={pdf} pageNum={1} width={180} />
      ) : (
        <div className={`flex h-[234px] w-[180px] flex-col items-center justify-center gap-2 bg-white p-3 text-center text-xs shadow ${error ? 'text-red-600' : 'text-ink/55'}`} role={error ? 'alert' : undefined}>
          {error ? <AlertCircle size={22} /> : <Loader2 size={22} className="animate-spin text-brand" />}
          {error ?? 'Cargando…'}
        </div>
      )}
      <p className="w-full truncate text-center text-xs font-medium" title={file.name}>{file.name}</p>
      <p className="text-xs text-ink/60">{fmtSize(file.size)}{showPages && numPages ? ` · ${numPages} págs.` : ''}</p>
    </div>
  )
}

export function ImageCard({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string>()
  const [big, setBig] = useState(false)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <div className="relative flex w-52 flex-col items-center gap-2">
      <RemoveButton onClick={onRemove} />
      <div className="group/zoom relative flex h-[234px] w-[180px] items-center justify-center bg-white shadow">
        {url && <img src={url} alt={file.name} className="max-h-full max-w-full" draggable={false} />}
        {url && <ZoomButton onOpen={() => setBig(true)} />}
      </div>
      {big && url && <ImageLightbox src={url} name={file.name} onClose={() => setBig(false)} />}
      <p className="w-full truncate text-center text-xs font-medium" title={file.name}>{file.name}</p>
      <p className="text-xs text-ink/60">{fmtSize(file.size)}</p>
    </div>
  )
}
