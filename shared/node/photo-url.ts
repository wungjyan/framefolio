/** Route prefix serving locally generated derivatives. */
export const MEDIA_ROUTE_PREFIX = '/media/'

/**
 * Which storage source URLs are built against, and how.
 *
 * `source: 'local'` always yields `/media/<key>`. `source: 'r2'` yields the
 * object-storage URL *for a photo whose current revision was uploaded*, and
 * falls back to `/media/<key>` otherwise. The fallback is per photo so a
 * partially published library shows a mix rather than broken images.
 */
export interface PhotoUrlContext {
  source: StorageSource
  /** Public base URL for object storage, e.g. `https://img.example.com`. */
  publicBaseUrl?: string
  /** Optional object key prefix for sharing one bucket between sites. */
  prefix?: string
}

export type StorageSource = 'local' | 'r2'

export function parseStorageSource(value: unknown): StorageSource {
  return value === 'r2' ? 'r2' : 'local'
}
