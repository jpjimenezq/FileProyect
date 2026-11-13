// Uso: npm run admin:grant -- correo@ejemplo.com   (añade --revoke para quitar el rol)
// La persona debe haberse registrado antes. Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (.env.local).
import { loadEnv } from './env.js'

loadEnv()

// process.exit() con peticiones abiertas falla en Windows: se marca el código de salida y se vuelve
const fail = () => { process.exitCode = 1 }

async function main() {
  const args = process.argv.slice(2)
  const revoke = args.includes('--revoke')
  const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase()

  if (!email) {
    console.error('Indica el correo: npm run admin:grant -- correo@ejemplo.com')
    return fail()
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno o en .env.local.')
    return fail()
  }

  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: profile, error } = await client.from('profiles').select('id,email,role').ilike('email', email).maybeSingle()
  if (error) {
    console.error(`No se pudo consultar Supabase: ${error.message}`)
    return fail()
  }
  if (!profile) {
    console.error(`No hay ningún usuario registrado con ${email}. Pídele que cree su cuenta primero.`)
    return fail()
  }

  const role = revoke ? 'user' : 'admin'
  const upd = await client.from('profiles').update({ role }).eq('id', profile.id)
  if (upd.error) {
    console.error(`No se pudo actualizar el rol: ${upd.error.message}`)
    return fail()
  }
  await client.from('admin_audit').insert({ actor_email: 'script admin:grant', action: revoke ? 'user.revoke_admin' : 'user.grant_admin', target: profile.id, data: { email } })
  console.log(`${profile.email} ahora tiene el rol «${role}». (Si tiene la sesión abierta, el cambio se nota en menos de un minuto.)`)

}

await main()
