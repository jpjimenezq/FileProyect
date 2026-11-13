import { useEffect, useState } from 'react'
import type { Output } from '../components/ToolFrame'

export interface Capabilities {
  bins: Record<string, boolean>
  /** Hay clave de DeepSeek configurada en el servidor */
  ai: boolean
  tools: Record<string, boolean>
}

/** Error del servidor con el código que permite mostrar "crea una cuenta" o "mejora a Pro" */
export class ApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
  get needsUpgrade() {
    return this.code === 'login' || this.code === 'quota'
  }
}

/** null = comprobando, 'offline' = no hay servidor */
export function useCapabilities() {
  const [caps, setCaps] = useState<Capabilities | null | 'offline'>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/capabilities').then(
      (r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))),
    ).then(
      (c: Capabilities) => alive && setCaps(c),
      () => alive && setCaps('offline'),
    )
    return () => { alive = false }
  }, [])
  return caps
}

/** POST JSON a la API; lanza ApiError con el mensaje y el código del servidor */
export async function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? 'Error del servidor.', data.code)
  return data as T
}

/** Sube el archivo al backend y devuelve el resultado; usa XHR para tener progreso de subida */
export function callTool(id: string, file: File, options: Record<string, unknown>, onProgress: (fraction: number) => void) {
  return new Promise<Output>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/tools/${id}`)
    xhr.responseType = 'blob'
    // la subida ocupa el 70% de la barra; el resto es el procesado en el servidor
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 0.7)
    xhr.upload.onload = () => onProgress(0.75)
    xhr.onerror = () => reject(new ApiError('No se pudo conectar con el servidor.'))
    xhr.ontimeout = () => reject(new ApiError('El servidor tardó demasiado en responder.'))
    xhr.timeout = 10 * 60 * 1000
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const disposition = xhr.getResponseHeader('Content-Disposition') ?? ''
        const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
        const plain = /filename="([^"]+)"/i.exec(disposition)?.[1]
        const note = xhr.getResponseHeader('X-Result-Note')
        onProgress(1)
        resolve({ name: utf8 ? decodeURIComponent(utf8) : (plain ?? 'resultado'), blob: xhr.response, note: note ? decodeURIComponent(note) : undefined })
      } else {
        let message = 'El servidor no pudo procesar el archivo.'
        let code: string | undefined
        try {
          const data = JSON.parse(await (xhr.response as Blob).text())
          message = data.error ?? message
          code = data.code
        } catch { /* respuesta sin JSON */ }
        reject(new ApiError(message, code))
      }
    }
    const body = new FormData()
    body.append('options', JSON.stringify(options))
    body.append('file', file)
    xhr.send(body)
  })
}
