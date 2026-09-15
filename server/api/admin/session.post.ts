import {
  createSessionToken,
  setSessionCookie,
  verifyAdminPassword
} from '../../utils/admin-auth'
import { resolveAdminConfig } from '../../utils/admin-config'
import { assertSameOriginRequest } from '../../utils/admin-guard'
import {
  isLoginBlocked,
  recordLoginFailure,
  recordLoginSuccess
} from '../../utils/admin-throttle'
import type { AdminLoginResponse } from '../../../shared/types/admin'

/**
 * Create an admin session.
 *
 * Failures return the same generic 401 whether the password was wrong or the
 * throttled limit was hit in a way that reveals nothing about the secret.
 */
export default defineEventHandler(async event => {
  assertSameOriginRequest(event)

  const key = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const blocked = isLoginBlocked(key)

  if (blocked.blocked) {
    // h3 types `Retry-After` as a number of seconds.
    setResponseHeader(event, 'Retry-After', blocked.retryAfterSeconds ?? 60)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many failed attempts. Try again later.'
    })
  }

  const body: unknown = await readBody(event).catch(() => undefined)
  const submitted =
    typeof body === 'object' && body !== null && 'password' in body
      ? String((body as { password: unknown }).password ?? '')
      : ''

  if (!verifyAdminPassword(submitted)) {
    recordLoginFailure(key)
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid password.'
    })
  }

  recordLoginSuccess(key)

  const config = resolveAdminConfig()

  setSessionCookie(
    event,
    createSessionToken(config.sessionTtlSeconds),
    config.sessionTtlSeconds
  )

  const response: AdminLoginResponse = {
    authenticated: true,
    expiresInSeconds: config.sessionTtlSeconds
  }

  return response
})
