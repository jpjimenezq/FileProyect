import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** .env.local (claves de Supabase local) tiene prioridad sobre .env; las variables ya presentes en el entorno mandan sobre ambos */
export function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    try { process.loadEnvFile(path.join(ROOT, name)) } catch { /* sin ese archivo */ }
  }
}
