import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Gift, LogOut, ShieldCheck, Sparkles } from 'lucide-react'
import { ApiError, postJson } from '../lib/api'
import { aiPages, useAuth } from '../lib/auth'
import type { Me } from '../lib/auth'
import { inputCls } from '../components/ToolFrame'
import { Button, Checkbox, Notice } from '../components/ui'

function Meter({ label, used, limit, unit }: { label: string; used: number; limit: number; unit: string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 100
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{label}</span><span className="text-ink/60">{unit}</span></div>
      <div className="h-3 overflow-hidden rounded-full bg-paper"><div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} /></div>
      <p className="sr-only">{used} de {limit}</p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

function AuthForm() {
  const { signIn, signUp, resetPassword, signInWithGoogle, supabaseOn, notice, clearNotice } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(params.get('registro') ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accept, setAccept] = useState(false)
  const [error, setError] = useState<string>()
  const [sent, setSent] = useState<'reset' | 'confirm'>()
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const navigate = useNavigate()

  const go = (next: typeof mode) => { setMode(next); setError(undefined); setSent(undefined); clearNotice() }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'register' && !accept) { setError('Debes aceptar los términos de uso y la política de privacidad.'); return }
    setBusy(true)
    setError(undefined)
    clearNotice()
    try {
      if (mode === 'forgot') {
        await resetPassword(email)
        setSent('reset')
      } else if (mode === 'login') {
        await signIn(email, password)
        if (params.get('plan') === 'pro') navigate('/precios')
      } else {
        const { needsConfirmation } = await signUp(email, password, accept)
        if (needsConfirmation) setSent('confirm')
        else if (params.get('plan') === 'pro') navigate('/precios')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar la operación.')
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setGoogleBusy(true)
    setError(undefined)
    clearNotice()
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo abrir el acceso con Google.')
      setGoogleBusy(false)
    }
  }

  const title = mode === 'login' ? 'Bienvenido de nuevo' : mode === 'register' ? 'Crea tu cuenta' : 'Recupera tu contraseña'
  const intro =
    mode === 'login' ? 'Entra para ver tu plan y tu uso.'
    : mode === 'register' ? 'Gratis, sin tarjeta. Desbloquea la IA y más conversiones al día.'
    : 'Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.'

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-3xl border border-line bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <p className="mt-2 text-ink/65">{intro}</p>

        {notice && <Notice kind="warn" onClose={clearNotice} className="mt-5">{notice}</Notice>}

        {sent ? (
          <Notice kind="success" className="mt-6">
            <p className="font-semibold">Revisa tu correo</p>
            {sent === 'reset'
              ? <p className="mt-1">Si hay una cuenta con <b>{email}</b>, te hemos enviado un enlace que caduca en 1 hora. Mira también la carpeta de spam.</p>
              : <p className="mt-1">Te hemos enviado un enlace de confirmación a <b>{email}</b>. Púlsalo para activar tu cuenta y entrar.</p>}
          </Notice>
        ) : (
          <>
            {supabaseOn && mode !== 'forgot' && (
              <>
                <Button variant="secondary" loading={googleBusy} onClick={() => void google()} className="mt-6 w-full !py-3 text-base">
                  {!googleBusy && <GoogleIcon />} Entrar con Google
                </Button>
                <div className="mt-5 flex items-center gap-3 text-xs text-ink/45"><span className="h-px flex-1 bg-line" />o con tu correo<span className="h-px flex-1 bg-line" /></div>
              </>
            )}
            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo
                <input type="email" required autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              {mode !== 'forgot' && (
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  <span className="flex items-center justify-between">
                    Contraseña
                    {mode === 'login' && <button type="button" onClick={() => go('forgot')} className="text-xs font-semibold text-brand hover:underline">¿Olvidaste tu contraseña?</button>}
                  </span>
                  <input type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
                  {mode === 'register' && <span className="text-xs font-normal text-ink/50">Mínimo 8 caracteres.</span>}
                </label>
              )}
              {mode === 'register' && (
                <Checkbox checked={accept} onChange={setAccept} label={<span className="font-normal">He leído y acepto los <Link to="/terminos" target="_blank" className="font-semibold text-brand hover:underline">términos de uso</Link> y la <Link to="/privacidad" target="_blank" className="font-semibold text-brand hover:underline">política de privacidad</Link>.</span>} />
              )}
              {error && <Notice kind="error">{error}</Notice>}
              <Button type="submit" variant="primary" loading={busy} className="!py-3 text-base">
                {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviar enlace'}
              </Button>
            </form>
          </>
        )}

        <p className="mt-5 text-center text-sm text-ink/60">
          {mode === 'login' ? <>¿No tienes cuenta? <button className="font-semibold text-brand hover:underline" onClick={() => go('register')}>Créala gratis</button></>
            : mode === 'register' ? <>¿Ya tienes cuenta? <button className="font-semibold text-brand hover:underline" onClick={() => go('login')}>Entra</button></>
            : <button className="font-semibold text-brand hover:underline" onClick={() => go('login')}>← Volver a entrar</button>}
        </p>
      </div>
    </div>
  )
}

