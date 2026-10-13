/**
 * Stable error codes shared by the admin API and the admin UI.
 *
 * The server returns a code in `createError({ data: { code } })` instead of a
 * human-readable message, because it has no way to know which language the
 * admin UI is showing. `statusMessage` is still set for logs, HTTP clients, and
 * anyone reading the response by hand, but the UI never renders it: it maps the
 * code to a translated string.
 *
 * A typo on either side is a compile error, and `admin-errors.test.ts` asserts
 * that every code here has a message.
 */
export const ADMIN_ERROR_CODES = [
  'auth-required',
  'missing-admin-header',
  'invalid-filename',
  'missing-request-body',
  'empty-upload',
  'upload-unsupported-type',
  'upload-not-an-image',
  'upload-extension-mismatch',
  'upload-dimensions-unreadable',
  'upload-too-many-pixels',
  'upload-too-large',
  'photo-not-found',
  'trash-cross-device',
  'storage-source-invalid',
  'storage-source-unconfigured',
  'login-throttled',
  'login-invalid-password',
  'sync-already-running'
] as const

export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number]

/** Shape of the `data` field on an admin API error response. */
export interface AdminErrorData {
  code: AdminErrorCode
  /**
   * Values interpolated into the translated message, such as `{ extension }`.
   *
   * Numbers and pre-formatted strings only: the server never sends a sentence
   * fragment, so nothing here needs translating.
   */
  params?: Record<string, string | number>
}
