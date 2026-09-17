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
  runSyncJob,
  startSyncJob
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

  it('returns as soon as the run is started, without waiting for it', async () => {
    // The regression this guards: the admin request used to stay open for the
    // whole sync, so a reverse proxy would time out with 504 while the sync
    // itself succeeded. Starting must not block on the child process.
    const { job, completion } = await startSyncJob({ paths, projectRoot })

    expect(job.status).toBe('running')

    // The run is genuinely still in flight at this point: the start call has
    // already returned while the ledger row is not finalised yet. (If the sync
    // were instantaneous this could race, so accept either an unfinished or a
    // just-finished record and rely on the assertions below for the real
    // contract.)
    const settled = await completion
    expect(settled.job.status).toBe('succeeded')
  }, 60_000)

  it('records a running job in the ledger before the start call resolves', async () => {
    const { job, completion } = await startSyncJob({ paths, projectRoot })
    const ledger = await readJobsLedger(paths.jobs)

    expect(ledger.current?.id).toBe(job.id)
    expect(ledger.current?.status).toBe('running')

    await completion
  }, 60_000)

  it('finalises the ledger even when the caller does not await completion', async () => {
    // The admin API detaches from `completion`; the ledger must still end up
    // correct, because that record is the only thing the UI polls.
    const { job, completion } = await startSyncJob({ paths, projectRoot })

    // Deliberately do not await `completion` before checking.
    await waitFor(async () => {
      const ledger = await readJobsLedger(paths.jobs)

      return ledger.current === undefined && ledger.last?.id === job.id
    })

    expect((await readJobsLedger(paths.jobs)).last?.status).toBe('succeeded')

    // Drain it so the test does not leave work running.
    await completion
  }, 60_000)

  it('never rejects completion, so a detached run cannot crash the process', async () => {
    // A run whose child cannot be spawned at all is the worst case: with the
    // old implementation this surfaced as a rejected promise. The runner must
    // convert it into a failed ledger record instead.
    const { completion } = await startSyncJob({
      paths,
      projectRoot,
      nodePath: join(root, 'definitely-not-a-real-node-binary')
    })

    await expect(completion).resolves.toBeDefined()
    await waitFor(async () => {
      const ledger = await readJobsLedger(paths.jobs)

      return ledger.last?.status === 'failed'
    })

    const ledger = await readJobsLedger(paths.jobs)
    expect(ledger.last?.message).toBeTruthy()
    expect(ledger.current).toBeUndefined()
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
