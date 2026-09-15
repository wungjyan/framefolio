import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  finishJob,
  readJobsLedger,
  reconcileJobsLedger,
  startJob,
  updateJobProgress,
  writeJobsLedger
} from '../../shared/node/jobs-ledger'

let root: string
let jobsPath: string

/** A pid that cannot exist on macOS or Linux (2^22 exceeds the pid ceiling). */
const DEAD_PID = 4194303

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'framefolio-jobs-'))
  jobsPath = join(root, '.state', 'jobs.json')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('jobs ledger', () => {
  it('returns an empty ledger when no file exists', async () => {
    await expect(readJobsLedger(jobsPath)).resolves.toEqual({ version: 1 })
  })

  it('treats an unreadable ledger as empty instead of throwing', async () => {
    await mkdir(join(root, '.state'), { recursive: true })
    await writeFile(jobsPath, '{ not json')

    await expect(readJobsLedger(jobsPath)).resolves.toEqual({ version: 1 })
  })

  it('records a started job with its pid and trigger', async () => {
    const job = await startJob(jobsPath, {
      id: 'job-1',
      pid: process.pid,
      trigger: 'admin'
    })

    expect(job).toMatchObject({
      id: 'job-1',
      status: 'running',
      trigger: 'admin',
      pid: process.pid
    })

    const ledger = await readJobsLedger(jobsPath)
    expect(ledger.current?.id).toBe('job-1')
  })

  it('persists progress for the current job', async () => {
    await startJob(jobsPath, {
      id: 'job-1',
      pid: process.pid,
      trigger: 'admin'
    })

    await updateJobProgress(jobsPath, 'job-1', {
      phase: 'processing',
      completed: 3,
      total: 10,
      filename: 'a.jpg'
    })

    const ledger = await readJobsLedger(jobsPath)
    expect(ledger.current?.progress).toEqual({
      phase: 'processing',
      completed: 3,
      total: 10,
      filename: 'a.jpg'
    })
  })

  it('ignores progress for a job that is no longer current', async () => {
    await startJob(jobsPath, {
      id: 'job-1',
      pid: process.pid,
      trigger: 'admin'
    })

    await updateJobProgress(jobsPath, 'other-job', {
      phase: 'processing',
      completed: 9,
      total: 10
    })

    const ledger = await readJobsLedger(jobsPath)
    expect(ledger.current?.progress).toEqual({
      phase: 'scanning',
      completed: 0,
      total: 0
    })
  })

  it('moves the job to last with its summary on success', async () => {
    await startJob(jobsPath, {
      id: 'job-1',
      pid: process.pid,
      trigger: 'admin'
    })

    await finishJob(jobsPath, 'job-1', {
      status: 'succeeded',
      summary: { added: 2, updated: 0, skipped: 1, deleted: 0, failed: 0 }
    })

    const ledger = await readJobsLedger(jobsPath)
    expect(ledger.current).toBeUndefined()
    expect(ledger.last).toMatchObject({
      id: 'job-1',
      status: 'succeeded',
      summary: { added: 2, updated: 0, skipped: 1, deleted: 0, failed: 0 }
    })
    expect(ledger.last?.finishedAt).toBeDefined()
  })

  it('records a failure message', async () => {
    await startJob(jobsPath, {
      id: 'job-1',
      pid: process.pid,
      trigger: 'cli'
    })

    await finishJob(jobsPath, 'job-1', {
      status: 'failed',
      message: 'libvips crashed'
    })

    const ledger = await readJobsLedger(jobsPath)
    expect(ledger.last).toMatchObject({
      status: 'failed',
      message: 'libvips crashed'
    })
  })

  it('keeps the previous outcome visible while a new job runs', async () => {
    await startJob(jobsPath, {
      id: 'job-1',
      pid: process.pid,
      trigger: 'admin'
    })
    await finishJob(jobsPath, 'job-1', {
      status: 'succeeded',
      summary: { added: 1, updated: 0, skipped: 0, deleted: 0, failed: 0 }
    })

    await startJob(jobsPath, {
      id: 'job-2',
      pid: process.pid,
      trigger: 'admin'
    })

    const ledger = await readJobsLedger(jobsPath)
    expect(ledger.current?.id).toBe('job-2')
    expect(ledger.last?.id).toBe('job-1')
  })

  it('writes the ledger atomically as parseable JSON', async () => {
    await startJob(jobsPath, { id: 'job-1', pid: process.pid, trigger: 'cli' })

    const raw = await readFile(jobsPath, 'utf8')
    expect(() => JSON.parse(raw)).not.toThrow()
    expect(raw.endsWith('\n')).toBe(true)
  })
})

describe('jobs ledger reconciliation', () => {
  it('does not write while merely reading', async () => {
    await writeJobsLedger(jobsPath, {
      version: 1,
      current: {
        id: 'job-1',
        status: 'running',
        trigger: 'admin',
        pid: DEAD_PID,
        startedAt: '2026-01-01T00:00:00.000Z'
      }
    })

    const ledger = await readJobsLedger(jobsPath)

    // A GET must be side-effect free: the job is still recorded as running.
    expect(ledger.current?.status).toBe('running')
  })

  it('finalises a running job whose process has died', async () => {
    await writeJobsLedger(jobsPath, {
      version: 1,
      current: {
        id: 'job-1',
        status: 'running',
        trigger: 'admin',
        pid: DEAD_PID,
        startedAt: '2026-01-01T00:00:00.000Z'
      }
    })

    const { ledger, changed } = await reconcileJobsLedger(jobsPath)

    expect(changed).toBe(true)
    expect(ledger.current).toBeUndefined()
    expect(ledger.last).toMatchObject({ id: 'job-1', status: 'failed' })
    expect(ledger.last?.message).toContain(String(DEAD_PID))
  })

  it('leaves a running job alone while its process is alive', async () => {
    await startJob(jobsPath, {
      id: 'job-1',
      pid: process.pid,
      trigger: 'admin'
    })

    const { ledger, changed } = await reconcileJobsLedger(jobsPath)

    expect(changed).toBe(false)
    expect(ledger.current?.id).toBe('job-1')
    expect(ledger.current?.status).toBe('running')
  })

  it('is a no-op when there is no current job', async () => {
    const { changed } = await reconcileJobsLedger(jobsPath)

    expect(changed).toBe(false)
  })
})
