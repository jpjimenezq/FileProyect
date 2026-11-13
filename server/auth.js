import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { UserError } from './exec.js'

const COOKIE = 'fp_session'
const SESSION_MS = 30 * 24 * 3600 * 1000
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

/** Clave para firmar las sesiones: variable de entorno o fichero generado una vez en el directorio de datos */
export function loadSecret(dataDir) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  const file = path.join(dataDir, 'session.key')
  if (!existsSync(file)) {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 })
  }
  return readFileSync(file, 'utf8').trim()
}

export function normalizeEmail(email) {
  const e = String(email ?? '').trim().toLowerCase()
  if (!EMAIL.test(e)) throw new UserError('Escribe un correo válido.')
  return e
}

export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new UserError('La contraseña debe tener al menos 8 caracteres.')
  if (password.length > 200) throw new UserError('La contraseña es demasiado larga.')
}

export function hashPassword(password) {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

const sign = (secret, payload) => createHmac('sha256', secret).update(payload).digest('base64url')

/** `epoch` cambia al restablecer la contraseña: las sesiones anteriores dejan de valer */
export function makeToken(secret, userId, epoch = 0, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: userId, v: epoch, e: now + SESSION_MS })).toString('base64url')
  return `${payload}.${sign(secret, payload)}`
}

export function readToken(secret, token, now = Date.now()) {
  const [payload, sig] = String(token ?? '').split('.')
  if (!payload || !sig) return null
  const expected = Buffer.from(sign(secret, payload))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const { u, v, e } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return e > now ? { id: u, epoch: v ?? 0 } : null
  } catch {
    return null
  }
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split(/=(.*)/s, 2)).filter(([k]) => k))
}

export const sessionCookie = (token, secure) =>
  `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`
export const clearCookie = (secure) => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`
export const tokenFromRequest = (req) => parseCookies(req.headers.cookie)[COOKIE]

/** Token de un solo uso para el enlace del correo: en la base de datos solo se guarda su hash */
export const newResetToken = () => randomBytes(32).toString('base64url')
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')
