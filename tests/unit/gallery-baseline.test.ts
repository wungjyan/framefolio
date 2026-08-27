import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'

import { ensureGalleryDirectories } from '../../scripts/lib/gallery-sync'
import {
  GENERATED_IMAGE_COLOURSPACE,
  GENERATED_IMAGE_EXTENSION,
  GALLERY_PIPELINE_VERSION,
  GALLERY_SCHEMA_VERSION,
  IMAGE_RESIZE_OPTIONS,
  IMAGE_VARIANTS
} from '../../shared/constants/gallery'
import { resolveGalleryPaths } from '../../shared/node/gallery-paths'
import type {
  GalleryIndex,
  GalleryPhoto,
  PhotoIndexItem,
  PhotosResponse
} from '../../shared/types/photo'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, {
      recursive: true,
      force: true
    }))
  )
})

describe('gallery baseline', () => {
  it('keeps the schema and image processing contract stable', () => {
    expect(GALLERY_SCHEMA_VERSION).toBe(1)
    expect(GALLERY_PIPELINE_VERSION).toBe(2)
    expect(GENERATED_IMAGE_EXTENSION).toBe('webp')
    expect(GENERATED_IMAGE_COLOURSPACE).toBe('srgb')
    expect(IMAGE_RESIZE_OPTIONS).toEqual({
      fit: 'inside',
      withoutEnlargement: true
    })
    expect(IMAGE_VARIANTS.thumbnail).toMatchObject({ maxEdge: 960, quality: 82 })
    expect(IMAGE_VARIANTS.preview).toMatchObject({ maxEdge: 2560, quality: 88 })
  })

  it('uses one public photo contract for index and API data', () => {
    expectTypeOf<PhotoIndexItem>().toExtend<GalleryPhoto>()
    expectTypeOf<GalleryIndex['photos']>().toEqualTypeOf<PhotoIndexItem[]>()
    expectTypeOf<PhotosResponse>().toEqualTypeOf<GalleryPhoto[]>()
  })

  it('resolves the default data paths and creates required directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'framefolio-'))
    temporaryDirectories.push(root)

    const paths = resolveGalleryPaths({
      currentWorkingDirectory: root,
      environment: {}
    })

    expect(paths.data).toBe(join(root, 'data'))
    expect(paths.index).toBe(join(root, 'data', 'photos.json'))

    await ensureGalleryDirectories(paths)

    await expect(access(paths.originals)).resolves.toBeUndefined()
    await expect(access(paths.generated)).resolves.toBeUndefined()
  })

  it('honors the runtime data directory override', () => {
    const paths = resolveGalleryPaths({
      currentWorkingDirectory: '/workspace',
      environment: { NUXT_GALLERY_DATA_DIR: '/runtime/gallery' }
    })

    expect(paths.data).toBe('/runtime/gallery')
  })
})