/** Página a la que lleva el enlace del correo: /cuenta/restablecer (Supabase) o /cuenta/restablecer?token=… (modo antiguo) */
export function ResetPassword() {
  const { updatePassword, supabaseOn, recovering, user } = useAuth()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waited, setWaited] = useState(false)
  const navigate = useNavigate()

  // con Supabase, el enlace entrega una sesión de recuperación: se espera un momento a que el cliente la lea de la URL
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500)
    return () => clearTimeout(t)
  }, [])
  const linkError = supabaseOn ? /error_description=([^&]+)/.exec(window.location.hash)?.[1] : undefined
  const valid = supabaseOn ? (recovering || !!user) && !linkError : !!token
  const checking = supabaseOn && !valid && !waited && !linkError

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await updatePassword(password, token)
      navigate('/cuenta')
    } catch (err) {
      setExpired(err instanceof ApiError && (err.code === 'reset' || err.code === 'session_not_found'))
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-3xl border border-line bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold">Elige una contraseña nueva</h1>
        <p className="mt-2 text-ink/65">{supabaseOn ? 'Elige una de al menos 8 caracteres; en cuanto la guardes entrarás con ella.' : 'Al guardarla, cerraremos las sesiones abiertas en otros dispositivos.'}</p>
        {checking ? (
          <p className="mt-6 text-sm text-ink/55">Comprobando el enlace…</p>
        ) : !valid ? (
          <Notice kind="error" className="mt-6">{linkError ? 'El enlace ha caducado o ya se usó.' : 'El enlace no es válido.'} <Link to="/cuenta" className="font-semibold underline">Pide uno nuevo</Link>.</Notice>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Contraseña nueva
              <input type="password" required minLength={8} autoComplete="new-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="text-xs font-normal text-ink/50">Mínimo 8 caracteres.</span>
            </label>
            {error && <Notice kind="error">{error}{expired && <> <Link to="/cuenta" className="font-semibold underline">Pedir otro enlace</Link></>}</Notice>}
            <Button type="submit" variant="primary" loading={busy} className="!py-3 text-base">{busy ? 'Guardando…' : 'Guardar contraseña'}</Button>
          </form>
        )}
      </div>
    </div>
  )
}

