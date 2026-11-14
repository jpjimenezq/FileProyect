import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Button } from '../components/ui'
import { ToolFrame } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { IMAGE_ACCEPT, JpgWork } from './JpgToPdf'

function Thumb({ file, n }: { file: File; n: number }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <div className="relative h-20 w-16 overflow-hidden rounded-lg bg-black">
      {url && <img src={url} alt={`Página ${n}`} draggable={false} className="h-full w-full object-cover" />}
      <span className="absolute bottom-0 left-0 rounded-tr-md bg-ink/80 px-1.5 text-[11px] font-semibold">{n}</span>
    </div>
  )
}

function CameraCapture({ onDone, onClose }: { onDone: (files: File[]) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | undefined>(undefined)
  const [shots, setShots] = useState<File[]>([])
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop())
        stream.current = s
        if (video.current) video.current.srcObject = s
      })
      .catch(() => setError('No se pudo acceder a la cámara. Revisa los permisos del navegador.'))
    return () => { alive = false; stream.current?.getTracks().forEach((t) => t.stop()) }
  }, [])

  const capture = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => b && setShots((s) => [...s, new File([b], `escaneo-${s.length + 1}.jpg`, { type: 'image/jpeg' })]), 'image/jpeg', 0.9)
  }

  return (
    <div className="mx-auto mt-6 flex max-w-3xl flex-col items-center gap-4 rounded-2xl bg-ink p-4 text-white">
      <div className="flex w-full items-center justify-between">
        <p className="font-medium">Cámara · {shots.length} {shots.length === 1 ? 'página' : 'páginas'}</p>
        <button type="button" aria-label="Cerrar cámara" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"><X /></button>
      </div>
      {error ? <p className="py-10 text-red-300">{error}</p> : <video ref={video} autoPlay playsInline muted className="w-full rounded-lg bg-black" />}
      {shots.length > 0 && (
        <ul className="flex w-full gap-2 overflow-x-auto pb-1" aria-label="Páginas capturadas">
          {shots.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative shrink-0">
              <Thumb file={f} n={i + 1} />
              <button type="button" aria-label={`Quitar página ${i + 1}`} title="Quitar" onClick={() => setShots((s) => s.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink shadow hover:bg-red-600 hover:text-white"><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" icon={Camera} onClick={capture} disabled={!!error} className="px-6 py-3 text-base">Capturar</Button>
        <Button variant="secondary" onClick={() => onDone(shots)} disabled={!shots.length} className="px-6 py-3 text-base">Terminar</Button>
      </div>
    </div>
  )
}

function CameraOpener({ ctx }: { ctx: FrameCtx }) {
  const [open, setOpen] = useState(false)
  if (open) return <CameraCapture onClose={() => setOpen(false)} onDone={(f) => ctx.setFiles(f)} />
  return (
    <div className="mt-6 flex justify-center">
      <Button variant="secondary" icon={Camera} onClick={() => setOpen(true)} className="border-2 border-brand px-6 py-3 text-base text-brand hover:bg-brand/10">Usar la cámara</Button>
    </div>
  )
}

export default function Scan() {
  return (
    <ToolFrame id="scan" accept={IMAGE_ACCEPT} multiple emptyExtra={(ctx) => <CameraOpener ctx={ctx} />}>
      {(ctx) => <JpgWork {...ctx} outName="escaneo.pdf" />}
    </ToolFrame>
  )
}
