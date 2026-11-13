import { useEffect, useState } from 'react'
import { ImageLightbox, ZoomButton } from './Lightbox'
import { pageFor } from '../lib/pdf/pagefit'
import type { ImageOptions } from '../lib/pdf/ops'

/** Tamaño de la hoja de muestra: algo menor en pantallas estrechas para que quepan dos por fila */
const useCompact = () => {
  const q = '(max-width: 479px)'
  const [compact, setCompact] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setCompact(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return compact
}

/** Cómo quedará la hoja: tamaño, orientación y margen elegidos, con la foto (y su giro) dentro */
export function PagePreview({ file, opts, turn = 0 }: { file: File; opts: ImageOptions; turn?: number }) {
  const [url, setUrl] = useState<string>()
  const [dims, setDims] = useState<{ w: number; h: number }>()
  const [big, setBig] = useState(false)
  const compact = useCompact()
  const BOX_W = compact ? 132 : 176
  const BOX_H = compact ? 152 : 200

  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    const img = new window.Image()
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = u
    return () => URL.revokeObjectURL(u)
  }, [file])

  const swap = turn % 180 !== 0
  const shown = dims ? { width: swap ? dims.h : dims.w, height: swap ? dims.w : dims.h } : { width: 3, height: 4 }
  const { pw, ph, w, h } = pageFor(shown, opts)
  const s = Math.min(BOX_W / pw, BOX_H / ph)

  return (
    <div className="group/zoom relative flex items-center justify-center" style={{ width: BOX_W, height: BOX_H }}>
      <div className="relative flex items-center justify-center bg-white shadow-md ring-1 ring-ink/10 transition-all duration-200" style={{ width: pw * s, height: ph * s }}>
        {url && dims && (
          <div className="relative" style={{ width: w * s, height: h * s }}>
            <img
              src={url}
              alt={file.name}
              draggable={false}
              className="absolute left-1/2 top-1/2 max-w-none transition-transform duration-200"
              style={{ width: (swap ? h : w) * s, height: (swap ? w : h) * s, transform: `translate(-50%, -50%) rotate(${turn}deg)` }}
            />
          </div>
        )}
        {url && <ZoomButton onOpen={() => setBig(true)} />}
      </div>
      {big && url && <ImageLightbox src={url} name={file.name} turn={turn} onClose={() => setBig(false)} />}
    </div>
  )
}
