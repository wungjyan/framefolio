import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createPhotoId,
  createPhotoRevision,
  ensureGalleryDirectories,
  normalizeShutterSpeed,
  runGallerySync
} from '../../scripts/lib/gallery-sync'
import { resolveGalleryPaths, type GalleryPaths } from '../../shared/node/gallery-paths'
import type { GalleryIndex } from '../../shared/types/photo'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, {
      recursive: true,
      force: true
    }))
  )
})

describe('gallery sync pipeline', () => {
  it('formats fractional shutter speeds with an integer denominator', () => {
    expect(normalizeShutterSpeed(0.03)).toBe('1/33s')
    expect(normalizeShutterSpeed(1 / 250)).toBe('1/250s')
    expect(normalizeShutterSpeed(2)).toBe('2s')
  })

  it('generates both variants and skips an unchanged photo', async () => {
    const paths = await createGalleryWorkspace()
    await createJpeg(join(paths.originals, 'without-exif.jpg'), 1200, 800)

    const first = await runGallerySync({ paths })

    expect(first.summary).toEqual({
      added: 1,
      updated: 0,
      skipped: 0,
      deleted: 0,
      failed: 0
    })
    expect(first.index.photos).toHaveLength(1)
    expect(first.index.photos[0]).toMatchObject({
      filename: 'without-exif.jpg',
      width: 1200,
      height: 800
    })
    expect(first.index.photos[0]).not.toHaveProperty('takenAt')

    const generated = await generatedWebpFiles(paths)
    expect(generated).toHaveLength(2)
    expect(generated.some(filename => filename.endsWith('-thumbnail.webp'))).toBe(true)
    expect(generated.some(filename => filename.endsWith('-preview.webp'))).toBe(true)

    const second = await runGallerySync({ paths })

    expect(second.summary).toEqual({
      added: 0,
      updated: 0,
      skipped: 1,
      deleted: 0,
      failed: 0
    })
    expect(second.index.photos[0]?.source.revision)
      .toBe(first.index.photos[0]?.source.revision)
  })

  it('updates only a modified photo and removes its stale generated files', async () => {
    const paths = await createGalleryWorkspace()
    const sourcePath = join(paths.originals, 'changing.jpg')
    await createJpeg(sourcePath, 1200, 800)

    const first = await runGallerySync({ paths })
    const oldGenerated = await generatedWebpFiles(paths)

    await createJpeg(sourcePath, 900, 1200, '#336699')
    const second = await runGallerySync({ paths })

    expect(second.summary).toMatchObject({ updated: 1, skipped: 0, failed: 0 })
    expect(second.index.photos[0]).toMatchObject({ width: 900, height: 1200 })
    expect(second.index.photos[0]?.source.revision)
      .not.toBe(first.index.photos[0]?.source.revision)

    const currentGenerated = await generatedWebpFiles(paths)
    expect(currentGenerated).toHaveLength(2)
    expect(currentGenerated).not.toEqual(oldGenerated)

    for (const oldFile of oldGenerated) {
      await expect(access(join(paths.generated, oldFile))).rejects.toMatchObject({
        code: 'ENOENT'
      })
    }
  })

  it('removes deleted photos from the index and generated directory', async () => {
    const paths = await createGalleryWorkspace()
    const sourcePath = join(paths.originals, 'deleted.jpg')
    await createJpeg(sourcePath, 640, 480)
    await runGallerySync({ paths })

    await rm(sourcePath)
    const result = await runGallerySync({ paths })

    expect(result.summary).toMatchObject({ deleted: 1, failed: 0 })
    expect(result.index.photos).toEqual([])
    expect(await generatedWebpFiles(paths)).toEqual([])
  })

  it('applies EXIF orientation before recording source dimensions', async () => {
    const paths = await createGalleryWorkspace()
    await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: '#445566'
      }
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toFile(join(paths.originals, 'oriented.jpg'))

    const result = await runGallerySync({ paths })

    expect(result.index.photos[0]).toMatchObject({ width: 20, height: 40 })

    const preview = result.index.photos[0]?.preview.split('/').at(-1)
    const metadata = await sharp(join(paths.generated, preview as string)).metadata()
    expect(metadata).toMatchObject({ width: 20, height: 40 })
    expect(metadata.exif).toBeUndefined()
  })

  it('retains the last published item when a changed photo fails', async () => {
    const paths = await createGalleryWorkspace()
    const sourcePath = join(paths.originals, 'recoverable.jpg')
    await createJpeg(sourcePath, 640, 480)

    const first = await runGallerySync({ paths })
    const publishedPhoto = first.index.photos[0]

    await writeFile(sourcePath, 'not an image')
    await writeFile(join(paths.originals, 'new-broken.jpg'), 'also not an image')

    const failed = await runGallerySync({ paths })

    expect(failed.summary).toMatchObject({ failed: 2 })
    expect(failed.errors).toHaveLength(2)
    expect(failed.index.photos).toEqual([publishedPhoto])
    expect(await generatedWebpFiles(paths)).toHaveLength(2)
  })

  it('changes revisions with the pipeline version while keeping IDs stable', () => {
    const source = { size: 123, mtimeMs: 456 }

    expect(createPhotoId('nested\\photo.jpg')).toBe(createPhotoId('nested/photo.jpg'))
    expect(createPhotoRevision('photo.jpg', source, 1))
      .not.toBe(createPhotoRevision('photo.jpg', source, 2))
  })

  it('recovers from a malformed index using originals as the source of truth', async () => {
    const paths = await createGalleryWorkspace()
    await createJpeg(join(paths.originals, 'source.jpg'), 320, 240)
    await writeFile(paths.index, '{broken json')

    const result = await runGallerySync({ paths })
    const index = await readIndex(paths)

    expect(result.warnings).toContain(
      'Existing photos.json is malformed; rebuilding it from originals'
    )
    expect(result.summary.added).toBe(1)
    expect(index.photos).toHaveLength(1)
  })
})

async function createGalleryWorkspace(): Promise<GalleryPaths> {
  const root = await mkdtemp(join(tmpdir(), 'framefolio-sync-'))
  temporaryDirectories.push(root)

  const paths = resolveGalleryPaths({
    currentWorkingDirectory: root,
    environment: {}
  })
  await ensureGalleryDirectories(paths)

  return paths
}

async function createJpeg(
  outputPath: string,
  width: number,
  height: number,
  background = '#778899'
): Promise<void> {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background
    }
  }).jpeg().toFile(outputPath)
}

async function generatedWebpFiles(paths: GalleryPaths): Promise<string[]> {
  return (await readdir(paths.generated))
    .filter(filename => filename.endsWith('.webp'))
    .sort()
}

async function readIndex(paths: GalleryPaths): Promise<GalleryIndex> {
  return JSON.parse(await readFile(paths.index, 'utf8')) as GalleryIndex
}
