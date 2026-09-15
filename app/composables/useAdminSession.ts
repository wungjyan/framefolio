import { useAdminApi } from './useAdminApi'

/**
 * Admin session state.
 *
 * The admin area is a client-rendered SPA, so this composable owns the
 * authenticated/unauthenticated decision and exposes it to the page. Session
 * state is intentionally module-level: the admin surface is a single page, and
 * keeping it here avoids prop-drilling through the layout.
 */
const authenticated = ref(false)
const checking = ref(true)
/**
 * True when the server reports that the admin area is not configured.
 *
 * The server returns 404 for every `/api/admin/*` route in that state, which
 * keeps an unconfigured deployment indistinguishable from one where the routes
 * do not exist. The page must still explain what is wrong: showing a login form
 * that can never succeed would make the user guess a password and fail before
 * learning that no password is set.
 */
const disabled = ref(false)

export function useAdminSession() {
  const api = useAdminApi()

  /** Ask the server whether the current cookie is valid. */
  async function refresh(): Promise<boolean> {
    checking.value = true

    try {
      const session = await api.getSession()
      disabled.value = false
      authenticated.value = session.authenticated
    } catch (error: unknown) {
      // A 404 means the endpoint is absent because the feature is switched off,
      // which is a configuration problem, not a failed login.
      disabled.value = readStatusCode(error) === 404
      authenticated.value = false
    } finally {
      checking.value = false
    }

    return authenticated.value
  }

  async function login(password: string): Promise<void> {
    await api.login(password)
    authenticated.value = true
  }

  async function logout(): Promise<void> {
    try {
      await api.logout()
    } finally {
      authenticated.value = false
    }
  }

  return {
    authenticated: readonly(authenticated),
    checking: readonly(checking),
    disabled: readonly(disabled),
    refresh,
    login,
    logout
  }
}

function readStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { statusCode?: unknown }
    const statusCode = Number(candidate.statusCode)
    return Number.isFinite(statusCode) ? statusCode : 0
  }

  return 0
}

/** Test helper: reset module-level session state between cases. */
export function resetAdminSessionState(): void {
  authenticated.value = false
  checking.value = true
  disabled.value = false
}
