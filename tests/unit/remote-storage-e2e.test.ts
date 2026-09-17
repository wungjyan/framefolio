import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest'

import { runGallerySync } from '../../scripts/lib/gallery-sync'
import {
  resolveGalleryPaths,
  type GalleryPaths
} from '../../shared/node/gallery-paths'
import type { ObjectStorageConfig } from '../../shared/node/object-storage'
import { createRemotePublisher } from '../../shared/node/remote-publisher'
import { startFakeS3, type FakeS3Server } from '../helpers/fake-s3'

/**
 * The sync pipeline against a real S3-compatible server.
 *
 * `remote-publishing.test.ts` uses an in-memory fake publisher, and
 * `object-storage.test.ts` exercises the S3 client in isolation. Neither
 * covers the two together, which is where key construction, prefix handling,
 * and delete/upload agreement actually have to line up.
 */

let server: FakeS3Server
const roots: string[] = []

beforeAll(async () => {
  server = await startFakeS3()
})

afterAll(async () => {
  await server.close()
})

beforeEach(() => {
  server.objects.clear()
  server.requests.length = 0
  // Reset the failure switches too, otherwise a test that leaves one enabled
  // silently poisons every later test in the file.
  server.failAll = false
  server.failDeletes = false
})

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root => rm(root, { recursive: true, force: true }))
  )
})

async function createWorkspace(names: string[]): Promise<GalleryPaths> {
  const root = await mkdtemp(join(tmpdir(), 'framefolio-remote-e2e-'))
  roots.push(root)

  const paths = resolveGalleryPaths({ dataDirectory: join(root, 'data') })
  await mkdir(paths.originals, { recursive: true })

  let index = 0
  for (const name of names) {
    index += 1
    await sharp({
      create: {
        width: 60 + index * 10,
        height: 40,
        channels: 3,
        background: '#123456'
      }
    })
      .jpeg()
      .toFile(join(paths.originals, name))
  }

  return paths
}

function publisher(paths: GalleryPaths, prefix?: string) {
  const config: ObjectStorageConfig & { generatedDirectory: string } = {
    endpoint: server.endpoint,
    region: 'auto',
    bucket: 'framefolio',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    forcePathStyle: true,
    ...(prefix ? { prefix } : {}),
    generatedDirectory: paths.generated
  }

  return createRemotePublisher(config)
}

const keys = () => [...server.objects.keys()].sort()
const puts = () => server.requests.filter(request => request.method === 'PUT')
const deletes = () =>
  server.requests.filter(request => request.method === 'DELETE')

