import type { AdminErrorCode } from '../../shared/constants/admin-errors'
import type { GalleryLocale } from '../utils/locale'
import { en } from './en'
import { zh } from './zh'

export type { AdminErrorCode }

/**
 * `AdminErrorCode` is imported as a TYPE only.
 *
 * That is a hard constraint, not a preference: `app/` code is bundled by Nuxt's
 * client and server builds, and a *runtime* import reaching back into `shared/`
 * cannot be resolved by the Nitro server bundle (the emitted chunk lives under
 * `node_modules/.cache`, so the relative path escapes the build root). Every
 * other `app/` -> `shared/` import in this project is type-only for the same
 * reason.
 *
 * The runtime list of valid codes is therefore derived from the catalogues
 * instead of imported. `admin-errors.test.ts` asserts that the derived set and
 * `ADMIN_ERROR_CODES` agree, so the two cannot drift.
 */

/** Every message key, derived from the Chinese catalogue. */
export type MessageKey = keyof typeof zh

export type MessageParams = Record<string, string | number>

/**
 * All catalogues.
 *
 * Both are plain modules rather than lazily fetched chunks: this is a two
 * language admin SPA with a few hundred short strings, so shipping both costs
 * far less than an async load, a loading state, and a flash of untranslated
 * text after every switch.
 *
 * `Record<MessageKey, string>` on the English entry is what makes a missing
 * translation a compile error rather than a silent fallback to Chinese.
 */
export const MESSAGES: Record<GalleryLocale, Record<MessageKey, string>> = {
  zh,
  en
}

const ERROR_KEY_PREFIX = 'error.'

/**
 * Substitute `{name}` placeholders.
 *
 * An unknown placeholder is left as written rather than replaced with an empty
 * string: seeing `{count}` on screen is an obvious bug report, whereas a blank
 * leaves a sentence that merely reads oddly.
 */
export function interpolate(
  template: string,
  params: MessageParams | undefined
): string {
  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}

export function translate(
  locale: GalleryLocale,
  key: MessageKey,
  params?: MessageParams
): string {
  return interpolate(MESSAGES[locale][key], params)
}

/**
 * Every message key that names a server error code.
 *
 * Derived from the catalogue rather than imported: `AdminErrorCode` must stay a
 * type-only import (see the note above). The convention that makes this sound is
 * that the `error.*` namespace holds exactly the server codes — client-only
 * fallbacks are namespaced `local.*` instead.
 */
const ERROR_CODES: ReadonlySet<string> = new Set(
  (Object.keys(zh) as MessageKey[])
    .filter(key => key.startsWith(ERROR_KEY_PREFIX))
    .map(key => key.slice(ERROR_KEY_PREFIX.length))
)

/**
 * Message key for a server error code.
 *
 * Every code has a matching `error.*` message; `admin-errors.test.ts` asserts
 * that, so the cast cannot hide a code without a translation.
 */
export function errorMessageKey(code: AdminErrorCode): MessageKey {
  return `${ERROR_KEY_PREFIX}${code}` as MessageKey
}

export function isAdminErrorCode(value: unknown): value is AdminErrorCode {
  return typeof value === 'string' && ERROR_CODES.has(value)
}

/** All codes the UI knows, for tests and diagnostics. */
export function knownAdminErrorCodes(): string[] {
  return [...ERROR_CODES].sort()
}

/** Narrow the `params` field of a server error payload. */
export function isMessageParams(value: unknown): value is MessageParams {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      entry => typeof entry === 'string' || typeof entry === 'number'
    )
  )
}
