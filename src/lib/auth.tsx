import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { postJson } from './api'

export interface PlanLimits {
  name: string
  jobsPerDay: number
  maxFileMB: number
  aiCharsPerMonth: number
}

export interface Me {
  user: { email: string; plan: 'free' | 'pro'; until: number | null; subscribed: boolean } | null
  plan: 'anon' | 'free' | 'pro'
  limits: PlanLimits
  plans: Record<'anon' | 'free' | 'pro', PlanLimits>
  usage: { jobsToday: number; aiCharsMonth: number }
  prices: { month: { eur: number; label: string }; year: { eur: number; label: string } }
  billing: boolean
  ai: boolean
}

interface AuthValue {
  /** undefined mientras se comprueba la sesión */
  me: Me | undefined
  refresh: () => Promise<void>
  register: (email: string, password: string, acceptTerms: boolean) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  forgot: (email: string) => Promise<void>
  reset: (token: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>()

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/me')
      if (r.ok) setMe(await r.json())
    } catch { /* sin servidor: la web sigue funcionando para las herramientas locales */ }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const value = useMemo<AuthValue>(() => ({
    me,
    refresh,
    register: async (email, password, acceptTerms) => setMe(await postJson<Me>('/api/auth/register', { email, password, acceptTerms })),
    forgot: async (email) => { await postJson('/api/auth/forgot', { email }) },
    reset: async (token, password) => setMe(await postJson<Me>('/api/auth/reset', { token, password })),
    login: async (email, password) => setMe(await postJson<Me>('/api/auth/login', { email, password })),
    logout: async () => { await postJson('/api/auth/logout'); await refresh() },
  }), [me, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return v
}

/** Caracteres de IA → páginas aproximadas (unos 3.000 caracteres por página) */
export const aiPages = (chars: number) => Math.round(chars / 3000)
