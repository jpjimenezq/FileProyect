import { useEffect } from 'react'

/** Calcula el porcentaje relleno de un deslizador y lo guarda en --p (lo usa el CSS de input[type=range]) */
export function paintRange(el: HTMLInputElement) {
  const min = Number(el.min || 0)
  const max = Number(el.max || 100)
  const pct = max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0
  el.style.setProperty('--p', `${Math.min(100, Math.max(0, pct))}%`)
}

/** Pinta el relleno de TODOS los deslizadores sueltos dentro de `root` (también los que no usan <Slider>) */
export function useRangeFill(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const sweep = () => el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(paintRange)
    const onInput = (e: Event) => { if (e.target instanceof HTMLInputElement && e.target.type === 'range') paintRange(e.target) }
    sweep()
    el.addEventListener('input', onInput)
    // cambios hechos desde React (valor controlado) o deslizadores que aparecen después
    const mo = new MutationObserver(sweep)
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['value', 'min', 'max'] })
    return () => { el.removeEventListener('input', onInput); mo.disconnect() }
  }, [root])
}
