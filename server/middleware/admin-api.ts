import { isAdminEnabled, resolveAdminConfig } from '../utils/admin-config'
import { hasValidSession } from '../utils/admin-auth'

/**
 * Hide the entire admin API when no password is configured.
 *
 * Returning 404 rather than 401 matters: it keeps a deployment that never
 * enabled the admin area indistinguishable from one where the routes do not
 * exist, so probing cannot reveal that an unconfigured admin surface is there.
 *
 * Endpoint handlers still call `requireAdmin`, which also validates the session
 * and the CSRF header; this middleware only handles the "feature disabled" case
 * so the check cannot be forgotten per-endpoint.
 */
export default defineEventHandler(event => {
  const path = event.path.split('?')[0] ?? ''

  if (!path.startsWith('/api/admin')) {
    return
  }

  const config = resolveAdminConfig()

  if (!isAdminEnabled(config)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found'
    })
  }

  // Session creation must be reachable without a session, so it is exempt from
  // the session check (it still validates the password itself).
  if (path === '/api/admin/session') {
    return
  }

  if (!hasValidSession(event)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required.'
    })
  }
})
