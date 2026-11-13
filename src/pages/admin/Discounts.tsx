import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Copy, Dices, Gift, Percent, Plus, Ticket, Wallet } from 'lucide-react'
import { ApiError, apiJson } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Button, NumberField, Notice, Select, Switch } from '../../components/ui'
import { Segmented } from '../../components/Illustrate'
import { Chip, Empty, ErrorBox, PageHead, Skeleton, card, endOfDayIso, shortDate, todayYmd, useApi } from './shared'

type Kind = 'percent' | 'amount' | 'grant'
type Duration = 'once' | 'repeating' | 'forever'
interface Discount {
  id: string
  code: string
  description: string | null
  kind: Kind
  value: number | string
  currency: string
  duration: Duration
  duration_months: number | null
  grant_days: number | null
  max_redemptions: number | null
  redeemed: number
  expires_at: string | null
  active: boolean
  created_at: string
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `FP-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')}`
}

function status(d: Discount, now = Date.now()): { label: string; tone: 'green' | 'ink' | 'amber' | 'red' } {
  if (!d.active) return { label: 'Inactivo', tone: 'ink' }
  if (d.expires_at && Date.parse(d.expires_at) <= now) return { label: 'Caducado', tone: 'amber' }
  if (d.max_redemptions != null && d.redeemed >= d.max_redemptions) return { label: 'Agotado', tone: 'red' }
  return { label: 'Activo', tone: 'green' }
}

const money = (v: number, cur: string) => v.toLocaleString('es-ES', { style: 'currency', currency: cur.toUpperCase() })
function typeLabel(d: Discount) {
  const v = Number(d.value)
  if (d.kind === 'grant') return `Pro ${d.grant_days} días`
  const base = d.kind === 'percent' ? `${v.toLocaleString('es-ES')} %` : money(v, d.currency)
  return base
}
const durationLabel = (d: Discount) => d.kind === 'grant' ? 'Sin pago' : d.duration === 'once' ? 'Una vez' : d.duration === 'forever' ? 'Siempre' : `${d.duration_months} meses`

function CopyButton({ code }: { code: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* sin permiso del portapapeles */ }
  }
  return (
    <button onClick={copy} aria-label={`Copiar ${code}`} title="Copiar código" className="rounded-lg p-1.5 text-ink/50 transition hover:bg-ink/5 hover:text-brand">
      {done ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
    </button>
  )
}