function Dashboard() {
  const { me, signOut, refresh, isAdmin, supabaseOn } = useAuth()
  const [params] = useSearchParams()
  const [error, setError] = useState<string>()
  const [confirm, setConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [granted, setGranted] = useState<string>()
  const paid = params.get('pago') === 'ok'

  // Stripe avisa a nuestro servidor por webhook: tarda unos segundos en llegar tras el pago
  useEffect(() => {
    if (!paid) return
    const timers = [2000, 5000, 10000].map((ms) => setTimeout(() => void refresh(), ms))
    return () => timers.forEach(clearTimeout)
  }, [paid, refresh])

  if (!me?.user) return null
  const { user, limits, usage } = me
  const until = user.until ? new Date(user.until).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined

  const portal = async () => {
    try {
      const { url } = await postJson<{ url: string }>('/api/billing/portal')
      window.location.href = url
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo abrir el portal.')
    }
  }

  const redeem = async (e: FormEvent) => {
    e.preventDefault()
    setRedeeming(true)
    setError(undefined)
    setGranted(undefined)
    try {
      const r = await postJson<Me & { granted: boolean; until: number | null }>('/api/billing/redeem', { code })
      setCode('')
      setGranted(r.until ? `¡Código canjeado! Tienes Pro hasta el ${new Date(r.until).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.` : '¡Código canjeado! Ya tienes Pro.')
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo canjear el código.')
    } finally {
      setRedeeming(false)
    }
  }

  const remove = async () => {
    try {
      await postJson('/api/account/delete', { password })
      if (supabaseOn) await signOut()
      else await refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo borrar la cuenta.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {paid && <p className="mb-6 rounded-2xl bg-lime px-5 py-3 font-semibold">¡Gracias! Estamos activando tu plan Pro; en unos segundos aparecerá aquí.</p>}
      <div className="rounded-3xl border border-line bg-white p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-ink/60">Sesión iniciada como</p>
            <p className="text-xl font-bold">{user.name ? `${user.name} · ` : ''}{user.email}</p>
          </div>
          <span className={`rounded-full px-4 py-1.5 text-sm font-bold ${user.plan === 'pro' ? 'bg-lime' : 'bg-paper'}`}>Plan {limits.name}</span>
        </div>
        {user.plan === 'pro' && until && <p className="mt-3 text-sm text-ink/60">Tu plan Pro está vigente hasta el {until}.</p>}
        {isAdmin && (
          <Link to="/admin" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand"><ShieldCheck size={16} /> Panel de administración</Link>
        )}
      </div>

      <div className="mt-5 rounded-3xl border border-line bg-white p-7">
        <h2 className="text-xl font-bold">Tu uso</h2>
        <div className="mt-5 flex flex-col gap-5">
          <Meter label="Conversiones avanzadas hoy" used={usage.jobsToday} limit={limits.jobsPerDay} unit={`${usage.jobsToday} / ${limits.jobsPerDay}`} />
          <Meter label="IA este mes" used={usage.aiCharsMonth} limit={limits.aiCharsPerMonth} unit={`≈ ${aiPages(usage.aiCharsMonth)} / ${aiPages(limits.aiCharsPerMonth)} páginas`} />
        </div>
        <p className="mt-4 text-sm text-ink/55">Las herramientas básicas (unir, dividir, firmar, rotar…) no cuentan: son ilimitadas. Las conversiones avanzadas admiten archivos de hasta {limits.maxFileMB} MB.</p>
      </div>

      {supabaseOn && (
        <form onSubmit={redeem} className="mt-5 rounded-3xl border border-line bg-white p-7">
          <h2 className="flex items-center gap-2 text-xl font-bold"><Gift size={20} className="text-brand" /> Canjear un código</h2>
          <p className="mt-1 text-sm text-ink/60">Si tienes un código regalo, escríbelo aquí. Los códigos de descuento se escriben al pagar, en Precios.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <input aria-label="Código" placeholder="Tu código" autoComplete="off" required className={`${inputCls} min-w-0 flex-1 uppercase`} value={code} onChange={(e) => setCode(e.target.value)} />
            <Button type="submit" variant="primary" loading={redeeming}>Canjear</Button>
          </div>
          {granted && <Notice kind="success" className="mt-4">{granted}</Notice>}
        </form>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {user.plan === 'pro' ? (
          user.subscribed && <button onClick={portal} className="rounded-2xl bg-ink px-6 py-3 font-semibold text-white hover:bg-brand">Gestionar suscripción</button>
        ) : (
          <Link to="/precios" className="flex items-center gap-2 rounded-2xl bg-brand px-6 py-3 font-semibold text-white shadow-lg shadow-brand/30 hover:bg-brand-dark"><Sparkles size={18} /> Mejorar a Pro</Link>
        )}
        <button onClick={() => void signOut()} className="flex items-center gap-2 rounded-2xl border border-line bg-white px-6 py-3 font-semibold hover:border-ink"><LogOut size={18} /> Cerrar sesión</button>
      </div>
      {error && <Notice kind="error" className="mt-4">{error}</Notice>}

      <div className="mt-12 rounded-3xl border border-red-200 bg-white p-7">
        <h2 className="text-lg font-bold">Borrar mi cuenta</h2>
        <p className="mt-1 text-sm text-ink/60">Elimina tu correo, tu contraseña y tu historial de uso. No se puede deshacer.</p>
        {confirm ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {!supabaseOn && <input type="password" placeholder="Tu contraseña" autoComplete="current-password" className={`${inputCls} flex-1`} value={password} onChange={(e) => setPassword(e.target.value)} />}
            <button onClick={remove} className="rounded-xl bg-red-600 px-5 py-2 font-semibold text-white hover:bg-red-700">Borrar definitivamente</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="mt-4 rounded-xl border border-red-300 px-5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Borrar mi cuenta</button>
        )}
      </div>
    </div>
  )
}

export function Account() {
  const { me, offline, refresh } = useAuth()
  if (!me && offline) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <Notice kind="error" action={{ label: 'Reintentar', onClick: () => void refresh() }}>
          No podemos conectar con el servidor ahora mismo. Las herramientas que funcionan en tu navegador siguen disponibles.
        </Notice>
      </div>
    )
  }
  if (!me) return <p className="py-24 text-center text-ink/50">Cargando…</p>
  return me.user ? <Dashboard /> : <AuthForm />
}
