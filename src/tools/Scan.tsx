import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { ToolFrame } from '../components/ToolFrame'
import type { FrameCtx } from '../components/ToolFrame'
import { IMAGE_ACCEPT, JpgWork } from './JpgToPdf'

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
    <div className="mx-auto mt-6 flex max-w-3xl flex-col items-center gap-4 rounded-2xl bg-gray-900 p-4 text-white">
      <div className="flex w-full items-center justify-between">
        <p className="font-medium">Cámara · {shots.length} foto(s)</p>
        <button aria-label="Cerrar cámara" onClick={onClose}><X /></button>
      </div>
      {error ? <p className="py-10 text-red-300">{error}</p> : <video ref={video} autoPlay playsInline muted className="w-full rounded-lg bg-black" />}
      <div className="flex gap-3">
        <button onClick={capture} disabled={!!error} className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold disabled:opacity-40"><Camera size={18} /> Capturar</button>
        <button onClick={() => onDone(shots)} disabled={!shots.length} className="rounded-xl bg-white px-6 py-3 font-semibold text-gray-900 disabled:opacity-40">Terminar</button>
      </div>
    </div>
  )
}

function CameraOpener({ ctx }: { ctx: FrameCtx }) {
  const [open, setOpen] = useState(false)
  if (open) return <CameraCapture onClose={() => setOpen(false)} onDone={(f) => ctx.setFiles(f)} />
  return (
    <div className="mt-6 flex justify-center">
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl border-2 border-brand px-6 py-3 font-semibold text-brand hover:bg-brand/10">
        <Camera size={20} /> Usar la cámara
      </button>
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
