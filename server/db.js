import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    plan_until INTEGER,
    stripe_customer TEXT,
    stripe_subscription TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS users_customer ON users(stripe_customer);
  CREATE TABLE IF NOT EXISTS usage (
    actor TEXT NOT NULL,
    kind TEXT NOT NULL,
    period TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (actor, kind, period)
  );
  CREATE TABLE IF NOT EXISTS reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reset_user ON reset_tokens(user_id);
`

/** Columnas añadidas después de la primera versión: se crean si la base de datos es anterior */
const MIGRATIONS = [
  ['session_epoch', 'INTEGER NOT NULL DEFAULT 0'],
  ['terms_accepted_at', 'INTEGER'],
]

/** Almacén sobre SQLite (node:sqlite, sin dependencias). `:memory:` para pruebas. */
export function openStore(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(SCHEMA)
  const have = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name))
  for (const [name, def] of MIGRATIONS) if (!have.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`)

  const q = {
    insertUser: db.prepare('INSERT INTO users (email, pass_hash, created_at, terms_accepted_at) VALUES (?, ?, ?, ?)'),
    byEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    byCustomer: db.prepare('SELECT * FROM users WHERE stripe_customer = ?'),
    setPlan: db.prepare('UPDATE users SET plan = ?, plan_until = ?, stripe_customer = COALESCE(?, stripe_customer), stripe_subscription = COALESCE(?, stripe_subscription) WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET pass_hash = ?, session_epoch = session_epoch + 1 WHERE id = ?'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    deleteUsage: db.prepare('DELETE FROM usage WHERE actor = ?'),
    getUsage: db.prepare('SELECT amount FROM usage WHERE actor = ? AND kind = ? AND period = ?'),
    addUsage: db.prepare('INSERT INTO usage (actor, kind, period, amount) VALUES (?, ?, ?, ?) ON CONFLICT(actor, kind, period) DO UPDATE SET amount = amount + excluded.amount'),
    pruneUsage: db.prepare('DELETE FROM usage WHERE period < ?'),
    addReset: db.prepare('INSERT INTO reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'),
    resetByHash: db.prepare('SELECT * FROM reset_tokens WHERE token_hash = ?'),
    resetsSince: db.prepare('SELECT COUNT(*) AS n FROM reset_tokens WHERE user_id = ? AND created_at > ?'),
    deleteResets: db.prepare('DELETE FROM reset_tokens WHERE user_id = ?'),
    pruneResets: db.prepare('DELETE FROM reset_tokens WHERE expires_at < ?'),
  }

  return {
    createUser: (email, passHash, termsAt = null) => Number(q.insertUser.run(email, passHash, Date.now(), termsAt).lastInsertRowid),
    userByEmail: (email) => q.byEmail.get(email),
    userById: (id) => q.byId.get(id),
    userByCustomer: (customer) => q.byCustomer.get(customer),
    setPlan: (id, { plan, until = null, customer = null, subscription = null }) => q.setPlan.run(plan, until, customer, subscription, id),
    /** Cambia la contraseña y cierra todas las sesiones abiertas (sube la "época" de sesión) */
    setPassword: (id, passHash) => q.setPassword.run(passHash, id),
    deleteUser: (id) => { q.deleteUsage.run(`u:${id}`); q.deleteResets.run(id); q.deleteUser.run(id) },
    usage: (actor, kind, period) => q.getUsage.get(actor, kind, period)?.amount ?? 0,
    addUsage: (actor, kind, period, amount) => q.addUsage.run(actor, kind, period, amount),
    /** Los contadores diarios de hace más de 2 días ya no sirven */
    prune: (olderThanDay) => { q.pruneUsage.run(`d:${olderThanDay}`); q.pruneResets.run(Date.now()) },
    /** Guarda solo el hash del enlace: si alguien lee la base de datos no puede restablecer contraseñas */
    addResetToken: (userId, tokenHash, expiresAt) => q.addReset.run(tokenHash, userId, expiresAt, Date.now()),
    resetToken: (tokenHash) => q.resetByHash.get(tokenHash),
    resetsSince: (userId, since) => q.resetsSince.get(userId, since).n,
    clearResetTokens: (userId) => q.deleteResets.run(userId),
    close: () => db.close(),
  }
}
