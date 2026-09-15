/**
 * Minimal in-memory login throttle.
 *
 * This is deliberately simple: the admin area has exactly one user, so a
 * per-IP failure counter is enough to make online guessing impractical without
 * adding a store. State is per-process, which is acceptable because the app
 * runs as a single container.
 */

interface Attempt {
  failures: number
  /** When the current lockout ends, if any. */
  blockedUntil: number
}

const attempts = new Map<string, Attempt>()

const MAX_FAILURES = 8
const WINDOW_MS = 15 * 60 * 1000
const BASE_LOCKOUT_MS = 5 * 1000
const MAX_LOCKOUT_MS = 5 * 60 * 1000

export function isLoginBlocked(
  key: string,
  now: number = Date.now()
): { blocked: boolean; retryAfterSeconds?: number } {
  const attempt = attempts.get(key)

  if (!attempt || attempt.blockedUntil <= now) {
    return { blocked: false }
  }

  return {
    blocked: true,
    retryAfterSeconds: Math.ceil((attempt.blockedUntil - now) / 1000)
  }
}

export function recordLoginFailure(
  key: string,
  now: number = Date.now()
): void {
  const attempt = attempts.get(key) ?? { failures: 0, blockedUntil: 0 }

  attempt.failures += 1

  if (attempt.failures >= MAX_FAILURES) {
    // Exponential backoff, capped, so sustained guessing gets progressively
    // more expensive without locking the owner out indefinitely.
    const overage = attempt.failures - MAX_FAILURES
    const lockout = Math.min(BASE_LOCKOUT_MS * 2 ** overage, MAX_LOCKOUT_MS)

    attempt.blockedUntil = now + lockout
  }

  attempts.set(key, attempt)

  // Opportunistic cleanup so the map cannot grow without bound.
  for (const [entryKey, entry] of attempts) {
    if (entry.blockedUntil !== 0 && entry.blockedUntil < now - WINDOW_MS) {
      attempts.delete(entryKey)
    }
  }
}

export function recordLoginSuccess(key: string): void {
  attempts.delete(key)
}

/** Test helper: reset all throttle state. */
export function resetLoginThrottle(): void {
  attempts.clear()
}
