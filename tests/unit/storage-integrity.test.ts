import { describe, expect, it } from 'vitest'

import { summarizeStorageIntegrity } from '../../shared/node/storage-integrity'

/**
 * The admin storage panel reported two numbers from two different sources:
 * "uploaded 23 / 23" came from the index's own record, while "completeness 0%"
 * came from a real bucket listing. With the bucket emptied, the panel asserted
 * both at once. These tests pin every count to one source of truth.
 */

const thumb = 'aaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-thumbnail.webp'
const preview = 'aaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-preview.webp'
const otherThumb = 'cccccccccccccccc-dddddddddddddddd-thumbnail.webp'
const otherPreview = 'cccccccccccccccc-dddddddddddddddd-preview.webp'

const REVISION = 'bbbbbbbbbbbbbbbb'

/** A photo the index publishes to object storage. */
function published(thumbnail: string, preview2: string) {
  return {
    storage: { thumbnail, preview: preview2 },
    remote: { provider: 's3' as const, revision: REVISION, uploadedAt: '' },
    source: { size: 1, mtimeMs: 1, revision: REVISION }
  }
}

/** A photo whose upload never succeeded: no remote state, so URLs fall back. */
function unpublished(thumbnail: string, preview2: string) {
  return {
    storage: { thumbnail, preview: preview2 },
    source: { size: 1, mtimeMs: 1, revision: REVISION }
  }
}

function photo(thumbnail: string, preview2: string) {
  return published(thumbnail, preview2)
}

describe('storage integrity summary', () => {
  it('counts a photo as available only when both derivatives are present', () => {
    const summary = summarizeStorageIntegrity({
      photos: [photo(thumb, preview)],
      storedKeys: [thumb]
    })

    // Half an upload is a broken image, not a usable photo.
    expect(summary.photosWithRemote).toBe(0)
    expect(summary.missingObjects).toBe(1)
    expect(summary.expectedObjects).toBe(2)
  })

  it('reports zero available photos for an emptied bucket, not the index claim', () => {
    // The exact contradiction seen in the panel: the index still records both
    // photos as uploaded, but the bucket is empty.
    const summary = summarizeStorageIntegrity({
      photos: [photo(thumb, preview), photo(otherThumb, otherPreview)],
      storedKeys: []
    })

    expect(summary.photosWithRemote).toBe(0)
    expect(summary.missingObjects).toBe(4)
    expect(summary.orphanedObjects).toBe(0)
    expect(summary.storedObjects).toBe(0)
  })

  it('reports full availability when the bucket matches the index', () => {
    const summary = summarizeStorageIntegrity({
      photos: [photo(thumb, preview), photo(otherThumb, otherPreview)],
      storedKeys: [thumb, preview, otherThumb, otherPreview]
    })

    expect(summary.photosWithRemote).toBe(2)
    expect(summary.missingObjects).toBe(0)
    expect(summary.orphanedObjects).toBe(0)
  })

  it('counts only derivative-shaped objects as orphans', () => {
    // A bucket shared with other applications must not report their files as
    // something Framefolio will clean up, because it never will.
    const summary = summarizeStorageIntegrity({
      photos: [photo(thumb, preview)],
      storedKeys: [
        thumb,
        preview,
        otherThumb,
        'notes.txt',
        'other-app/logo.png'
      ]
    })

    expect(summary.orphanedObjects).toBe(1)
    expect(summary.storedObjects).toBe(5)
  })

  it('keeps availability and completeness consistent with each other', () => {
    // Availability and completeness must agree for every bucket state, which is
    // precisely what the old two-source implementation failed to guarantee.
    //
    // The invariant is not "0% means 0 photos": a half-uploaded photo really is
    // partial completeness with nothing usable. It is that the two can only
    // disagree about being *fully* done, never about being fully broken.
    const photos = [photo(thumb, preview), photo(otherThumb, otherPreview)]

    const cases: { stored: string[]; available: number }[] = [
      { stored: [], available: 0 },
      { stored: [thumb], available: 0 },
      { stored: [thumb, preview], available: 1 },
      { stored: [thumb, preview, otherThumb], available: 1 },
      { stored: [thumb, preview, otherThumb, otherPreview], available: 2 }
    ]

    for (const testCase of cases) {
      const summary = summarizeStorageIntegrity({
        photos,
        storedKeys: testCase.stored
      })

      expect(summary.photosWithRemote).toBe(testCase.available)
      // Every photo usable exactly when nothing is missing, and vice versa.
      expect(summary.missingObjects === 0).toBe(
        summary.photosWithRemote === photos.length
      )
      // An emptied bucket can never report usable photos.
      if (testCase.stored.length === 0) {
        expect(summary.photosWithRemote).toBe(0)
      }
    }
  })

  it('handles an empty index without dividing by zero', () => {
    const summary = summarizeStorageIntegrity({ photos: [], storedKeys: [] })

    expect(summary).toEqual({
      photosWithRemote: 0,
      expectedObjects: 0,
      missingObjects: 0,
      orphanedObjects: 0,
      storedObjects: 0,
      photosPublishedButMissing: 0
    })
  })

  /**
   * The distinction that decides whether the "that's just cache" warning is
   * true. Only photos the index publishes to the CDN keep resolving to a CDN
   * URL after their files vanish; a never-uploaded photo falls back to /media.
   */
  it('distinguishes published-then-missing from never-uploaded', () => {
    const summary = summarizeStorageIntegrity({
      photos: [
        published(thumb, preview), // was on the CDN, now gone
        unpublished(otherThumb, otherPreview) // upload never succeeded
      ],
      storedKeys: []
    })

    // Both are missing from the bucket...
    expect(summary.missingObjects).toBe(4)
    // ...but only the published one renders from cache instead of /media.
    expect(summary.photosPublishedButMissing).toBe(1)
  })

  it('does not flag cache when the upload simply never succeeded', () => {
    const summary = summarizeStorageIntegrity({
      photos: [unpublished(thumb, preview)],
      storedKeys: []
    })

    // Its URL falls back to /media, so nothing is served from cache and
    // claiming otherwise would be false.
    expect(summary.photosPublishedButMissing).toBe(0)
    expect(summary.missingObjects).toBe(2)
  })

  it('stops flagging cache once the objects are back', () => {
    const summary = summarizeStorageIntegrity({
      photos: [published(thumb, preview)],
      storedKeys: [thumb, preview]
    })

    expect(summary.photosPublishedButMissing).toBe(0)
    expect(summary.photosWithRemote).toBe(1)
  })
})
