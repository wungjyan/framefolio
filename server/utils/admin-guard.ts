import type { H3Event } from 'h3'

import { ADMIN_CSRF_HEADER, hasValidSession } from './admin-auth'
import { isAdminEnabled, resolveAdminConfig } from './admin-config'
import { throwAdminError } from './admin-error'

/**
 * Guard every admin API request.
 *
 * Two rules, deliberately ordered:
 *  1. When no password is configured the whole admin surface must look absent,
 *     so an unconfigured deployment cannot be probed. A 404 is indistinguishable
 *     from the routes not existing.
 *  2. Authenticated requests must come from our own admin UI: state-changing
 *     methods require a custom header, which a cross-site form cannot set.
 */
export function requireAdmin(event: H3Event): void {
  const config = resolveAdminConfig()

  if (!isAdminEnabled(config)) {
    // Deliberately NOT a coded error. The whole point is that an unconfigured
    // deployment is indistinguishable from one where the routes do not exist,
    // so this must not carry the `data.code` field that would identify it as
    // our own response.
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found'
    })
  }

  if (!hasValidSession(event)) {
    throwAdminError(401, 'auth-required', 'Authentication required.')
  }

  assertSameOriginRequest(event)
}

/**
 * Reject a state-changing request that did not carry our custom header.
 *
 * `SameSite=Lax` already blocks cross-site cookie sending for POST/PUT/DELETE,
 * so this is defence in depth for browsers or proxies that relax that.
 */
export function assertSameOriginRequest(event: H3Event): void {
  const method = event.method.toUpperCase()

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return
  }

  if (getRequestHeader(event, ADMIN_CSRF_HEADER) !== '1') {
    throwAdminError(
      403,
      'missing-admin-header',
      'Missing admin request header.'
    )
  }
}
