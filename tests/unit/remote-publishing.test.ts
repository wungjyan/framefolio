import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'

import { runGallerySync } from '../../scripts/lib/gallery-sync'
import {
  resolveGalleryPaths,
  type GalleryPaths
} from '../../shared/node/gallery-paths'
import type { GalleryIndex } from '../../shared/types/photo'
import type { RemotePublisher } from '../../shared/types/sync'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

async function createGalleryWorkspace(): Promise<GalleryPaths> {
  const root = await mkdtemp(join(tmpdir(), 'framefolio-remote-'))
  temporaryDirectories.push(root)

  const paths = resolveGalleryPaths({ dataDirectory: join(root, 'data') })
  await mkdir(paths.originals, { recursive: true })

  await sharp({
    create: {
      width: 40,
      height: 30,
      channels: 3,
      background: '#336699'
    }
  })
    .jpeg()
    .toFile(join(paths.originals, 'x.jpg'))

  return paths
}

/** In-memory publisher that records calls, for asserting pipeline behaviour. */
function createFakePublisher(
  options: { failUpload?: boolean } = {}
): RemotePublisher & { uploads: string[]; removals: string[] } {
  const uploads: string[] = []
  const removals: string[] = []

  return {
    uploads,
    removals,
    async upload(fileName) {
      if (options.failUpload) {
        throw new Error('simulated upload failure')
      }
      uploads.push(fileName)
    },
    async remove(fileName) {
      removals.push(fileName)
    }
  }
}

async function readIndex(paths: GalleryPaths): Promise<GalleryIndex> {
  return JSON.parse(await readFile(paths.index, 'utf8'))
}

describe('remote publishing during sync', () => {
  it('uploads both derivatives and records the remote revision', async () => {
    const paths = await createGalleryWorkspace()
    const remote = createFakePublisher()

    const result = await runGallerySync({ paths, remote })

    expect(remote.uploads).toHaveLength(2)
    expect(remote.uploads.some(name => name.endsWith('-thumbnail.webp'))).toBe(
      true
    )
    expect(remote.uploads.some(name => name.endsWith('-preview.webp'))).toBe(true)

    const photo = result.index.photos[0]
    expect(photo?.remote).toMatchObject({
      provider: 's3',
      revision: photo?.source.revision
    })
    expect(photo?.remote?.uploadedAt).toBeDefined()
  })

  it('does not upload anything when no publisher is configured', async () => {
    const paths = await createGalleryWorkspace()

    const result = await runGallerySync({ paths })

    expect(result.index.photos[0]?.remote).toBeUndefined()
  })

  it('omits remote state when the upload fails, keeping local derivatives', async () => {
    // The important failure mode: object storage is down, but the photo must
    // still be published locally rather than disappearing or failing the sync.
    const paths = await createGalleryWorkspace()
    const remote = createFakePublisher({ failUpload: true })

    const result = await runGallerySync({ paths, remote })

    expect(result.summary.added).toBe(1)
    expect(result.summary.failed).toBe(0)
    expect(result.index.photos).toHaveLength(1)
    expect(result.index.photos[0]?.remote).toBeUndefined()
    expect(
      result.warnings.some(warning => warning.includes('not to object storage'))
    ).toBe(true)
  })

  it('still produces local derivatives when the upload fails', async () => {
    const paths = await createGalleryWorkspace()
    const remote = createFakePublisher({ failUpload: true })

    await runGallerySync({ paths, remote })
    const index = await readIndex(paths)

    // The storage keys point at real files, so read-time resolution can fall
    // back to /media for this photo.
    expect(index.photos[0]?.storage.thumbnail).toMatch(/-thumbnail\.webp$/)
  })

  it('re-uploads when the source changes', async () => {
    const paths = await createGalleryWorkspace()
    const first = createFakePublisher()

    await runGallerySync({ paths, remote: first })
    expect(first.uploads).toHaveLength(2)

    // Touch the file so its size/mtime (and therefore revision) changes.
    await sharp({
      create: {
        width: 50,
        height: 30,
        channels: 3,
        background: '#993366'
      }
    })
      .jpeg()
      .toFile(join(paths.originals, 'x.jpg'))

    const second = createFakePublisher()
    const result = await runGallerySync({ paths, remote: second })

    expect(second.uploads).toHaveLength(2)
    expect(result.summary.updated).toBe(1)
  })

  it('does not re-upload an unchanged photo', async () => {
    const paths = await createGalleryWorkspace()

    await runGallerySync({ paths, remote: createFakePublisher() })

    const second = createFakePublisher()
    const result = await runGallerySync({ paths, remote: second })

    expect(result.summary.skipped).toBe(1)
    expect(second.uploads).toEqual([])
  })

  it('retries a photo whose upload previously failed', async () => {
    // Self-healing matters: the local state never changes after a failed upload,
    // so a naive "skip unchanged" check would retry it never.
    const paths = await createGalleryWorkspace()

    const failing = await runGallerySync({
      paths,
      remote: createFakePublisher({ failUpload: true })
    })
    expect(failing.index.photos[0]?.remote).toBeUndefined()

    const retry = createFakePublisher()
    const second = await runGallerySync({ paths, remote: retry })

    expect(retry.uploads).toHaveLength(2)
    expect(second.index.photos[0]?.remote).toBeDefined()
  })

  it('removes derivatives when a photo is deleted from originals', async () => {
    const paths = await createGalleryWorkspace()
    await runGallerySync({ paths, remote: createFakePublisher() })

    await rm(join(paths.originals, 'x.jpg'))

    const remote = createFakePublisher()
    const result = await runGallerySync({ paths, remote })

    expect(result.summary.deleted).toBe(1)
    expect(remote.removals).toHaveLength(2)
    expect(remote.removals.some(name => name.endsWith('-thumbnail.webp'))).toBe(
      true
    )
  })

  it('warns instead of failing when removal fails', async () => {
    const paths = await createGalleryWorkspace()
    await runGallerySync({ paths, remote: createFakePublisher() })

    await rm(join(paths.originals, 'x.jpg'))

    const failing: RemotePublisher = {
      async upload() {},
      async remove() {
        throw new Error('simulated delete failure')
      }
    }

    const result = await runGallerySync({ paths, remote: failing })

    expect(result.summary.failed).toBe(0)
    expect(
      result.warnings.some(warning => warning.includes('Could not remove'))
    ).toBe(true)
  })
})
