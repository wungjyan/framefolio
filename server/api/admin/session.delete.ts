import { clearSessionCookie } from '../../utils/admin-auth'
import { assertSameOriginRequest } from '../../utils/admin-guard'

/** Sign out by clearing the session cookie. */
export default defineEventHandler(event => {
  assertSameOriginRequest(event)
  clearSessionCookie(event)

  return { authenticated: false }
})
