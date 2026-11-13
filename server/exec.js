import { spawn } from 'node:child_process'

export const BIN = {
  qpdf: process.env.QPDF_BIN || 'qpdf',
  gs: process.env.GS_BIN || (process.platform === 'win32' ? 'gswin64c' : 'gs'),
  soffice: process.env.SOFFICE_BIN || 'soffice',
}

export class UserError extends Error {
  /** El tercer argumento permite al cliente reaccionar: 'login' (falta cuenta) o 'quota' (límite del plan) */
  constructor(message, status = 400, code) {
    super(message)
    this.status = status
    this.userCode = code
  }
}

/** Ejecuta un binario sin shell. Rechaza con code 'MISSING' si no está instalado y 'TIMEOUT' si tarda demasiado. */
export function run(cmd, args, { timeout = 120_000, cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout = (stdout + d).slice(-20_000) })
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-20_000) })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(Object.assign(new Error(`${cmd} tardó más de ${timeout / 1000}s`), { code: 'TIMEOUT' }))
    }, timeout)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e.code === 'ENOENT' ? Object.assign(new Error(`${cmd} no está instalado en el servidor`), { code: 'MISSING' }) : e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

let cache
export async function detect() {
  if (cache && Date.now() - cache.at < 60_000) return cache.value
  const check = async (cmd) => {
    try { return (await run(cmd, ['--version'], { timeout: 20_000 })).code === 0 } catch { return false }
  }
  const [qpdf, gs, soffice] = await Promise.all([check(BIN.qpdf), check(BIN.gs), check(BIN.soffice)])
  const value = { qpdf, gs, soffice }
  cache = { at: Date.now(), value }
  return value
}
