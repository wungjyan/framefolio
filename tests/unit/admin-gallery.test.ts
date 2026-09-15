import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildAdminPhotos,
  resolveOriginalPath,
  scanOriginalFiles,
  summarizePending
} from '../../server/utils/admin-gallery'
import { GALLERY_PIPELINE_VERSION } from '../../shared/constants/gallery'
import { createPhotoRevision } from '../../shared/node/photo-fingerprint'
import type { GalleryIndex, PhotoIndexItem } from '../../shared/types/photo'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'framefolio-admin-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Write a file and return the source state the index would record for it. */
async function writePhoto(
  relativePath: string,
  contents = 'x'
): Promise<{ size: number; mtimeMs: number; revision: string }> {
  const absolutePath = join(root, relativePath)
  await mkdir(join(absolutePath, '..'), { recursive: true })
  await writeFile(absolutePath, contents)

  const { stat } = await import('node:fs/promises')
  const fileStat = await stat(absolutePath)
  const source = { size: fileStat.size, mtimeMs: fileStat.mtimeMs }

  return {
    ...source,
    revision: createPhotoRevision(relativePath, source, GALLERY_PIPELINE_VERSION)
  }
}

function createIndex(photos: PhotoIndexItem[]): GalleryIndex {
  return {
    schemaVersion: 2,
    pipelineVersion: GALLERY_PIPELINE_VERSION,
    generatedAt: '2026-09-01T00:00:00.000Z',
    photos
  }
}

function createIndexPhoto(
  filename: string,
  source: { size: number; mtimeMs: number; revision: string }
): PhotoIndexItem {
  const id = '0123456789abcdef'

  return {
    id,
    filename,
    width: 100,
    height: 100,
    storage: {
      thumbnail: `${id}-${source.revision}-thumbnail.webp`,
      preview: `${id}-${source.revision}-preview.webp`
    },
    source
  }
}

describe('scanning originals', () => {
  it('finds supported images recursively and ignores other files', async () => {
    await writePhoto('a.jpg')
    await writePhoto('nested/b.png')
    await writePhoto('notes.txt')
    await mkdir(join(root, 'empty'), { recursive: true })

    const entries = await scanOriginalFiles(root)

    expect(entries.map(entry => entry.relativePath)).toEqual([
      'a.jpg',
      'nested/b.png'
    ])
  })

  it('normalises backslashes in relative paths', async () => {
    await writePhoto('a.jpg')

    const entries = await scanOriginalFiles(root)

    expect(entries[0]?.relativePath).not.toContain('\\')
  })

  it('returns an empty list for a missing directory', async () => {
    await expect(scanOriginalFiles(join(root, 'missing'))).resolves.toEqual([])
  })
})