function NewDiscount({ stripeOff, onCreated, onCancel }: { stripeOff: boolean; onCreated: (d: Discount) => void; onCancel: () => void }) {
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<Kind>('grant')
  const [percent, setPercent] = useState(20)
  const [amount, setAmount] = useState(5)
  const [days, setDays] = useState(30)
  const [duration, setDuration] = useState<Duration>('once')
  const [months, setMonths] = useState(3)
  const [max, setMax] = useState('')
  const [expires, setExpires] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; stripe: boolean }>()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    const body: Record<string, unknown> = { code: code.trim().toUpperCase(), kind, description: desc.trim() || null }
    if (kind === 'percent') body.value = percent
    if (kind === 'amount') { body.value = amount; body.currency = 'eur' }
    if (kind === 'grant') body.grant_days = days
    if (kind !== 'grant') { body.duration = duration; if (duration === 'repeating') body.duration_months = months }
    if (max.trim()) body.max_redemptions = Number(max)
    if (expires) body.expires_at = endOfDayIso(expires)
    try {
      onCreated(await apiJson<Discount>('POST', '/api/admin/discounts', body))
    } catch (err) {
      const e2 = err instanceof ApiError ? err : new ApiError('No se pudo crear el código.')
      setError({ text: e2.message, stripe: e2.status === 503 || /pagos|stripe/i.test(e2.message) })
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className={`${card} mb-5 flex flex-col gap-4 p-5`}>
      <h2 className="text-lg font-bold">Nuevo código</h2>
      {error && (error.stripe
        ? <Notice kind="warn" onClose={() => setError(undefined)}>{error.text} Stripe no está configurado en este servidor: usa «Regalo Pro», que funciona sin Stripe.</Notice>
        : <Notice kind="error" onClose={() => setError(undefined)}>{error.text}</Notice>)}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="dc-code" className="text-sm font-semibold">Código</label>
        <div className="flex gap-2">
          <input id="dc-code" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_\-]{3,32}" placeholder="VERANO20" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="min-w-0 flex-1 font-mono uppercase" autoComplete="off" />
          <Button icon={Dices} onClick={() => setCode(randomCode())}>Generar</Button>
        </div>
        <p className="text-xs text-ink/55">Letras, números, guion y guion bajo (3 a 32).</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Tipo</span>
        <Segmented<Kind> label="Tipo de código" value={kind} onChange={setKind} options={[
          { value: 'percent', label: 'Porcentaje', icon: Percent, desc: 'Descuento en % sobre el pago de la suscripción.' },
          { value: 'amount', label: 'Importe fijo', icon: Wallet, desc: 'Descuento de una cantidad fija en euros.' },
          { value: 'grant', label: 'Regalo Pro', icon: Gift, desc: 'Regala Pro unos días, sin pasar por el pago.' },
        ]} />
      </div>

      {kind !== 'grant' && stripeOff && <Notice kind="info">Stripe no está configurado en este servidor. «Regalo Pro» funciona sin Stripe.</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        {kind === 'percent' && <NumberField label="Descuento" value={percent} onChange={setPercent} min={1} max={100} unit="%" />}
        {kind === 'amount' && <NumberField label="Importe" value={amount} onChange={setAmount} min={0.5} max={1000} step={0.5} unit="€" />}
        {kind === 'grant' && <NumberField label="Días de Pro" value={days} onChange={setDays} min={1} max={3650} unit="días" />}
        {kind !== 'grant' && (
          <Select label="Duración" value={duration} onChange={(e) => setDuration(e.target.value as Duration)}>
            <option value="once">Una vez</option>
            <option value="repeating">Varios meses</option>
            <option value="forever">Siempre</option>
          </Select>
        )}
        {kind !== 'grant' && duration === 'repeating' && <NumberField label="Meses" value={months} onChange={setMonths} min={1} max={36} unit="meses" />}
        <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold">Usos máximos <span className="font-normal text-ink/55">(opcional)</span></span>
          <input type="number" inputMode="numeric" min={1} max={1000000} placeholder="Sin límite" value={max} onChange={(e) => setMax(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold">Caduca el <span className="font-normal text-ink/55">(opcional)</span></span>
          <input type="date" min={todayYmd()} value={expires} onChange={(e) => setExpires(e.target.value)} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold">Descripción <span className="font-normal text-ink/55">(opcional, solo la ves tú)</span></span>
        <input maxLength={200} placeholder="Campaña de verano" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" type="submit" icon={Plus} loading={busy}>Crear código</Button>
      </div>
    </form>
  )
}

function Row({ d, onToggle, busy }: { d: Discount; onToggle: (d: Discount) => void; busy: boolean }) {
  const st = status(d)
  return (
    <div className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-bold tracking-wide">{d.code}</span>
          <CopyButton code={d.code} />
          <Chip tone={st.tone}>{st.label}</Chip>
        </div>
        {d.description && <p className="mt-0.5 truncate text-sm text-ink/60">{d.description}</p>}
        <p className="mt-1 text-xs text-ink/50">Creado {shortDate(d.created_at)}{d.expires_at ? ` · Caduca ${shortDate(d.expires_at)}` : ''}</p>
      </div>
      <dl className="flex items-center gap-6 text-sm">
        <div><dt className="text-xs text-ink/50">Tipo</dt><dd className="font-semibold">{typeLabel(d)}</dd><dd className="text-xs text-ink/50">{durationLabel(d)}</dd></div>
        <div><dt className="text-xs text-ink/50">Usos</dt><dd className="font-semibold tabular-nums">{d.redeemed} / {d.max_redemptions ?? '∞'}</dd></div>
      </dl>
      <Switch className="sm:w-28 sm:justify-end" label={d.active ? 'Activo' : 'Inactivo'} checked={d.active} disabled={busy} onChange={() => onToggle(d)} />
    </div>
  )
}

export default function Discounts() {
  const { me } = useAuth()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(params.get('nuevo') === '1')
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string }>()
  const [busyId, setBusyId] = useState<string>()
  const { data, error, loading, reload, setData } = useApi<{ items: Discount[] }>('/api/admin/discounts')

  const closeForm = () => { setCreating(false); if (params.has('nuevo')) setParams({}, { replace: true }) }
  const toggle = async (d: Discount) => {
    setBusyId(d.id)
    setFlash(undefined)
    try {
      const updated = await apiJson<Discount>('PATCH', `/api/admin/discounts/${d.id}`, { active: !d.active })
      setData((x) => ({ items: x.items.map((i) => (i.id === d.id ? updated : i)) }))
    } catch (e) {
      setFlash({ kind: 'error', text: e instanceof ApiError ? e.message : 'No se pudo cambiar el código.' })
    } finally { setBusyId(undefined) }
  }

  return (
    <>
      <PageHead title="Códigos" hint="Descuentos y regalos de Pro para tus usuarios.">
        {!creating && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Nuevo código</Button>}
      </PageHead>
      {flash && <Notice kind={flash.kind} className="mb-3" onClose={() => setFlash(undefined)}>{flash.text}</Notice>}
      {creating && (
        <NewDiscount
          stripeOff={me ? !me.billing : false}
          onCancel={closeForm}
          onCreated={(d) => { closeForm(); setFlash({ kind: 'success', text: `Código ${d.code} creado.` }); setData((x) => ({ items: [d, ...x.items] })); reload() }}
        />
      )}
      {error && !data ? <ErrorBox error={error} onRetry={reload} /> : !data ? (
        <div className="flex flex-col gap-2.5">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : data.items.length === 0 ? (
        <Empty icon={<Ticket size={22} />}>Aún no hay códigos. Crea el primero con «Nuevo código».</Empty>
      ) : (
        <div className={`flex flex-col gap-2.5 ${loading ? 'opacity-60' : ''}`}>
          {data.items.map((d) => <Row key={d.id} d={d} onToggle={toggle} busy={busyId === d.id} />)}
        </div>
      )}
    </>
  )
}
