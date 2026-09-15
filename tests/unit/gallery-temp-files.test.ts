import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  cleanStaleTemporaryFiles,
  createTemporaryPath,
  isProcessAlive,
  parseTemporaryFilePid
} from '../../shared/node/temporary-files'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'framefolio-temp-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('temporary file naming', () => {
  it('embeds the pid so a later run can tell whether the owner is alive', () => {
    const filename =
      'abc-thumbnail.webp.1234-35f3ac54-4043-4aad-a95e-d6489791d57d.tmp'

    expect(parseTemporaryFilePid(filename)).toBe(1234)
    expect(parseTemporaryFilePid('abc-thumbnail.webp.tmp')).toBeUndefined()
    expect(parseTemporaryFilePid('photo.jpg')).toBeUndefined()
  })

  it('appends a unique suffix to the final path', () => {
    const first = createTemporaryPath('/tmp/photo-thumbnail.webp')
    const second = createTemporaryPath('/tmp/photo-thumbnail.webp')

    expect(first).toMatch(/photo-thumbnail\.webp\.\d+-[0-9a-f-]{36}\.tmp$/)
    expect(first).not.toBe(second)
    expect(first).not.toBe('/tmp/photo-thumbnail.webp.tmp')
  })

  it('reports the current process as alive', () => {
    expect(isProcessAlive(process.pid)).toBe(true)
  })

  it('reports a pid that cannot exist as dead', () => {
    // 2^22 exceeds the default macOS/Linux pid ceiling, so no process holds it.
    expect(isProcessAlive(4194303)).toBe(false)
  })
})

describe('stale temporary file cleanup', () => {
  it('keeps a temporary file owned by a live process', async () => {
    // Owned by this very process, so it counts as live.
    const filename = `thumb.webp.${process.pid}-35f3ac54-4043-4aad-a95e-d6489791d57d.tmp`
    await writeFile(join(root, filename), 'in flight')

    const removed = await cleanStaleTemporaryFiles(root, 60 * 60 * 1000)

    expect(removed).toEqual([])
    await expect(stat(join(root, filename))).resolves.toBeDefined()
  })

  it('keeps a recent temporary file whose owner cannot be determined', async () => {
    const filename = 'thumb.webp.tmp'
    await writeFile(join(root, filename), 'unknown owner')

    const removed = await cleanStaleTemporaryFiles(root, 60 * 60 * 1000)

    expect(removed).toEqual([])
    await expect(stat(join(root, filename))).resolves.toBeDefined()
  })

  it('removes an unowned temporary file once it is older than the threshold', async () => {
    const filename = 'thumb.webp.tmp'
    await writeFile(join(root, filename), 'crashed run')
    const future = Date.now() + 2 * 60 * 60 * 1000

    const removed = await cleanStaleTemporaryFiles(
      root,
      60 * 60 * 1000,
      () => future
    )

    expect(removed).toEqual([filename])
    await expect(stat(join(root, filename))).rejects.toThrow()
  })

  it('never removes a finalised webp file', async () => {
    const filename = '0123456789abcdef-fedcba9876543210-thumbnail.webp'
    await writeFile(join(root, filename), 'final')

    const removed = await cleanStaleTemporaryFiles(
      root,
      0,
      () => Date.now() + 1e9
    )

    expect(removed).toEqual([])
    await expect(stat(join(root, filename))).resolves.toBeDefined()
  })

  it('returns an empty list for a missing directory', async () => {
    await expect(
      cleanStaleTemporaryFiles(join(root, 'missing'), 0)
    ).resolves.toEqual([])
  })
})

describe('concurrent leftovers', () => {
  it('does not sweep a peer process in-flight temporary file', async () => {
    await mkdir(root, { recursive: true })

    // A file owned by a live pid (this process) must survive a sweep, which is
    // exactly the case that broke overlapping syncs before.
    const inFlight = `photo.webp.${process.pid}-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.tmp`
    const abandoned =
      'photo.webp.99999999-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.tmp'
    await writeFile(join(root, inFlight), 'live')
    await writeFile(join(root, abandoned), 'dead')

    const future = Date.now() + 2 * 60 * 60 * 1000
    const removed = await cleanStaleTemporaryFiles(
      root,
      60 * 60 * 1000,
      () => future
    )

    expect(removed).toEqual([abandoned])
    const remaining = (await readdir(root)).sort()
    expect(remaining).toEqual([inFlight])
  })
})
