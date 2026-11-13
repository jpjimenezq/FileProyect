import { useEffect, useState } from 'react'
import type { Output } from '../components/ToolFrame'
import { supabase } from './supabase'

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


/** Motivo por el que se cerró la sesión desde fuera de los formularios (token caducado o cuenta bloqueada) */
export interface SessionLoss { code: 'session' | 'banned'; message: string }
const lossListeners = new Set<(loss: SessionLoss) => void>()
export function onSessionLoss(fn: (loss: SessionLoss) => void) {
  lossListeners.add(fn)
  return () => { lossListeners.delete(fn) }
}
async function endSession(loss: SessionLoss) {
  try { await supabase?.auth.signOut({ scope: 'local' }) } catch { /* ya estaba cerrada */ }
  lossListeners.forEach((fn) => fn(loss))
}

/** Token de acceso de Supabase de la sesión actual (undefined sin Supabase o sin sesión) */
export async function accessToken(): Promise<string | undefined> {
  if (!supabase) return undefined
  try { return (await supabase.auth.getSession()).data.session?.access_token } catch { return undefined }
}

/** Intenta renovar la sesión una vez; devuelve el token nuevo o undefined si no se pudo */
async function renewToken(): Promise<string | undefined> {
  if (!supabase) return undefined
  try {
    const { data, error } = await supabase.auth.refreshSession()
    return error ? undefined : data.session?.access_token
  } catch { return undefined }
}

/** Código de error del servidor ('session', 'banned'…) en una respuesta JSON, sin consumir la original */
async function errorCode(res: Response): Promise<{ code?: string; error?: string }> {
  return res.clone().json().catch(() => ({}))
}

/** Reacciona a 401 'session' (renovar y repetir) y 403 'banned' (cerrar sesión) de un resultado ya recibido. Devuelve true si hay que repetir con el token nuevo */
async function handleAuthFailure(status: number, body: { code?: string; error?: string }, retried: boolean): Promise<string | undefined | false> {
  if (!supabase) return false
  if (status === 401 && body.code === 'session') {
    if (!retried) {
      const fresh = await renewToken()
      if (fresh) return fresh
    }
    await endSession({ code: 'session', message: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' })
  } else if (status === 403 && body.code === 'banned') {
    await endSession({ code: 'banned', message: body.error ?? 'Tu cuenta está suspendida. Si crees que es un error, contacta con soporte.' })
  }
  return false
}

/** fetch a la API del backend con `Authorization: Bearer` si hay sesión de Supabase; renueva el token una vez si caducó */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = (token?: string) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(url, { ...init, headers })
  }
  let res = await send(await accessToken())
  if (supabase && (res.status === 401 || res.status === 403)) {
    const fresh = await handleAuthFailure(res.status, await errorCode(res), false)
    if (fresh) {
      res = await send(fresh)
      if (res.status === 401) await handleAuthFailure(401, await errorCode(res), true)
    }
  }
  return res
}

/** null = comprobando, 'offline' = no hay servidor */
export function useCapabilities() {
  const [caps, setCaps] = useState<Capabilities | null | 'offline'>(null)
  useEffect(() => {
    let alive = true
    apiFetch('/api/capabilities').then(
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
    res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? 'Error del servidor.', data.code)
  return data as T
}

/** Sube el archivo al backend y devuelve el resultado; usa XHR para tener progreso de subida */
export function callTool(id: string, file: File, options: Record<string, unknown>, onProgress: (fraction: number) => void) {
  const attempt = (token: string | undefined, retried: boolean) => new Promise<Output>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/tools/${id}`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
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
        const fresh = await handleAuthFailure(xhr.status, { code, error: message }, retried)
        if (fresh) { attempt(fresh, true).then(resolve, reject); return }
        reject(new ApiError(message, code))
      }
    }
    const body = new FormData()
    body.append('options', JSON.stringify(options))
    body.append('file', file)
    xhr.send(body)
  })
  return accessToken().then((token) => attempt(token, false))
}
