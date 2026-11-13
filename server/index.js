import { loadEnv } from './env.js'

// .env y .env.local en la raíz del proyecto (en Docker las variables llegan por docker compose)
loadEnv()

const { buildApp } = await import('./app.js')
const { app } = await buildApp()
await app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' })
