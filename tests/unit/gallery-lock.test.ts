import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  SyncLockError,
  acquireSyncLock,
  readSyncLock,
  withSyncLock
} from '../../shared/node/gallery-lock'

let root: string
let lockPath: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'framefolio-lock-'))
  lockPath = join(root, '.state', 'sync.lock')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('sync lock', () => {
  it('creates the lock file and records the owning pid', async () => {
    const release = await acquireSyncLock({ lockPath, reason: 'test' })

    const info = await readSyncLock(lockPath)
    expect(info?.pid).toBe(process.pid)
    expect(info?.reason).toBe('test')

    await release()
  })

  it('releases the lock so a later acquisition succeeds', async () => {
    const release = await acquireSyncLock({ lockPath })
    await release()

    const second = await acquireSyncLock({ lockPath })
    await second()
  })

  it('refuses a second acquisition while a live process holds it', async () => {
    const release = await acquireSyncLock({ lockPath })

    await expect(acquireSyncLock({ lockPath })).rejects.toBeInstanceOf(
      SyncLockError
    )

    await release()
  })

  it('reports the current holder so the caller can explain the wait', async () => {
    const release = await acquireSyncLock({ lockPath })

    await expect(acquireSyncLock({ lockPath })).rejects.toMatchObject({
      holder: { pid: process.pid }
    })

    await release()
  })

  it('reclaims a lock whose owning process is gone', async () => {
    await mkdir(join(root, '.state'), { recursive: true })
    await writeFile(
      lockPath,
      JSON.stringify({
        pid: 4194303,
        acquiredAt: '2026-01-01T00:00:00.000Z',
        reason: 'crashed'
      })
    )

    const release = await acquireSyncLock({ lockPath })
    const info = await readSyncLock(lockPath)

    expect(info?.pid).toBe(process.pid)
    await release()
  })

  it('treats a freshly created but still empty lock as held', async () => {
    // `open(path, 'wx')` exposes the file before its contents are written, so a
    // concurrent caller can see an empty file for a moment. It must not steal
    // the lock in that window.
    await mkdir(join(root, '.state'), { recursive: true })
    await writeFile(lockPath, '')

    await expect(acquireSyncLock({ lockPath })).rejects.toBeInstanceOf(
      SyncLockError
    )
  })

  it('reclaims a long-unreadable lock file instead of blocking forever', async () => {
    await mkdir(join(root, '.state'), { recursive: true })
    await writeFile(lockPath, 'not json at all')

    const later = () => new Date(Date.now() + 10 * 60 * 1000)
    const release = await acquireSyncLock({ lockPath, now: later })

    expect(await readSyncLock(lockPath)).toMatchObject({ pid: process.pid })
    await release()
  })

  it('does not let a stale release delete a newer lock', async () => {
    const release = await acquireSyncLock({ lockPath })

    // Simulate the lock being reclaimed by another process mid-run.
    await mkdir(join(root, '.state'), { recursive: true })
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 4194303, acquiredAt: '2030-01-01T00:00:00.000Z' })
    )

    await release()

    // The newer lock must survive: the stale release did not own it.
    expect(await readSyncLock(lockPath)).toMatchObject({ pid: 4194303 })
  })

  it('is idempotent when released twice', async () => {
    const release = await acquireSyncLock({ lockPath })
    await release()
    await expect(release()).resolves.toBeUndefined()
  })
})

describe('withSyncLock', () => {
  it('releases the lock when the task throws', async () => {
    await expect(
      withSyncLock({ lockPath }, async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')

    const release = await acquireSyncLock({ lockPath })
    await release()
  })

  it('returns the task result and leaves no lock behind', async () => {
    const value = await withSyncLock({ lockPath }, async () => 'done')

    expect(value).toBe('done')
    await expect(readFile(lockPath, 'utf8')).rejects.toThrow()
  })

  it('serialises concurrent callers within one process', async () => {
    const order: string[] = []

    async function worker(name: string, delayMs: number): Promise<void> {
      try {
        await withSyncLock({ lockPath }, async () => {
          order.push(`${name}:start`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          order.push(`${name}:end`)
        })
      } catch {
        order.push(`${name}:blocked`)
      }
    }

    await Promise.all([worker('a', 30), worker('b', 0), worker('c', 0)])

    // Exactly one worker completes; the others are turned away rather than
    // queued, so failures are visible and the caller can retry.
    const completed = order.filter(entry => entry.endsWith(':end'))
    expect(completed).toHaveLength(1)
    expect(order.filter(entry => entry.endsWith(':blocked'))).toHaveLength(2)
  })
})
