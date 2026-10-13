import type { AdminErrorCode } from '../../shared/constants/admin-errors'

/**
 * Throw an admin API error the UI can translate.
 *
 * `createError` is used as a Nitro auto-import, like every other server file in
 * this project, rather than importing from `h3` (which is not a direct
 * dependency).
 *
 * The `statusMessage` stays English and is for logs, `curl`, and reverse
 * proxies. The admin UI never renders it: it reads `data.code` and looks up a
 * translated message, so one response serves both languages.
 *
 * `params` carries only values (numbers, extensions, formats) — never a
 * sentence — so the entire message lives in the catalogues.
 */
export function throwAdminError(
  statusCode: number,
  code: AdminErrorCode,
  statusMessage: string,
  params?: Record<string, string | number>
): never {
  throw createError({
    statusCode,
    statusMessage,
    data: params ? { code, params } : { code }
  })
}
