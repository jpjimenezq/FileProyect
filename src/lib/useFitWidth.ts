import { useEffect, useState } from 'react'

/** Ancho para dibujar una página: el deseado, o el que quepa en pantallas estrechas (móviles y tabletas en vertical) */
export function useFitWidth(preferred: number, margin = 76) {
  const [w, setW] = useState(() => Math.min(preferred, window.innerWidth - margin))
  useEffect(() => {
    const on = () => setW(Math.max(220, Math.min(preferred, window.innerWidth - margin)))
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [preferred, margin])
  return w
}
