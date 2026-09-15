import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

import { isAdminEnabled, resolveAdminConfig } from './admin-config'

export const ADMIN_SESSION_COOKIE = 'framefolio_admin_session'
export const ADMIN_CSRF_HEADER = 'x-framefolio-admin'

interface SessionPayload {
  /** Issued-at, seconds since epoch. */
  iat: number
  /** Expiry, seconds since epoch. */
  exp: number
  /** Random nonce, so two sessions issued in the same second differ. */
  nonce: string
}

/**
 * Compare two strings without leaking length-independent timing information.
 *
 * `timingSafeEqual` requires equal-length buffers, so hash both sides first.
 * This keeps the comparison constant-time even when the lengths differ.
 */
export function safeEqual(left: string, right: string): boolean {
  const leftHash = createHmac('sha256', 'framefolio-compare')
    .update(left)
    .digest()
  const rightHash = createHmac('sha256', 'framefolio-compare')
    .update(right)
    .digest()

  return timingSafeEqual(leftHash, rightHash)
}

export function isAdminConfigured(): boolean {
  return isAdminEnabled(resolveAdminConfig())
}

/** Verify a submitted password against the configured one. */
export function verifyAdminPassword(submitted: string): boolean {
  const { password } = resolveAdminConfig()

  if (password === undefined) {
    return false
  }

  return safeEqual(submitted, password)
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

/**
 * Create a signed session token: `<base64url payload>.<hmac>`.
 *
 * A signed token (rather than a server-side store) keeps the admin area
 * stateless, which matches the single-container design: no database, and
 * restarting the container does not silently log the user out.
 */
export function createSessionToken(
  ttlSeconds: number,
  now: Date = new Date()
): string {
  const { sessionSecret } = resolveAdminConfig()

  if (sessionSecret.length === 0) {
    throw new Error('Cannot create a session without a configured secret.')
  }

  const issuedAt = Math.floor(now.getTime() / 1000)
  const payload: SessionPayload = {
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    nonce: randomBytes(12).toString('base64url')
  }

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${encoded}.${sign(encoded, sessionSecret)}`
}

/** Validate a session token's signature and expiry. */
export function verifySessionToken(
  token: string,
  now: Date = new Date()
): boolean {
  const { sessionSecret } = resolveAdminConfig()

  if (sessionSecret.length === 0) {
    return false
  }

  const separator = token.lastIndexOf('.')

  if (separator <= 0) {
    return false
  }

  const encoded = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  if (!safeEqual(signature, sign(encoded, sessionSecret))) {
    return false
  }

  let payload: unknown

  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return false
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as SessionPayload).exp !== 'number'
  ) {
    return false
  }

  return (payload as SessionPayload).exp > Math.floor(now.getTime() / 1000)
}

export function readSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, ADMIN_SESSION_COOKIE)
}

export function hasValidSession(event: H3Event): boolean {
  const token = readSessionCookie(event)

  return token !== undefined && verifySessionToken(token)
}

export function setSessionCookie(
  event: H3Event,
  token: string,
  ttlSeconds: number
): void {
  setCookie(event, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // The admin area is expected to sit behind HTTPS in production, but a
    // local HTTP deployment must still work, so `secure` follows the request.
    secure: isSecureRequest(event),
    path: '/',
    maxAge: ttlSeconds
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, ADMIN_SESSION_COOKIE, {
    path: '/'
  })
}

function isSecureRequest(event: H3Event): boolean {
  const forwarded = getRequestHeader(event, 'x-forwarded-proto')

  if (forwarded) {
    return forwarded.split(',')[0]?.trim() === 'https'
  }

  return getRequestURL(event).protocol === 'https:'
}
