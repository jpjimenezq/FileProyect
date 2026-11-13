/**
 * Planes y cuotas. Los límites están pensados para que el coste por usuario quede acotado:
 * - Las herramientas que se ejecutan en el navegador no cuestan nada y no tienen límite.
 * - Las de servidor (LibreOffice, Ghostscript, qpdf) consumen CPU: límite de trabajos por día y de tamaño.
 * - La IA se paga por uso: límite mensual de caracteres enviados a DeepSeek.
 * Ver REQUISITOS.md ("Modelo de negocio") para las cuentas de márgenes.
 */
export const PLANS = {
  anon: { name: 'Invitado', jobsPerDay: 3, maxFileMB: 10, aiCharsPerMonth: 0 },
  free: { name: 'Gratis', jobsPerDay: 10, maxFileMB: 25, aiCharsPerMonth: 100_000 },
  pro: { name: 'Pro', jobsPerDay: 300, maxFileMB: 100, aiCharsPerMonth: 2_000_000 },
}

export const PRICES = {
  month: { eur: 4.99, label: '4,99 €/mes' },
  year: { eur: 39.99, label: '39,99 €/año' },
}

const GRACE_MS = 2 * 24 * 3600 * 1000

/** Plan efectivo de un usuario: Pro solo mientras la suscripción siga vigente */
export function effectivePlan(user, now = Date.now()) {
  if (!user) return 'anon'
  if (user.plan === 'pro' && (!user.plan_until || user.plan_until + GRACE_MS > now)) return 'pro'
  return 'free'
}

export const day = (d = new Date()) => d.toISOString().slice(0, 10)
export const month = (d = new Date()) => d.toISOString().slice(0, 7)
