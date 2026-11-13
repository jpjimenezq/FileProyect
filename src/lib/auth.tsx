import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ApiError, apiFetch, onSessionLoss, postJson } from './api'
import { supabase } from './supabase'

export interface PlanLimits {
  name: string
  jobsPerDay: number
  maxFileMB: number
  aiCharsPerMonth: number
}

export interface Me {
  user: { email: string; name?: string | null; role?: 'user' | 'admin'; plan: 'free' | 'pro'; until: number | null; subscribed: boolean } | null
  plan: 'anon' | 'free' | 'pro'
  limits: PlanLimits
  plans: Record<'anon' | 'free' | 'pro', PlanLimits>
  usage: { jobsToday: number; aiCharsMonth: number }
  prices: { month: { eur: number; label: string }; year: { eur: number; label: string } }
  billing: boolean
  ai: boolean
}

type MeUser = NonNullable<Me['user']>

interface AuthValue {
  /** undefined mientras se comprueba la sesión */
  me: Me | undefined
  user: MeUser | null
  isAdmin: boolean
  /** true si la web inicia sesión con Supabase; false = modo antiguo con cookies */
  supabaseOn: boolean
  /** Aviso por una sesión cerrada desde fuera (caducada o cuenta bloqueada) */
  notice: string | undefined
  clearNotice: () => void
  /** El usuario llegó con un enlace de recuperación válido y puede elegir contraseña */
  recovering: boolean
  refresh: () => Promise<void>
  /** El servidor no respondió al pedir la cuenta (la web sigue funcionando para las herramientas locales) */
  offline: boolean
  signIn: (email: string, password: string) => Promise<void>
  /** Devuelve needsConfirmation=true si hay que confirmar el correo antes de entrar */
  signUp: (email: string, password: string, acceptTerms: boolean) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  /** `token` solo se usa en el modo antiguo (enlace del correo con ?token=) */
  updatePassword: (password: string, token?: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export const GOOGLE_OFF = 'El acceso con Google aún no está configurado.'

/** Traduce los errores de Supabase Auth a mensajes en español */
function authError(err: unknown, fallback: string): ApiError {
  if (err instanceof ApiError) return err
  const e = err as { code?: string; message?: string; status?: number } | undefined
  const code = e?.code
  const msg = (e?.message ?? '').toLowerCase()
  const text =
    code === 'invalid_credentials' || msg.includes('invalid login') ? 'Correo o contraseña incorrectos.'
    : code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered') ? 'Ya existe una cuenta con ese correo. Entra o recupera tu contraseña.'
    : code === 'email_not_confirmed' ? 'Confirma tu correo antes de entrar: te hemos enviado un enlace.'
    : code === 'weak_password' ? 'La contraseña es demasiado débil. Usa al menos 8 caracteres.'
    : code === 'same_password' ? 'La contraseña nueva debe ser distinta de la anterior.'
    : code === 'signup_disabled' ? 'El registro de cuentas está desactivado ahora mismo.'
    : code === 'validation_failed' && msg.includes('email') ? 'Escribe un correo válido.'
    : code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || e?.status === 429 ? 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
    : code === 'user_banned' ? 'Tu cuenta está suspendida. Si crees que es un error, contacta con soporte.'
    : msg.includes('failed to fetch') || msg.includes('networkerror') ? 'No se pudo conectar con el servidor.'
    : msg.includes('auth session missing') || code === 'session_not_found' ? 'El enlace ha caducado o ya se usó. Pide uno nuevo.'
    : fallback
  return new ApiError(text, code)
}

/** Vista de invitado derivada de la última respuesta, para no mostrar «Cargando…» al salir */
const asGuest = (prev: { me: Me; uid: string | null } | undefined) =>
  prev && { uid: null, me: { ...prev.me, user: null, plan: 'anon' as const, limits: prev.me.plans.anon, usage: { jobsToday: 0, aiCharsMonth: 0 } } }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<{ me: Me; uid: string | null }>()
  const [session, setSession] = useState<Session | null>(null)
  // sin Supabase no hay que esperar a ninguna sesión
  const [ready, setReady] = useState(!supabase)
  const [notice, setNotice] = useState<string>()
  const [recovering, setRecovering] = useState(false)
  const [offline, setOffline] = useState(false)
  const latest = useRef(0)
  const uid = session?.user.id ?? null

  const refresh = useCallback(async () => {
    const n = ++latest.current
    try {
      const r = await apiFetch('/api/me')
      if (n === latest.current) setOffline(r.status >= 500)
      if (!r.ok || n !== latest.current) return
      const body = (await r.json()) as Me
      // se guarda con el usuario de Supabase con el que se pidió, para no mostrar datos de otra sesión
      const owner = supabase ? ((await supabase.auth.getSession()).data.session?.user.id ?? null) : null
      if (n === latest.current) setStored({ me: body, uid: owner })
    } catch {
      // sin servidor: la web sigue funcionando para las herramientas locales
      if (n === latest.current) setOffline(true)
    }
  }, [])

  // sesión de Supabase: la actual y los cambios (entrar, salir, renovar, recuperar contraseña)
  useEffect(() => {
    if (!supabase) return
    let alive = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      setReady(true)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') setRecovering(false)
    })
    return () => { alive = false; data.subscription.unsubscribe() }
  }, [])

  useEffect(() => onSessionLoss((loss) => { setNotice(loss.message); setStored(asGuest) }), [])

  // /api/me con el token; se repite al cambiar de usuario (no en cada renovación del token)
  useEffect(() => {
    if (ready) void refresh()
  }, [ready, uid, refresh])

  const me = ready && stored && stored.uid === uid ? stored.me : undefined

  const value = useMemo<AuthValue>(() => {
    const user = me?.user ?? null
    const base = { me, user, isAdmin: user?.role === 'admin', supabaseOn: !!supabase, notice, clearNotice: () => setNotice(undefined), recovering, refresh, offline }
    if (!supabase) {
      const setMe = (m: Me) => setStored({ me: m, uid: null })
      return {
        ...base,
        signIn: async (email, password) => setMe(await postJson<Me>('/api/auth/login', { email, password })),
        signUp: async (email, password, acceptTerms) => { setMe(await postJson<Me>('/api/auth/register', { email, password, acceptTerms })); return { needsConfirmation: false } },
        signOut: async () => { await postJson('/api/auth/logout'); await refresh() },
        resetPassword: async (email) => { await postJson('/api/auth/forgot', { email }) },
        updatePassword: async (password, token) => setMe(await postJson<Me>('/api/auth/reset', { token, password })),
        signInWithGoogle: async () => { throw new ApiError('El acceso con Google no está disponible en este modo.') },
      }
    }
    const sb = supabase
    return {
      ...base,
      signIn: async (email, password) => {
        setNotice(undefined)
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (error) throw authError(error, 'No se pudo iniciar sesión.')
      },
      signUp: async (email, password, acceptTerms) => {
        if (!acceptTerms) throw new ApiError('Debes aceptar los términos de uso y la política de privacidad.')
        setNotice(undefined)
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { accepted_terms_at: new Date().toISOString() }, emailRedirectTo: `${window.location.origin}/cuenta` } })
        if (error) throw authError(error, 'No se pudo crear la cuenta.')
        // con la confirmación de correo activada no hay sesión hasta pulsar el enlace; un correo ya registrado devuelve identities vacías
        if (!data.session && data.user && data.user.identities?.length === 0) throw authError({ code: 'user_already_exists' }, '')
        return { needsConfirmation: !data.session }
      },
      signOut: async () => {
        await sb.auth.signOut({ scope: 'local' })
        setStored(asGuest)
      },
      resetPassword: async (email) => {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/cuenta/restablecer` })
        if (error) throw authError(error, 'No se pudo enviar el enlace.')
      },
      updatePassword: async (password) => {
        const { error } = await sb.auth.updateUser({ password })
        if (error) throw authError(error, 'No se pudo cambiar la contraseña.')
        setRecovering(false)
        await refresh()
      },
      signInWithGoogle: async () => {
        const { data, error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/cuenta`, skipBrowserRedirect: true } })
        if (error || !data.url) throw authError(error, 'No se pudo abrir el acceso con Google.')
        // Si el proveedor está desactivado, Supabase responde con un JSON de error en vez de redirigir: se comprueba antes de salir de la web
        let probe: Response | undefined
        try { probe = await fetch(data.url, { redirect: 'manual' }) } catch { /* bloqueado por CORS: se deja seguir */ }
        if (probe && probe.type !== 'opaqueredirect' && !probe.ok) {
          const body = await probe.json().catch(() => ({})) as { msg?: string; error_description?: string; message?: string }
          const text = `${body.msg ?? ''} ${body.error_description ?? ''} ${body.message ?? ''}`.toLowerCase()
          throw new ApiError(text.includes('provider') || probe.status === 400 ? GOOGLE_OFF : 'No se pudo abrir el acceso con Google.', 'provider_disabled')
        }
        window.location.assign(data.url)
      },
    }
  }, [me, notice, recovering, refresh, offline])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return v
}

/** Caracteres de IA → páginas aproximadas (unos 3.000 caracteres por página) */
export const aiPages = (chars: number) => Math.round(chars / 3000)
