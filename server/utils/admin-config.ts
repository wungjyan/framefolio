/**
 * Admin configuration, read from the environment at request time.
 *
 * Environment names follow the documented `FRAMEFOLIO_*` scheme rather than
 * Nuxt's `NUXT_*` runtimeConfig convention, so the Docker Compose files use one
 * consistent prefix across admin, storage, and sync settings.
 */

export interface AdminConfig {
  /** `undefined` when admin is disabled because no password is configured. */
  password: string | undefined
  /** Secret used to sign session cookies. */
  sessionSecret: string
  sessionTtlSeconds: number
  /** Maximum upload size per file, in bytes. */
  maxUploadBytes: number
  /** Maximum accepted pixel count for an uploaded original. */
  maxUploadPixels: number
}

export const ADMIN_PASSWORD_ENV = 'FRAMEFOLIO_ADMIN_PASSWORD'
export const SESSION_SECRET_ENV = 'FRAMEFOLIO_SESSION_SECRET'
export const SESSION_TTL_ENV = 'FRAMEFOLIO_SESSION_TTL'
export const MAX_UPLOAD_BYTES_ENV = 'FRAMEFOLIO_MAX_UPLOAD_BYTES'
export const MAX_UPLOAD_PIXELS_ENV = 'FRAMEFOLIO_MAX_UPLOAD_PIXELS'

const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const DEFAULT_MAX_UPLOAD_PIXELS = 120_000_000

export function resolveAdminConfig(
  environment: NodeJS.ProcessEnv = process.env
): AdminConfig {
  const password = normalizeSecret(environment[ADMIN_PASSWORD_ENV])

  return {
    password,
    // Deriving the fallback from the password means the default deployment
    // needs no extra configuration, while an explicit secret still allows
    // rotating sessions without changing the password.
    sessionSecret:
      normalizeSecret(environment[SESSION_SECRET_ENV]) ?? password ?? '',
    sessionTtlSeconds: readPositiveInteger(
      environment[SESSION_TTL_ENV],
      DEFAULT_SESSION_TTL_SECONDS
    ),
    maxUploadBytes: readPositiveInteger(
      environment[MAX_UPLOAD_BYTES_ENV],
      DEFAULT_MAX_UPLOAD_BYTES
    ),
    maxUploadPixels: readPositiveInteger(
      environment[MAX_UPLOAD_PIXELS_ENV],
      DEFAULT_MAX_UPLOAD_PIXELS
    )
  }
}

/** Admin is enabled only when a non-empty password is configured. */
export function isAdminEnabled(config: AdminConfig): boolean {
  return config.password !== undefined && config.sessionSecret.length > 0
}

function normalizeSecret(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  if (value === undefined) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}
