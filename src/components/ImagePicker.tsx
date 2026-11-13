import { useEffect, useRef, useState } from 'react'
import { UploadCloud, X } from 'lucide-react'
import { fmtSize, matchesAccept } from '../lib/files'

export const IMAGE_TYPES = 'image/jpeg,image/png,image/webp'

export function useObjectUrl(file?: File) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!file) { setUrl(undefined); return }
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url
}

/** Zona para elegir una imagen: clic o arrastrar; una vez elegida muestra miniatura, nombre y cómo cambiarla */
export function ImagePicker({ file, onChange }: { file?: File; onChange: (f?: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string>()
  const url = useObjectUrl(file)

  const take = (list: FileList | null) => {
    const f = list?.[0]
    if (!f) return
    if (!matchesAccept(f, IMAGE_TYPES)) return setError('Usa una imagen JPG, PNG o WebP.')
    setError(undefined)
    onChange(f)
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" hidden accept={IMAGE_TYPES} onChange={(e) => { take(e.target.files); e.target.value = '' }} />
      {file ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-2.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm [background-image:repeating-conic-gradient(#e7e1d5_0%_25%,#fff_0%_50%)] [background-size:12px_12px]">
            {url && <img src={url} alt="" className="max-h-full max-w-full" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold" title={file.name}>{file.name}</span>
            <span className="block text-xs text-ink/55">{fmtSize(file.size)}</span>
            <button onClick={() => input.current?.click()} className="mt-0.5 text-xs font-semibold text-brand hover:underline">Cambiar imagen</button>
          </span>
          <button onClick={() => onChange(undefined)} aria-label="Quitar imagen" className="rounded-full p-1.5 text-ink/45 hover:bg-ink/5 hover:text-ink"><X size={16} /></button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}
          className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${over ? 'border-brand bg-brand/10' : 'border-ink/25 hover:border-brand hover:bg-brand/5'}`}
        >
          <UploadCloud size={26} className="text-brand" />
          <span className="text-sm font-semibold">Elegir una imagen</span>
          <span className="text-xs text-ink/55">o arrástrala aquí · JPG, PNG o WebP</span>
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
