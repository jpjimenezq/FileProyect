import { useRef, useState } from 'react'
import { FilePlus2, MousePointerClick, UploadCloud } from 'lucide-react'
import { MAX_SIZE, matchesAccept } from '../lib/files'

const LIMIT_MB = Math.round(MAX_SIZE / 1024 / 1024)

/** Descripción corta de lo que admite la zona, a partir de `accept` */
export function acceptHint(accept: string): string {
  const a = accept.toLowerCase()
  const parts = a.split(',').map((s) => s.trim())
  let kind = 'Archivos'
  if (parts.every((p) => p === '.pdf' || p === 'application/pdf')) kind = 'PDF'
  else if (parts.every((p) => p.startsWith('image/') || /^\.(jpe?g|png|webp|gif|bmp|tiff?)$/.test(p))) kind = 'Imágenes'
  else if (parts.length <= 4 && parts.every((p) => /^\.[a-z0-9]+$/.test(p))) kind = parts.map((p) => p.slice(1).toUpperCase()).join(', ')
  return `${kind} · hasta ${LIMIT_MB} MB`
}

interface Props {
  accept: string
  multiple?: boolean
  label: string
  onFiles: (files: File[]) => void
  onError: (message: string) => void
}

export function Dropzone({ accept, multiple, label, onFiles, onError }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const handle = (list: FileList | null) => {
    const all = Array.from(list ?? [])
    const valid = all.filter((f) => matchesAccept(f, accept) && f.size <= MAX_SIZE)
    if (valid.length < all.length) onError('Algunos archivos no son del tipo correcto o superan los 100 MB.')
    if (valid.length) onFiles(multiple ? valid : valid.slice(0, 1))
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files) }}
      className={`dots mx-auto flex max-w-3xl flex-col items-center gap-5 rounded-3xl border-2 border-dashed px-5 py-12 text-center transition sm:px-6 md:py-20 ${over ? 'scale-[1.01] border-brand bg-brand/10' : 'border-ink/25 bg-white'}`}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-lime text-ink shadow-sm"><UploadCloud size={30} /></span>
      <div>
        <p className="font-display text-xl font-bold sm:text-2xl">
          <span className="pointer-coarse:hidden">Suelta {multiple ? 'tus archivos' : 'tu archivo'} aquí</span>
          <span className="hidden pointer-coarse:inline">Sube {multiple ? 'tus archivos' : 'tu archivo'}</span>
        </p>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-ink/60"><MousePointerClick size={14} className="pointer-coarse:hidden" /> <span className="pointer-coarse:hidden">o elígelo desde tu equipo</span><span className="hidden pointer-coarse:inline">desde tu dispositivo</span></p>
      </div>
      <button type="button" onClick={() => input.current?.click()} className="min-h-12 rounded-2xl bg-ink px-8 py-3 text-lg font-semibold text-white shadow-lg transition hover:bg-brand active:scale-[0.98]">
        {label}
      </button>
      <p className="-mt-2 text-xs text-ink/55">{acceptHint(accept)}</p>
      <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { handle(e.target.files); e.target.value = '' }} />
    </div>
  )
}

const matchFiles = (list: FileList | null, accept: string) => Array.from(list ?? []).filter((f) => matchesAccept(f, accept) && f.size <= MAX_SIZE)

export function AddMore({ accept, onFiles, label = 'Añadir más archivos' }: { accept: string; onFiles: (f: File[]) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium transition hover:border-brand hover:text-brand">
        <FilePlus2 size={16} /> {label}
      </button>
      <input ref={input} type="file" hidden multiple accept={accept} onChange={(e) => { onFiles(matchFiles(e.target.files, accept)); e.target.value = '' }} />
    </>
  )
}
