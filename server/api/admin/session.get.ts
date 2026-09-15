import { hasValidSession } from '../../utils/admin-auth'
import { resolveAdminConfig } from '../../utils/admin-config'
import type { AdminSessionResponse } from '../../../shared/types/admin'

/**
 * Report whether the caller holds a valid session.
 *
 * The admin SPA calls this on load to decide between the login screen and the
 * dashboard. The middleware has already verified the session for every
 * `/api/admin/*` path except this one, so this handler repeats the check rather
 * than assuming it.
 */
export default defineEventHandler(event => {
  const config = resolveAdminConfig()
  const authenticated = hasValidSession(event)

  const response: AdminSessionResponse = {
    authenticated,
    ...(authenticated ? { expiresInSeconds: config.sessionTtlSeconds } : {})
  }

  return response
})
