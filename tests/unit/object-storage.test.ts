import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest'

import {
  checkConnection,
  createObjectStorageClient,
  deleteObject,
  listObjects,
  objectExists,
  putFile,
  type ObjectStorageConfig
} from '../../shared/node/object-storage'
import { startFakeS3, type FakeS3Server } from '../helpers/fake-s3'

/**
 * Integration tests for the S3 client.
 *
 * These run the real AWS SDK against a local HTTP server rather than mocking the
 * SDK, so request signing, path-style addressing, streaming uploads, and XML
 * parsing are all genuinely exercised.
 */

let server: FakeS3Server
let root: string
let config: ObjectStorageConfig

beforeAll(async () => {
  server = await startFakeS3({ expectedAccessKey: 'test-access-key' })
})

afterAll(async () => {
  await server.close()
})

beforeEach(async () => {
  server.objects.clear()
  server.requests.length = 0
  server.failAll = false
  root = await mkdtemp(join(tmpdir(), 'framefolio-s3-'))
  config = {
    endpoint: server.endpoint,
    region: 'auto',
    bucket: 'framefolio',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    forcePathStyle: true
  }
})

// Without this the suite leaks one temp directory per test, which piles up in
// the system temp area across runs.
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('object storage client', () => {
  it('verifies a connection against the bucket', async () => {
    const client = createObjectStorageClient(config)

    await expect(checkConnection(client, config)).resolves.toBeUndefined()
  })

  it('uploads a file and streams its bytes intact', async () => {
    const client = createObjectStorageClient(config)
    const filePath = join(root, 'thumb.webp')
    const contents = Buffer.from('webp-bytes-for-testing')
    await writeFile(filePath, contents)

    await putFile(client, config, {
      filePath,
      storageKey: 'abc-123-thumbnail.webp'
    })

    const stored = server.objects.get('abc-123-thumbnail.webp')
    expect(stored).toBeDefined()
    expect(stored?.body.equals(contents)).toBe(true)
    expect(stored?.contentType).toBe('image/webp')
    expect(stored?.cacheControl).toContain('immutable')
  })

  it('reports an uploaded object as existing', async () => {
    const client = createObjectStorageClient(config)
    const filePath = join(root, 'preview.webp')
    await writeFile(filePath, 'bytes')

    await putFile(client, config, { filePath, storageKey: 'key-preview.webp' })

    await expect(
      objectExists(client, config, 'key-preview.webp')
    ).resolves.toBe(true)
  })

  it('reports a missing object as absent rather than throwing', async () => {
    const client = createObjectStorageClient(config)

    await expect(
      objectExists(client, config, 'never-uploaded.webp')
    ).resolves.toBe(false)
  })

  it('deletes an object, and a repeat delete still succeeds', async () => {
    const client = createObjectStorageClient(config)
    const filePath = join(root, 'a.webp')
    await writeFile(filePath, 'bytes')
    await putFile(client, config, { filePath, storageKey: 'a.webp' })

    await deleteObject(client, config, 'a.webp')
    expect(server.objects.has('a.webp')).toBe(false)

    // Idempotent: deleting again must not throw, because sync retries cleanup.
    await expect(
      deleteObject(client, config, 'a.webp')
    ).resolves.toBeUndefined()
  })

  it('applies the configured key prefix to uploads', async () => {
    const prefixed: ObjectStorageConfig = { ...config, prefix: 'gallery' }
    const clientPrefixed = createObjectStorageClient(prefixed)
    const filePath = join(root, 'b.webp')
    await writeFile(filePath, 'bytes')

    await putFile(clientPrefixed, prefixed, {
      filePath,
      storageKey: 'b.webp'
    })

    expect(server.objects.has('gallery/b.webp')).toBe(true)
  })

  it('lists objects without the prefix in the returned keys', async () => {
    const prefixed: ObjectStorageConfig = { ...config, prefix: 'gallery' }
    const client = createObjectStorageClient(prefixed)
    const filePath = join(root, 'c.webp')
    await writeFile(filePath, 'bytes')
    await putFile(client, prefixed, { filePath, storageKey: 'c.webp' })

    const objects = await listObjects(client, prefixed)

    // Callers compare these against index storage keys, so the prefix must be
    // stripped from the report.
    expect(objects.map(object => object.key)).toEqual(['c.webp'])
  })

  it('lists every object across pages', async () => {
    // A dedicated server with a small page size, rather than reconfiguring the
    // shared one (which would break the other tests).
    const paged = await startFakeS3({ pageSize: 2 })
    const pagedConfig: ObjectStorageConfig = {
      ...config,
      endpoint: paged.endpoint
    }
    const client = createObjectStorageClient(pagedConfig)
    const filePath = join(root, 'd.webp')
    await writeFile(filePath, 'bytes')

    try {
      for (const name of ['a.webp', 'b.webp', 'c.webp', 'd.webp', 'e.webp']) {
        await putFile(client, pagedConfig, { filePath, storageKey: name })
      }

      const objects = await listObjects(client, pagedConfig)

      expect(objects.map(object => object.key).sort()).toEqual([
        'a.webp',
        'b.webp',
        'c.webp',
        'd.webp',
        'e.webp'
      ])

      // More than one page was requested, so pagination genuinely ran.
      const listRequests = paged.requests.filter(
        request => request.query['list-type'] === '2'
      )
      expect(listRequests.length).toBeGreaterThan(1)
    } finally {
      await paged.close()
    }
  })

  it('sends the configured credentials', async () => {
    const client = createObjectStorageClient(config)
    const filePath = join(root, 'e.webp')
    await writeFile(filePath, 'bytes')

    await putFile(client, config, { filePath, storageKey: 'e.webp' })

    // The fake server rejected the request with 403 unless the access key was
    // present in the signed Authorization header, so reaching here proves
    // signing happened.
    expect(server.requests.length).toBeGreaterThan(0)
  })

  it('surfaces a server failure instead of silently succeeding', async () => {
    const client = createObjectStorageClient(config)
    const filePath = join(root, 'f.webp')
    await writeFile(filePath, 'bytes')
    server.failAll = true

    await expect(
      putFile(client, config, { filePath, storageKey: 'f.webp' })
    ).rejects.toThrow()
  })

  it('uses path-style addressing so MinIO-compatible servers work', async () => {
    const client = createObjectStorageClient(config)
    const filePath = join(root, 'g.webp')
    await writeFile(filePath, 'bytes')

    await putFile(client, config, { filePath, storageKey: 'g.webp' })

    // Path style means /<bucket>/<key>; virtual-host style would target the
    // bucket as a subdomain, which the fake server cannot serve.
    const put = server.requests.find(request => request.method === 'PUT')
    expect(put?.path).toBe('/framefolio/g.webp')
  })
})
