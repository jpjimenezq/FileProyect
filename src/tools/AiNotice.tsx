import { useCapabilities } from '../lib/api'

export const AI_NOTICE =
  'Esta herramienta usa IA: el texto del documento se procesa con un proveedor externo (DeepSeek). Evítala con documentos confidenciales.'

/** Devuelve el motivo por el que la IA no se puede usar, o undefined si está disponible */
export function useAiBlocker() {
  const caps = useCapabilities()
  if (caps === null) return 'Comprobando…'
  if (caps === 'offline') return 'No hay conexión. Inténtalo de nuevo en unos segundos.'
  if (!caps.ai) return 'La IA no está disponible en este momento.'
  return undefined
}

export function AiBanner({ blocker }: { blocker?: string }) {
  if (!blocker) return null
  return <p role="alert" className="max-w-md rounded-lg bg-yellow-50 p-3 text-center text-sm text-yellow-800">{blocker}</p>
}
