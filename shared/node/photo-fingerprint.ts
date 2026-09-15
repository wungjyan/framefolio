import { createHash } from 'node:crypto'

import { GENERATED_IMAGE_HASH_LENGTH } from '../constants/gallery'
import type { PhotoSourceState } from '../types/photo'

/**
 * Pure photo-fingerprint helpers.
 *
 * These live in `shared/` on purpose: the sync pipeline (which loads sharp) and
 * the admin API (which must NOT load native image code in the request path)
 * both need to compute the same revision. Keeping them here means the admin API
 * can compare a file on disk against the published index without importing the
 * pipeline.
 */

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replaceAll('\\', '/').normalize('NFC')
}

export function shortHash(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, GENERATED_IMAGE_HASH_LENGTH)
}

export function createPhotoId(relativePath: string): string {
  return shortHash(normalizeRelativePath(relativePath))
}

export function createPhotoRevision(
  relativePath: string,
  source: Pick<PhotoSourceState, 'size' | 'mtimeMs'>,
  pipelineVersion: number
): string {
  return shortHash(
    [
      normalizeRelativePath(relativePath),
      String(source.size),
      String(source.mtimeMs),
      String(pipelineVersion)
    ].join('\0')
  )
}

/** True when a file on disk still matches what the index recorded. */
export function sourcesMatch(
  left: Pick<PhotoSourceState, 'size' | 'mtimeMs' | 'revision'>,
  right: Pick<PhotoSourceState, 'size' | 'mtimeMs' | 'revision'>
): boolean {
  return (
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.revision === right.revision
  )
}
