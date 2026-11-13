import { createClient } from '@supabase/supabase-js'
import { supabaseData } from './supabase.js'

/** Modo Supabase si el entorno trae la URL y la service role key; si no, SQLite como siempre */
export const supabaseConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

/** La service role key salta RLS: solo vive en el servidor y nunca se envía al navegador */
export function openSupabaseData() {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return supabaseData(client, { adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS) })
}

export const parseAdminEmails = (list = '') => String(list).split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
