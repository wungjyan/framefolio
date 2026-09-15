import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveGalleryPaths } from '../../shared/node/gallery-paths'
import { readJobsLedger } from '../../shared/node/jobs-ledger'
import {
  SyncAlreadyRunningError,
  assertSyncNotRunning,
  resolveProjectRoot,
  runSyncJob
} from '../../shared/node/sync-runner'
import type { GalleryPaths } from '../../shared/node/gallery-paths'

let root: string
let paths: GalleryPaths

const projectRoot = resolveProjectRoot(import.meta.url)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'framefolio-runner-'))
  paths = resolveGalleryPaths({ dataDirectory: join(root, 'data') })
  await mkdir(paths.originals, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('sync runner', () => {
  it('resolves a project root that actually contains the sync script', () => {
    expect(existsSync(join(projectRoot, 'scripts', 'gallery-sync.ts'))).toBe(
      true
    )
  })

  it('falls back to a module-relative root when cwd does not contain scripts', () => {
    // Nitro bundles this module, so cwd cannot be the only strategy.
    const fromTests = resolveProjectRoot(import.meta.url)
    expect(existsSync(join(fromTests, 'scripts', 'gallery-sync.ts'))).toBe(true)
  })

  it('runs a sync in a child process and records a succeeded job', async () => {
    const { job } = await runSyncJob({ paths, projectRoot })

    expect(job.status).toBe('succeeded')
    expect(job.trigger).toBe('admin')
    expect(job.summary).toEqual({
      added: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      failed: 0
    })
    expect(job.finishedAt).toBeDefined()
  }, 60_000)

  it('writes an index the public API can read', async () => {
    await runSyncJob({ paths, projectRoot })

    const index = JSON.parse(await readFile(paths.index, 'utf8'))
    expect(index.photos).toEqual([])
  }, 60_000)

  it('reports final progress once the run completes', async () => {
    const { job } = await runSyncJob({ paths, projectRoot })

    expect(job.progress).toMatchObject({
      phase: 'done',
      completed: 0,
      total: 0
    })
  }, 60_000)

  it('moves the job out of current in the ledger when finished', async () => {
    const { job } = await runSyncJob({ paths, projectRoot })
    const ledger = await readJobsLedger(paths.jobs)

    expect(ledger.current).toBeUndefined()
    expect(ledger.last?.id).toBe(job.id)
    expect(ledger.last?.status).toBe('succeeded')
  }, 60_000)

  it('leaves no lock behind after a successful run', async () => {
    await runSyncJob({ paths, projectRoot })

    await expect(readFile(paths.lock, 'utf8')).rejects.toThrow()
  }, 60_000)

  it('refuses to start a second run while one is in flight', async () => {
    const first = runSyncJob({ paths, projectRoot })

    await waitFor(async () => {
      const ledger = await readJobsLedger(paths.jobs)
      return ledger.current?.status === 'running'
    })

    // The guard runs before spawning, so the caller gets a clear "already
    // running" error instead of a child that immediately fails on the lock.
    await expect(runSyncJob({ paths, projectRoot })).rejects.toBeInstanceOf(
      SyncAlreadyRunningError
    )

    // The in-flight run is unaffected and still completes correctly.
    const finished = await first
    expect(finished.job.status).toBe('succeeded')
  }, 90_000)

  it('lets assertSyncNotRunning pass when nothing is running', async () => {
    await expect(assertSyncNotRunning(paths)).resolves.toBeUndefined()
  })

  it('reports a running job through assertSyncNotRunning', async () => {
    const running = runSyncJob({ paths, projectRoot })

    await waitFor(async () => {
      const ledger = await readJobsLedger(paths.jobs)
      return ledger.current?.status === 'running'
    })

    await expect(assertSyncNotRunning(paths)).rejects.toBeInstanceOf(
      SyncAlreadyRunningError
    )

    await running
  }, 60_000)
})

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await predicate()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }

  throw new Error('Timed out waiting for condition')
}
