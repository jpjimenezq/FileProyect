import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogOut, Sparkles } from 'lucide-react'
import { ApiError, postJson } from '../lib/api'
import { aiPages, useAuth } from '../lib/auth'
import { inputCls } from '../components/ToolFrame'

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

function AuthForm() {
  const { login, register, forgot } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(params.get('registro') ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accept, setAccept] = useState(false)
  const [error, setError] = useState<string>()
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const go = (next: typeof mode) => { setMode(next); setError(undefined); setSent(false) }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      if (mode === 'forgot') {
        await forgot(email)
        setSent(true)
      } else {
        await (mode === 'login' ? login(email, password) : register(email, password, accept))
        if (params.get('plan') === 'pro') navigate('/precios')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar la operación.')
    } finally {
      setBusy(false)
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

        {sent ? (
          <div className="mt-6 rounded-2xl bg-lime/40 p-4 text-sm">
            <p className="font-semibold">Revisa tu correo</p>
            <p className="mt-1">Si hay una cuenta con <b>{email}</b>, te hemos enviado un enlace que caduca en 1 hora. Mira también la carpeta de spam.</p>
          </div>
        ) : (
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
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" required className="mt-0.5 h-4 w-4" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                <span>He leído y acepto los <Link to="/terminos" target="_blank" className="font-semibold text-brand hover:underline">términos de uso</Link> y la <Link to="/privacidad" target="_blank" className="font-semibold text-brand hover:underline">política de privacidad</Link>.</span>
              </label>
            )}
            {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button disabled={busy} className="rounded-2xl bg-brand py-3.5 text-lg font-semibold text-white shadow-lg shadow-brand/30 hover:bg-brand-dark disabled:opacity-50">
              {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviar enlace'}
            </button>
          </form>
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

/** Página a la que lleva el enlace del correo: /cuenta/restablecer?token=… */
export function ResetPassword() {
  const { reset } = useAuth()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await reset(token, password)
      navigate('/cuenta')
    } catch (err) {
      setExpired(err instanceof ApiError && err.code === 'reset')
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-3xl border border-line bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold">Elige una contraseña nueva</h1>
        <p className="mt-2 text-ink/65">Al guardarla, cerraremos las sesiones abiertas en otros dispositivos.</p>
        {!token ? (
          <p className="mt-6 text-sm text-red-700">El enlace no es válido. <Link to="/cuenta" className="font-semibold text-brand hover:underline">Pide uno nuevo</Link>.</p>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Contraseña nueva
              <input type="password" required minLength={8} autoComplete="new-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="text-xs font-normal text-ink/50">Mínimo 8 caracteres.</span>
            </label>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}{expired && <> <Link to="/cuenta" className="font-semibold underline">Pedir otro enlace</Link></>}</p>}
            <button disabled={busy} className="rounded-2xl bg-brand py-3.5 text-lg font-semibold text-white shadow-lg shadow-brand/30 hover:bg-brand-dark disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
          </form>
        )}
      </div>
    </div>
  )
}

function Dashboard() {
  const { me, logout, refresh } = useAuth()
  const [params] = useSearchParams()
  const [error, setError] = useState<string>()
  const [confirm, setConfirm] = useState(false)
  const [password, setPassword] = useState('')
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

  const remove = async () => {
    try {
      await postJson('/api/account/delete', { password })
      await refresh()
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
            <p className="text-xl font-bold">{user.email}</p>
          </div>
          <span className={`rounded-full px-4 py-1.5 text-sm font-bold ${user.plan === 'pro' ? 'bg-lime' : 'bg-paper'}`}>Plan {limits.name}</span>
        </div>
        {user.plan === 'pro' && until && <p className="mt-3 text-sm text-ink/60">Tu plan Pro está vigente hasta el {until}.</p>}
      </div>

      <div className="mt-5 rounded-3xl border border-line bg-white p-7">
        <h2 className="text-xl font-bold">Tu uso</h2>
        <div className="mt-5 flex flex-col gap-5">
          <Meter label="Conversiones avanzadas hoy" used={usage.jobsToday} limit={limits.jobsPerDay} unit={`${usage.jobsToday} / ${limits.jobsPerDay}`} />
          <Meter label="IA este mes" used={usage.aiCharsMonth} limit={limits.aiCharsPerMonth} unit={`≈ ${aiPages(usage.aiCharsMonth)} / ${aiPages(limits.aiCharsPerMonth)} páginas`} />
        </div>
        <p className="mt-4 text-sm text-ink/55">Las herramientas básicas (unir, dividir, firmar, rotar…) no cuentan: son ilimitadas. Las conversiones avanzadas admiten archivos de hasta {limits.maxFileMB} MB.</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {user.plan === 'pro' ? (
          user.subscribed && <button onClick={portal} className="rounded-2xl bg-ink px-6 py-3 font-semibold text-white hover:bg-brand">Gestionar suscripción</button>
        ) : (
          <Link to="/precios" className="flex items-center gap-2 rounded-2xl bg-brand px-6 py-3 font-semibold text-white shadow-lg shadow-brand/30 hover:bg-brand-dark"><Sparkles size={18} /> Mejorar a Pro</Link>
        )}
        <button onClick={() => void logout()} className="flex items-center gap-2 rounded-2xl border border-line bg-white px-6 py-3 font-semibold hover:border-ink"><LogOut size={18} /> Cerrar sesión</button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

      <div className="mt-12 rounded-3xl border border-red-200 bg-white p-7">
        <h2 className="text-lg font-bold">Borrar mi cuenta</h2>
        <p className="mt-1 text-sm text-ink/60">Elimina tu correo, tu contraseña y tu historial de uso. No se puede deshacer.</p>
        {confirm ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <input type="password" placeholder="Tu contraseña" autoComplete="current-password" className={`${inputCls} flex-1`} value={password} onChange={(e) => setPassword(e.target.value)} />
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
  const { me } = useAuth()
  if (!me) return <p className="py-24 text-center text-ink/50">Cargando…</p>
  return me.user ? <Dashboard /> : <AuthForm />
}
