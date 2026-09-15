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

export function useAdminSession() {
  const api = useAdminApi()

  /** Ask the server whether the current cookie is valid. */
  async function refresh(): Promise<boolean> {
    checking.value = true

    try {
      const session = await api.getSession()
      authenticated.value = session.authenticated
    } catch (error: unknown) {
      // A 401 simply means "not logged in yet"; anything else is also treated
      // as unauthenticated so the login form is shown rather than a blank page.
      authenticated.value = false
      void error
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
    refresh,
    login,
    logout
  }
}

/** Test helper: reset module-level session state between cases. */
export function resetAdminSessionState(): void {
  authenticated.value = false
  checking.value = true
}
