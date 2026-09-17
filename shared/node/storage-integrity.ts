import { GENERATED_IMAGE_FILENAME_PATTERN } from '../constants/gallery'
import type { PhotoIndexItem } from '../types/photo'

/**
 * Compare the published index against what is actually in the bucket.
 *
 * Pure, so it can be tested without S3 and reused by the admin report. Keeping
 * it here rather than inline in the endpoint matters more than it looks: the
 * bug this replaces was an endpoint counting "uploaded" photos from the index's
 * own claim while the completeness line beside it counted real objects, so the
 * panel could read "uploaded 23 / 23" and "completeness 0%" at the same time.
 * One function producing every number makes that contradiction unrepresentable.
 */

export interface StorageIntegritySummary {
  /** Photos whose both derivatives are present in the bucket. */
  photosWithRemote: number
  /** Derivatives the index references (two per photo). */
  expectedObjects: number
  /** Referenced derivatives that are absent from the bucket. */
  missingObjects: number
  /** Unreferenced objects that look like our derivatives, i.e. removable. */
  orphanedObjects: number
  /** Objects found in the bucket. */
  storedObjects: number
  /**
   * Photos that the index publishes to object storage but whose files are gone
   * from the bucket.
   *
   * These are the dangerous ones, and they are a strict subset of the missing
   * objects. Because the index still records the upload, URL resolution keeps
   * pointing at the CDN, so the gallery continues to render **from cache**
   * until that cache expires — at which point the images break with no local
   * fallback.
   *
   * A photo whose upload simply never succeeded is *not* counted here: its
   * index entry has no remote state, so URLs already fall back to `/media` and
   * it renders from local files. Warning about caching there would be wrong.
   */
  photosPublishedButMissing: number
}

export function summarizeStorageIntegrity(input: {
  photos: Pick<PhotoIndexItem, 'storage' | 'remote' | 'source'>[]
  /** Storage keys present in the bucket, already stripped of any prefix. */
  storedKeys: Iterable<string>
}): StorageIntegritySummary {
  const stored = new Set(input.storedKeys)
  const expectedKeys = input.photos.flatMap(photo => [
    photo.storage.thumbnail,
    photo.storage.preview
  ])
  const expectedSet = new Set(expectedKeys)

  const missingObjects = expectedKeys.filter(key => !stored.has(key)).length

  // Only keys matching the derivative filename pattern count as orphans,
  // because only those are ever removed. Counting every unreferenced object
  // would advertise a cleanup that deliberately never happens for foreign files
  // in a shared bucket.
  const orphanedObjects = [...stored].filter(
    key => GENERATED_IMAGE_FILENAME_PATTERN.test(key) && !expectedSet.has(key)
  ).length

  // A photo counts only when BOTH derivatives are present: one missing file is
  // a broken image on the site, so a half-uploaded photo is not usable.
  const present = (photo: Pick<PhotoIndexItem, 'storage'>): boolean =>
    stored.has(photo.storage.thumbnail) && stored.has(photo.storage.preview)

  const photosWithRemote = input.photos.filter(present).length

  // Published to the CDN (so URLs point there) yet absent from the bucket.
  const photosPublishedButMissing = input.photos.filter(
    photo =>
      photo.remote !== undefined &&
      photo.remote.revision === photo.source.revision &&
      !present(photo)
  ).length

  return {
    photosWithRemote,
    expectedObjects: expectedKeys.length,
    missingObjects,
    orphanedObjects,
    storedObjects: stored.size,
    photosPublishedButMissing
  }
}
