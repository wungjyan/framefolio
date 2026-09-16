import { describe, expect, it } from 'vitest'

import {
  resolvePhotoUrl,
  toPublicPhoto
} from '../../server/utils/gallery-index'
import { resolveActiveSource } from '../../shared/node/storage-config'
import type { PhotoIndexItem } from '../../shared/types/photo'

const ID = '0123456789abcdef'
const REVISION = 'fedcba9876543210'

function createPhoto(remote?: PhotoIndexItem['remote']): PhotoIndexItem {
  return {
    id: ID,
    filename: 'example.jpg',
    width: 2400,
    height: 1600,
    storage: {
      thumbnail: `${ID}-${REVISION}-thumbnail.webp`,
      preview: `${ID}-${REVISION}-preview.webp`
    },
    source: { size: 1024, mtimeMs: 1000, revision: REVISION },
    ...(remote ? { remote } : {})
  }
}

describe('photo URL resolution', () => {
  it('serves local media URLs when the source is local', () => {
    const photo = createPhoto()

    expect(
      resolvePhotoUrl(photo.storage.thumbnail, photo, { source: 'local' })
    ).toBe(`/media/${ID}-${REVISION}-thumbnail.webp`)
  })

  it('ignores a configured base URL while the source is local', () => {
    const photo = createPhoto()

    const url = resolvePhotoUrl(photo.storage.preview, photo, {
      source: 'local',
      publicBaseUrl: 'https://img.example.com'
    })

    expect(url).toBe(`/media/${ID}-${REVISION}-preview.webp`)
  })

  it('serves object storage URLs for an uploaded revision', () => {
    const photo = createPhoto({
      provider: 's3',
      revision: REVISION,
      uploadedAt: '2026-09-01T00:00:00.000Z'
    })

    const url = resolvePhotoUrl(photo.storage.thumbnail, photo, {
      source: 'r2',
      publicBaseUrl: 'https://img.example.com'
    })

    expect(url).toBe(`https://img.example.com/${ID}-${REVISION}-thumbnail.webp`)
  })

  it('falls back to local when this photo was never uploaded', () => {
    // The critical behaviour: one unpublished photo must not break the page.
    const photo = createPhoto()

    const url = resolvePhotoUrl(photo.storage.thumbnail, photo, {
      source: 'r2',
      publicBaseUrl: 'https://img.example.com'
    })

    expect(url).toBe(`/media/${ID}-${REVISION}-thumbnail.webp`)
  })

  it('falls back to local when the remote copy is stale', () => {
    const photo = createPhoto({
      provider: 's3',
      revision: '0000000000000000',
      uploadedAt: '2026-09-01T00:00:00.000Z'
    })

    const url = resolvePhotoUrl(photo.storage.thumbnail, photo, {
      source: 'r2',
      publicBaseUrl: 'https://img.example.com'
    })

    expect(url).toBe(`/media/${ID}-${REVISION}-thumbnail.webp`)
  })

  it('falls back to local when no public base URL is configured', () => {
    const photo = createPhoto({
      provider: 's3',
      revision: REVISION,
      uploadedAt: '2026-09-01T00:00:00.000Z'
    })

    const url = resolvePhotoUrl(photo.storage.thumbnail, photo, {
      source: 'r2'
    })

    expect(url).toBe(`/media/${ID}-${REVISION}-thumbnail.webp`)
  })

  it('applies an optional object key prefix', () => {
    const photo = createPhoto({
      provider: 's3',
      revision: REVISION,
      uploadedAt: '2026-09-01T00:00:00.000Z'
    })

    const url = resolvePhotoUrl(photo.storage.thumbnail, photo, {
      source: 'r2',
      publicBaseUrl: 'https://img.example.com',
      prefix: 'gallery'
    })

    expect(url).toBe(
      `https://img.example.com/gallery/${ID}-${REVISION}-thumbnail.webp`
    )
  })

  it('tolerates a trailing slash on the base URL', () => {
    const photo = createPhoto({
      provider: 's3',
      revision: REVISION,
      uploadedAt: '2026-09-01T00:00:00.000Z'
    })

    const url = resolvePhotoUrl(photo.storage.thumbnail, photo, {
      source: 'r2',
      publicBaseUrl: 'https://img.example.com/'
    })

    expect(url).toBe(`https://img.example.com/${ID}-${REVISION}-thumbnail.webp`)
  })

  it('resolves each variant independently', () => {
    const photo = createPhoto({
      provider: 's3',
      revision: REVISION,
      uploadedAt: '2026-09-01T00:00:00.000Z'
    })
    const context = {
      source: 'r2' as const,
      publicBaseUrl: 'https://img.example.com'
    }

    const publicPhoto = toPublicPhoto(photo, context)

    expect(publicPhoto.thumbnail).toBe(
      `https://img.example.com/${ID}-${REVISION}-thumbnail.webp`
    )
    expect(publicPhoto.preview).toBe(
      `https://img.example.com/${ID}-${REVISION}-preview.webp`
    )
  })

  it('keeps the public shape free of storage internals', () => {
    const publicPhoto = toPublicPhoto(createPhoto())

    expect(publicPhoto).not.toHaveProperty('storage')
    expect(publicPhoto).not.toHaveProperty('source')
    expect(publicPhoto).not.toHaveProperty('remote')
  })
})

describe('active storage source resolution', () => {
  const configured = {
    source: 'local' as const,
    endpoint: 'https://s3.test',
    region: 'auto',
    bucket: 'b',
    accessKeyId: 'k',
    secretAccessKey: 's',
    publicBaseUrl: 'https://cdn.test',
    prefix: undefined,
    forcePathStyle: false
  }

  it('uses the environment value when nothing is persisted', () => {
    const active = resolveActiveSource({
      storage: { ...configured, source: 'r2' }
    })

    expect(active.requested).toBe('r2')
    expect(active.effective).toBe('r2')
  })

  it('lets the persisted choice override the environment', () => {
    // This is the case the admin status endpoint got wrong: it reported the
    // environment value, so after switching to r2 the UI showed the radio on
    // "r2" while the caption below described local mode.
    const active = resolveActiveSource({
      storage: { ...configured, source: 'local' },
      persisted: 'r2'
    })

    expect(active.requested).toBe('r2')
    expect(active.effective).toBe('r2')
  })

  it('lets a persisted local choice override an r2 environment', () => {
    const active = resolveActiveSource({
      storage: { ...configured, source: 'r2' },
      persisted: 'local'
    })

    expect(active.requested).toBe('local')
    expect(active.effective).toBe('local')
  })

  it('falls back to local when r2 is requested without credentials', () => {
    // Requested and effective intentionally differ here: the UI must be able to
    // show "you asked for r2, but it is not configured, so local is in use".
    const active = resolveActiveSource({
      storage: {
        ...configured,
        source: 'local',
        endpoint: undefined,
        bucket: undefined,
        accessKeyId: undefined,
        secretAccessKey: undefined
      },
      persisted: 'r2'
    })

    expect(active.requested).toBe('r2')
    expect(active.effective).toBe('local')
  })
})
