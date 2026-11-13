import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Minus } from 'lucide-react'
import { ApiError, postJson } from '../lib/api'
import { aiPages, useAuth } from '../lib/auth'
import { tools } from '../tools/catalog'

const FAQ = [
  ['¿Qué pasa con mis archivos?', 'Solo los usamos para darte el resultado y no los conservamos: se descartan automáticamente al terminar. Las herramientas de IA envían el texto del documento a un proveedor externo (DeepSeek), así que evítalas con documentos confidenciales.'],
  ['¿Puedo cancelar cuando quiera?', 'Sí, desde «Mi cuenta» → «Gestionar suscripción». Mantienes Pro hasta el final del periodo que ya has pagado.'],
  ['¿Cómo se paga?', 'Con tarjeta a través de Stripe. Nosotros no vemos ni guardamos los datos de tu tarjeta. Los precios incluyen impuestos.'],
  ['¿Qué pasa si agoto la cuota de IA?', 'Las herramientas de IA se pausan hasta el mes siguiente. Todo lo demás sigue funcionando con normalidad.'],
] as const

function Feature({ children, off }: { children: React.ReactNode; off?: boolean }) {
  return (
    <li className={`flex items-start gap-2.5 text-[15px] ${off ? 'text-ink/40' : ''}`}>
      {off ? <Minus size={18} className="mt-0.5 shrink-0" /> : <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" />}
      <span>{children}</span>
    </li>
  )
}

export function Pricing() {
  const { me } = useAuth()
  const navigate = useNavigate()
  const [interval, setInterval] = useState<'month' | 'year'>('year')
  const [busy, setBusy] = useState(false)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string>()

  const plans = me?.plans
  const price = interval === 'year' ? me?.prices.year : me?.prices.month
  const saving = me ? Math.round((1 - me.prices.year.eur / (me.prices.month.eur * 12)) * 100) : 33

  const upgrade = async () => {
    if (!me?.user) return navigate('/cuenta?registro=1&plan=pro')
    setBusy(true)
    setError(undefined)
    try {
      const { url } = await postJson<{ url: string }>('/api/billing/checkout', { interval })
      window.location.href = url
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo iniciar el pago.')
      setBusy(false)
    }
  }

  const portal = async () => {
    setBusy(true)
    try {
      const { url } = await postJson<{ url: string }>('/api/billing/portal')
      window.location.href = url
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo abrir el portal.')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-extrabold md:text-5xl">Precios sin letra pequeña</h1>
        <p className="mt-4 text-lg text-ink/70">Empieza gratis con las {tools.length} herramientas. Paga solo si necesitas más conversiones avanzadas o más IA.</p>
        <div className="mt-7 inline-flex rounded-full border border-line bg-white p-1 text-sm font-semibold">
          {(['month', 'year'] as const).map((i) => (
            <button key={i} onClick={() => setInterval(i)} className={`rounded-full px-5 py-2 ${interval === i ? 'bg-ink text-white' : 'text-ink/60'}`}>
              {i === 'month' ? 'Mensual' : <>Anual <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${interval === i ? 'bg-lime text-ink' : 'bg-lime/60'}`}>−{saving}%</span></>}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="mx-auto mt-6 max-w-xl rounded-2xl border border-red-200 bg-white p-3 text-center text-sm text-red-700">{error}</p>}

      <div className="mt-10 grid items-stretch gap-5 md:grid-cols-3">
        <div className="flex flex-col rounded-3xl border border-line bg-white p-7">
          <h2 className="text-2xl font-bold">Invitado</h2>
          <p className="mt-1 text-sm text-ink/60">Sin cuenta</p>
          <p className="mt-5 font-display text-4xl font-extrabold">0 €</p>
          <ul className="mt-6 flex flex-1 flex-col gap-3">
            <Feature>Herramientas básicas sin límite</Feature>
            <Feature>{plans?.anon.jobsPerDay ?? 3} conversiones avanzadas al día</Feature>
            <Feature>Archivos de hasta {plans?.anon.maxFileMB ?? 10} MB</Feature>
            <Feature off>Sin IA</Feature>
          </ul>
        </div>

        <div className="flex flex-col rounded-3xl border border-line bg-white p-7">
          <h2 className="text-2xl font-bold">Gratis</h2>
          <p className="mt-1 text-sm text-ink/60">Con cuenta</p>
          <p className="mt-5 font-display text-4xl font-extrabold">0 €</p>
          <ul className="mt-6 flex flex-1 flex-col gap-3">
            <Feature>Herramientas básicas sin límite</Feature>
            <Feature>{plans?.free.jobsPerDay ?? 10} conversiones avanzadas al día</Feature>
            <Feature>Archivos de hasta {plans?.free.maxFileMB ?? 25} MB</Feature>
            <Feature>IA: unas {aiPages(plans?.free.aiCharsPerMonth ?? 100_000)} páginas al mes</Feature>
          </ul>
          {me?.plan === 'free' ? (
            <p className="mt-7 rounded-2xl bg-paper py-3.5 text-center font-semibold">Tu plan actual</p>
          ) : me?.plan !== 'pro' && (
            <button onClick={() => navigate('/cuenta?registro=1')} className="mt-7 rounded-2xl border-2 border-ink py-3.5 font-semibold hover:bg-ink hover:text-white">Crear cuenta gratis</button>
          )}
        </div>

        <div className="relative flex flex-col rounded-3xl border-2 border-ink bg-white p-7 shadow-[8px_8px_0_0_#5b4bff]">
          <span className="absolute -top-3 right-6 rounded-full bg-lime px-3 py-1 text-xs font-bold">Más completo</span>
          <h2 className="text-2xl font-bold">Pro</h2>
          <p className="mt-1 text-sm text-ink/60">Para usarlo a diario</p>
          <p className="mt-5 font-display text-4xl font-extrabold">{price?.label ?? (interval === 'year' ? '39,99 €/año' : '4,99 €/mes')}</p>
          <p className="mt-1 h-5 text-sm text-ink/60">{interval === 'year' && me ? `Equivale a ${(me.prices.year.eur / 12).toFixed(2).replace('.', ',')} €/mes` : `o ${me?.prices.year.label ?? '39,99 €/año'} (ahorras un ${saving}%)`}</p>
          <ul className="mt-5 flex flex-1 flex-col gap-3">
            <Feature>Todo lo del plan Gratis</Feature>
            <Feature><b>{plans?.pro.jobsPerDay ?? 300}</b> conversiones avanzadas al día</Feature>
            <Feature>Archivos de hasta <b>{plans?.pro.maxFileMB ?? 100} MB</b></Feature>
            <Feature>IA: unas <b>{aiPages(plans?.pro.aiCharsPerMonth ?? 2_000_000)} páginas</b> al mes</Feature>
            <Feature>Cancela cuando quieras</Feature>
          </ul>
          {me?.user && me.plan !== 'pro' && (
            <label className="mt-6 flex items-start gap-2.5 text-xs leading-snug text-ink/70">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>Pido que Pro empiece de inmediato. Entiendo que, si desisto dentro de los 14 días, pagaré la parte proporcional ya usada. Acepto los <Link to="/terminos" target="_blank" className="underline">términos</Link>.</span>
            </label>
          )}
          {me?.plan === 'pro' ? (
            <button onClick={portal} disabled={busy} className="mt-7 rounded-2xl bg-ink py-3.5 font-semibold text-white hover:bg-brand disabled:opacity-50">Gestionar suscripción</button>
          ) : (
            <button onClick={upgrade} disabled={busy || me?.billing === false || (!!me?.user && !consent)} className="mt-7 rounded-2xl bg-brand py-3.5 font-semibold text-white shadow-lg shadow-brand/30 hover:bg-brand-dark disabled:opacity-50">
              {me?.billing === false ? 'Pagos no disponibles' : busy ? 'Un momento…' : 'Hazte Pro'}
            </button>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-ink/50">Precios con impuestos incluidos. Pago seguro con Stripe.</p>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-ink/55">Conversiones avanzadas: Word, Excel, PowerPoint y HTML a PDF, PDF a Word y PowerPoint, comprimir, reparar, PDF/A, proteger y desbloquear. El resto de herramientas (unir, dividir, firmar, rotar, editar…) son ilimitadas.</p>

      <section className="mt-20">
        <h2 className="text-center text-3xl font-extrabold">Por qué FileProyect es distinto</h2>
        <div className="mt-8 thin-scroll overflow-x-auto rounded-3xl border border-line bg-white">
          <table className="w-full min-w-[34rem] text-left text-[15px]">
            <thead>
              <tr className="bg-ink text-white">
                <th className="px-5 py-3.5 font-semibold" />
                <th className="px-5 py-3.5 font-semibold text-lime">FileProyect</th>
                <th className="px-5 py-3.5 font-semibold text-white/70">Muchos servicios online</th>
              </tr>
            </thead>
            <tbody className="[&_td]:px-5 [&_td]:py-3.5 [&_tr]:border-t [&_tr]:border-line">
              <tr><td className="font-semibold">Anuncios y marcas de agua</td><td>Nunca, tampoco en el plan gratis</td><td className="text-ink/60">Habituales en el plan gratuito</td></tr>
              <tr><td className="font-semibold">Resumir y traducir con IA</td><td>Incluido, con cuota gratuita mensual</td><td className="text-ink/60">Suele ser de pago aparte</td></tr>
              <tr><td className="font-semibold">Límite en herramientas básicas</td><td>Ninguno en las herramientas básicas</td><td className="text-ink/60">Tareas o tamaño limitados</td></tr>
              <tr><td className="font-semibold">Precio de Pro</td><td>{me?.prices.month.label ?? '4,99 €/mes'}, {me?.prices.year.label ?? '39,99 €/año'}</td><td className="text-ink/60">—</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-center text-xs text-ink/45">Comparativa general de servicios online; las condiciones concretas de cada uno pueden variar.</p>
      </section>

      <section className="mx-auto mt-20 max-w-3xl">
        <h2 className="text-center text-3xl font-extrabold">Preguntas frecuentes</h2>
        <div className="mt-8 flex flex-col gap-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-line bg-white px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">{q}<ChevronDown size={18} className="transition group-open:rotate-180" /></summary>
              <p className="mt-3 text-ink/70">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