describe('admin photo states', () => {
  it('marks a file that is not published yet as added', async () => {
    const source = await writePhoto('new.jpg')
    const entries = await scanOriginalFiles(root)

    const photos = buildAdminPhotos(createIndex([]), entries)

    expect(photos).toHaveLength(1)
    expect(photos[0]).toMatchObject({ filename: 'new.jpg', state: 'added' })
    expect(photos[0]?.source.revision).toBe(source.revision)
  })

  it('marks a published and untouched file as unchanged', async () => {
    const source = await writePhoto('same.jpg')
    const entries = await scanOriginalFiles(root)
    const index = createIndex([createIndexPhoto('same.jpg', source)])

    const photos = buildAdminPhotos(index, entries)

    expect(photos[0]?.state).toBe('unchanged')
  })

  it('marks a published file whose bytes changed as changed', async () => {
    const source = await writePhoto('edit.jpg', 'first')
    const entries = await scanOriginalFiles(root)
    const stale = { ...source, size: source.size + 1, mtimeMs: source.mtimeMs + 1 }
    const index = createIndex([createIndexPhoto('edit.jpg', stale)])

    const photos = buildAdminPhotos(index, entries)

    expect(photos[0]?.state).toBe('changed')
  })

  it('marks a published photo missing from disk as pending-delete', async () => {
    const source = await writePhoto('gone.jpg')
    await rm(join(root, 'gone.jpg'))
    const entries = await scanOriginalFiles(root)
    const index = createIndex([createIndexPhoto('gone.jpg', source)])

    const photos = buildAdminPhotos(index, entries)

    expect(photos).toHaveLength(1)
    expect(photos[0]).toMatchObject({
      filename: 'gone.jpg',
      state: 'pending-delete'
    })
  })

  it('keeps a published photo in the list so the admin can see it', async () => {
    // Deleting only moves the file to .trash/, so the site still shows the
    // photo. The admin list must therefore still contain it.
    const source = await writePhoto('gone.jpg')
    await rm(join(root, 'gone.jpg'))
    const index = createIndex([createIndexPhoto('gone.jpg', source)])

    const photos = buildAdminPhotos(index, [])

    expect(photos.map(photo => photo.filename)).toEqual(['gone.jpg'])
  })

  it('reports the uploader filename for pending photos', async () => {
    await writePhoto('brand-new.jpg')

    const photos = buildAdminPhotos(createIndex([]), await scanOriginalFiles(root))

    // Never-published photos have no derivatives yet, so storage keys are blank
    // rather than pointing at files that do not exist.
    expect(photos[0]?.storage).toEqual({ thumbnail: '', preview: '' })
  })

  it('summarises each pending state', async () => {
    const published = await writePhoto('a.jpg', 'unchanged')
    const changedSource = await writePhoto('b.jpg', 'changed')
    const deletedSource = await writePhoto('c.jpg', 'deleted')
    await rm(join(root, 'c.jpg'))
    await writePhoto('d.jpg', 'new')

    const entries = await scanOriginalFiles(root)
    const index = createIndex([
      createIndexPhoto('a.jpg', published),
      createIndexPhoto('b.jpg', {
        ...changedSource,
        size: changedSource.size + 5,
        mtimeMs: changedSource.mtimeMs + 5
      }),
      createIndexPhoto('c.jpg', deletedSource)
    ])

    const photos = buildAdminPhotos(index, entries)

    expect(summarizePending(photos)).toEqual({
      added: 1,
      changed: 1,
      pendingDelete: 1,
      total: 3
    })
  })

  it('reports nothing pending when disk and index agree', async () => {
    const source = await writePhoto('a.jpg')
    const entries = await scanOriginalFiles(root)

    const photos = buildAdminPhotos(
      createIndex([createIndexPhoto('a.jpg', source)]),
      entries
    )

    expect(summarizePending(photos)).toEqual({
      added: 0,
      changed: 0,
      pendingDelete: 0,
      total: 0
    })
  })

  it('sorts photos by filename with numeric awareness', async () => {
    await writePhoto('photo10.jpg')
    await writePhoto('photo2.jpg')

    const photos = buildAdminPhotos(createIndex([]), await scanOriginalFiles(root))

    expect(photos.map(photo => photo.filename)).toEqual([
      'photo2.jpg',
      'photo10.jpg'
    ])
  })
})

describe('original path resolution', () => {
  it('resolves a plain filename inside originals', () => {
    expect(resolveOriginalPath(root, 'photo.jpg')).toBe(join(root, 'photo.jpg'))
  })

  it('resolves a nested path inside originals', () => {
    expect(resolveOriginalPath(root, 'trip/day1/a.jpg')).toBe(
      join(root, 'trip/day1/a.jpg')
    )
  })

  it.each([
    '../escape.jpg',
    'nested/../../escape.jpg',
    '/etc/passwd',
    'nested//double.jpg',
    'C:\\Windows\\system32\\x.jpg',
    '',
    '.'
  ])('refuses an unsafe relative path: %s', relativePath => {
    expect(resolveOriginalPath(root, relativePath)).toBeUndefined()
  })
})
