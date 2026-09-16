import crypto from 'node:crypto'

const sessions = new Map()
const loginAttempts = new Map()

export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltText, keyText] = String(stored).split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltText, 'base64')
    const expected = Buffer.from(keyText, 'base64')
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function parseCookies(header = '') {
  const result = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key) result[key] = decodeURIComponent(value)
  }
  return result
}

export function createSession(username, ttlHours) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + ttlHours * 3600000
  sessions.set(token, { username, createdAt: Date.now(), expiresAt })
  return { token, expiresAt }
}

export function getSession(token) {
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token)
    return null
  }
  return session
}

export function deleteSession(token) {
  if (token) sessions.delete(token)
}

export function deleteSessionsExcept(token) {
  for (const key of sessions.keys()) {
    if (key !== token) sessions.delete(key)
  }
}

export function sessionCookie(token, expiresAt, secure = false) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  return [
    `mihomo_console=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function clearSessionCookie() {
  return 'mihomo_console=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
}

export function loginRateLimited(ip) {
  const item = loginAttempts.get(ip)
  if (!item) return false
  if (item.lockedUntil && item.lockedUntil > Date.now()) return true
  if (item.lockedUntil && item.lockedUntil <= Date.now()) loginAttempts.delete(ip)
  return false
}

export function recordLoginFailure(ip) {
  const current = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 }
  current.count += 1
  if (current.count >= 5) {
    current.lockedUntil = Date.now() + 15 * 60000
    current.count = 0
  }
  loginAttempts.set(ip, current)
}

export function clearLoginFailures(ip) {
  loginAttempts.delete(ip)
}

export function cleanupSessions() {
  const now = Date.now()
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(token)
  }
}