describe('remote storage end to end', () => {
  it('uploads both derivatives on the first sync', async () => {
    const paths = await createWorkspace(['a.jpg'])

    await runGallerySync({ paths, remote: publisher(paths) })

    expect(keys()).toHaveLength(2)
  })

  it('removes the remote objects when a photo is deleted', async () => {
    const paths = await createWorkspace(['a.jpg'])
    await runGallerySync({ paths, remote: publisher(paths) })
    expect(keys()).toHaveLength(2)

    await rm(join(paths.originals, 'a.jpg'))

    const result = await runGallerySync({ paths, remote: publisher(paths) })

    expect(result.summary.deleted).toBe(1)
    expect(keys()).toHaveLength(0)
  })

  it('does not re-upload an unchanged photo', async () => {
    const paths = await createWorkspace(['a.jpg'])
    await runGallerySync({ paths, remote: publisher(paths) })

    const before = keys()
    const putsBefore = puts().length

    await runGallerySync({ paths, remote: publisher(paths) })

    expect(keys()).toEqual(before)
    expect(puts()).toHaveLength(putsBefore)
  })

  it('cleans up superseded derivatives after the source changes', async () => {
    const paths = await createWorkspace(['a.jpg'])
    await runGallerySync({ paths, remote: publisher(paths) })
    const first = keys()
    expect(first).toHaveLength(2)

    await sharp({
      create: { width: 200, height: 120, channels: 3, background: '#654321' }
    })
      .jpeg()
      .toFile(join(paths.originals, 'a.jpg'))

    await runGallerySync({ paths, remote: publisher(paths) })

    expect(keys()).toHaveLength(2)
    expect(keys()).not.toEqual(first)
  })

  it('removes objects under a configured prefix', async () => {
    const paths = await createWorkspace(['a.jpg'])
    await runGallerySync({ paths, remote: publisher(paths, 'portfolio') })
    expect(keys()).toHaveLength(2)
    expect(keys().every(key => key.startsWith('portfolio/'))).toBe(true)

    await rm(join(paths.originals, 'a.jpg'))
    await runGallerySync({ paths, remote: publisher(paths, 'portfolio') })

    expect(keys()).toHaveLength(0)
    expect(deletes().length).toBeGreaterThan(0)
  })

  it('retries a remote removal that previously failed', async () => {
    // A failed delete leaves an orphan. Because the index has already dropped
    // the photo, the next sync sees the same originals and would not revisit
    // it — so an unreconciled orphan stays in the bucket forever.
    const paths = await createWorkspace(['a.jpg'])
    await runGallerySync({ paths, remote: publisher(paths) })
    expect(keys()).toHaveLength(2)

    await rm(join(paths.originals, 'a.jpg'))

    server.failDeletes = true
    const failedRun = await runGallerySync({
      paths,
      remote: publisher(paths)
    })
    expect(keys()).toHaveLength(2)
    expect(
      failedRun.warnings.some(warning => warning.includes('Could not remove'))
    ).toBe(true)

    server.failDeletes = false
    await runGallerySync({ paths, remote: publisher(paths) })

    expect(keys()).toHaveLength(0)
  })

  it('never deletes objects that do not look like derivatives', async () => {
    // Cleanup must be safe in a bucket shared with other applications. Only
    // keys matching the generated-filename pattern are candidates.
    const paths = await createWorkspace(['a.jpg'])
    server.objects.set('notes.txt', { body: Buffer.from('keep me') })
    server.objects.set('other-app/logo.png', { body: Buffer.from('keep me') })

    await runGallerySync({ paths, remote: publisher(paths) })
    expect(keys()).toContain('notes.txt')
    expect(keys()).toContain('other-app/logo.png')

    await rm(join(paths.originals, 'a.jpg'))
    await runGallerySync({ paths, remote: publisher(paths) })

    expect(keys()).toEqual(['notes.txt', 'other-app/logo.png'])
  })

  it('leaves another prefix alone when a prefix is configured', async () => {
    const paths = await createWorkspace(['a.jpg'])
    // A different site's derivative, with a filename that would match the
    // pattern. It must survive because it is outside the configured prefix.
    const foreign =
      'other-site/aaaaaaaabbbbbbbb-ccccccccdddddddd-thumbnail.webp'
    server.objects.set(foreign, { body: Buffer.from('other site') })

    await runGallerySync({ paths, remote: publisher(paths, 'framefolio') })

    expect(keys()).toContain(foreign)
    expect(keys().filter(key => key.startsWith('framefolio/'))).toHaveLength(2)
  })

  it('keeps objects when listing fails, rather than deleting blindly', async () => {
    const paths = await createWorkspace(['a.jpg'])
    await runGallerySync({ paths, remote: publisher(paths) })
    expect(keys()).toHaveLength(2)

    await rm(join(paths.originals, 'a.jpg'))
    server.failAll = true

    const result = await runGallerySync({ paths, remote: publisher(paths) })

    // The bucket is untouched and the failure is reported, not acted on.
    expect(keys()).toHaveLength(2)
    expect(
      result.warnings.some(warning => warning.includes('Could not list'))
    ).toBe(true)
  })

  it('restores objects that were deleted directly from the bucket', async () => {
    const paths = await createWorkspace(['a.jpg'])
    await runGallerySync({ paths, remote: publisher(paths) })
    expect(keys()).toHaveLength(2)

    // A delete in the R2 dashboard, a lifecycle rule, or a restored backup.
    server.objects.clear()

    const result = await runGallerySync({ paths, remote: publisher(paths) })

    expect(keys()).toHaveLength(2)
    expect(result.summary.skipped).toBe(0)
    // Nothing local changed, so this is a re-upload of the same photo.
    expect(result.summary.updated).toBe(1)
  })
})
