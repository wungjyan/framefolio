import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  GalleryIndexError,
  readPublicGalleryPhotos
} from '../../server/utils/gallery-index'
import {
  GENERATED_IMAGE_CACHE_CONTROL,
  GENERATED_IMAGE_CONTENT_TYPE,
  resolveGeneratedImagePath
} from '../../server/utils/gallery-media'
import {
  GALLERY_PIPELINE_VERSION,
  GALLERY_SCHEMA_VERSION
} from '../../shared/constants/gallery'
import { resolveGalleryPaths } from '../../shared/node/gallery-paths'
import type { GalleryIndex, PhotoIndexItem } from '../../shared/types/photo'

let temporaryRoot: string

beforeEach(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'framefolio-runtime-'))
})

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true })
})

describe('gallery runtime index', () => {
  it('returns an empty array when the index does not exist', async () => {
    const paths = resolveGalleryPaths({ dataDirectory: fixturePath('missing') })

    await expect(readPublicGalleryPhotos(paths.index)).resolves.toEqual([])
  })

  it('maps a valid index to public fields only', async () => {
    const paths = resolveGalleryPaths({ dataDirectory: fixturePath('valid') })
    const photo = createPhoto()

    await mkdir(paths.data, { recursive: true })
    await writeFile(paths.index, JSON.stringify(createIndex(photo)))

    await expect(readPublicGalleryPhotos(paths.index)).resolves.toEqual([{
      id: photo.id,
      filename: photo.filename,
      thumbnail: photo.thumbnail,
      preview: photo.preview,
      width: photo.width,
      height: photo.height,
      takenAt: photo.takenAt,
      cameraModel: photo.cameraModel
    }])
  })

  it('rejects malformed JSON and invalid index fields', async () => {
    const paths = resolveGalleryPaths({ dataDirectory: fixturePath('invalid') })

    await mkdir(paths.data, { recursive: true })
    await writeFile(paths.index, '{')
    await expect(readPublicGalleryPhotos(paths.index)).rejects.toBeInstanceOf(GalleryIndexError)

    const invalidPhoto = createPhoto()
    invalidPhoto.thumbnail = '/media/../../originals/private.jpg'
    await writeFile(paths.index, JSON.stringify(createIndex(invalidPhoto)))
    await expect(readPublicGalleryPhotos(paths.index)).rejects.toBeInstanceOf(GalleryIndexError)
  })
})

describe('gallery media path', () => {
  it('accepts generated fingerprints and defines immutable WebP headers', () => {
    const generatedDirectory = fixturePath('generated')
    const filename = '0123456789abcdef-fedcba9876543210-preview.webp'

    expect(resolveGeneratedImagePath(generatedDirectory, filename))
      .toBe(join(generatedDirectory, filename))
    expect(GENERATED_IMAGE_CONTENT_TYPE).toBe('image/webp')
    expect(GENERATED_IMAGE_CACHE_CONTROL).toContain('immutable')
    expect(GENERATED_IMAGE_CACHE_CONTROL).toContain('max-age=31536000')
  })

  it.each([
    '../originals/private.jpg',
    '%2e%2e%2foriginals%2fprivate.jpg',
    '0123456789abcdef-fedcba9876543210-preview.jpg',
    'unfingerprinted-preview.webp'
  ])('rejects an unsafe or invalid filename: %s', (filename) => {
    expect(resolveGeneratedImagePath(fixturePath('generated'), filename)).toBeUndefined()
  })
})

describe('runtime dependency boundary', () => {
  it('does not import image processing dependencies in server request code', async () => {
    const runtimeFiles = [
      'server/api/photos.get.ts',
      'server/routes/media/[filename].get.ts',
      'server/utils/gallery-index.ts',
      'server/utils/gallery-media.ts'
    ]
    const contents = await Promise.all(runtimeFiles.map(path => readFile(path, 'utf8')))

    expect(contents.join('\n')).not.toMatch(/from ['"](?:sharp|exifr)['"]/)
    expect(contents.join('\n')).not.toContain('originals')
  })
})

function fixturePath(name: string): string {
  return join(temporaryRoot, name)
}

function createPhoto(): PhotoIndexItem {
  const id = '0123456789abcdef'
  const revision = 'fedcba9876543210'

  return {
    id,
    filename: 'example.jpg',
    thumbnail: `/media/${id}-${revision}-thumbnail.webp`,
    preview: `/media/${id}-${revision}-preview.webp`,
    width: 2400,
    height: 1600,
    takenAt: '2026-08-20T12:00:00.000Z',
    cameraModel: 'Example Camera',
    source: {
      size: 1024,
      mtimeMs: 1000,
      revision
    }
  }
}

function createIndex(photo: PhotoIndexItem): GalleryIndex {
  return {
    schemaVersion: GALLERY_SCHEMA_VERSION,
    pipelineVersion: GALLERY_PIPELINE_VERSION,
    generatedAt: '2026-08-26T00:00:00.000Z',
    photos: [photo]
  }
}
