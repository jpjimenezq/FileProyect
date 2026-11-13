import path from 'node:path'
import { fileURLToPath } from 'node:url'

// .env en la raíz del proyecto (en Docker las variables llegan por docker compose)
try { process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')) } catch { /* sin .env */ }

const { buildApp } = await import('./app.js')
const { app } = await buildApp()
await app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' })
