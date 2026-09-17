import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

import {
  finishJob,
  readJobsLedger,
  reconcileJobsLedger,
  startJob,
  updateJobProgress
} from './jobs-ledger'
import { SyncLockError, acquireSyncLock } from './gallery-lock'
import type { GalleryPaths } from './gallery-paths'
import type { GallerySyncJob } from '../types/job'
import type {
  GallerySyncEvent,
  GallerySyncOutcome,
  GallerySyncProgress
} from '../types/sync'

export interface SyncRunnerOptions {
  paths: GalleryPaths
  /** Project root containing `scripts/gallery-sync.ts`. */
  projectRoot: string
  /** Node executable and extra args, injected for tests. */
  nodePath?: string
  /** Extra arguments placed before the script path, e.g. tsx loader flags. */
  loaderArgs?: string[]
  now?: () => Date
}

export interface SyncRunResult {
  job: GallerySyncJob
  outcome?: GallerySyncOutcome
}

export interface SyncJobHandle {
  /** The ledger record as written at start; its status is still `running`. */
  job: GallerySyncJob
  /**
   * Resolves once the child process has exited and the ledger is finalised.
   *
   * It never rejects. Nothing awaits a detached run, so a rejection would be
   * unhandled and would take the server down; failures are reported through
   * the ledger instead, which is what the admin UI polls.
   */
  completion: Promise<SyncRunResult>
}

export class SyncAlreadyRunningError extends Error {
  readonly holderPid: number | undefined

  constructor(message: string, holderPid?: number) {
    super(message)
    this.name = 'SyncAlreadyRunningError'
    this.holderPid = holderPid
  }
}

/**
 * Resolve the project root containing `scripts/gallery-sync.ts`.
 *
 * `process.cwd()` is the primary source of truth: the container sets WORKDIR to
 * `/app` and dev runs from the repository root, so both find `scripts/` next to
 * the working directory. The module-relative fallback exists for callers that
 * run with a different cwd (for example a test runner), but it must not be the
 * only strategy: Nitro bundles this file into `.output/server/chunks/...`, where
 * a path relative to the source no longer points at the project root.
 */
export function resolveProjectRoot(fromUrl: string): string {
  const candidates = [
    process.cwd(),
    resolve(dirname(fileURLToPath(fromUrl)), '..', '..')
  ]

  for (const candidate of candidates) {
    try {
      if (existsSync(join(candidate, 'scripts', 'gallery-sync.ts'))) {
        return candidate
      }
    } catch {
      // Ignore an unreadable candidate and try the next one.
    }
  }

  return candidates[0] as string
}

/**
 * Start a gallery sync in a child process and record it in the jobs ledger.
 *
 * A child process is used deliberately: sharp/libvips can crash on a corrupt
 * image with a native fault that no try/catch can contain, and a subprocess
 * keeps the web server alive when that happens.
 *
 * Returns as soon as the child has been spawned, together with a `completion`
 * promise that settles when the run is over. Callers that only need to trigger
 * a run (the admin API) can return immediately and let the UI follow progress
 * through `GET /api/admin/sync`, which reads the same ledger.
 *
 * That split is what keeps the HTTP request short. Awaiting the whole run in
 * the request handler used to hold the connection open for the entire sync —
 * measured at ~28s for a 24-photo first import on an M4, and considerably
 * longer on NAS hardware. Any reverse proxy or tunnel in front of the app
 * (nginx `proxy_read_timeout`, frp `vhost_http_timeout`, both defaulting to
 * 60s) would then answer 504 while the sync itself carried on to completion,
 * which is confusing precisely because the work succeeds.
 */
export async function startSyncJob(
  options: SyncRunnerOptions
): Promise<SyncJobHandle> {
  const { paths, projectRoot } = options
  const scriptPath = join(projectRoot, 'scripts', 'gallery-sync.ts')
  const nodePath = options.nodePath ?? process.execPath
  const loaderArgs = options.loaderArgs ?? ['--import', 'tsx']
  const jobId = randomUUID()

  // Refuse early rather than spawning a child that would immediately fail on
  // the lock. This also protects the ledger: without it, a second run would
  // overwrite `current` and orphan the first run's completion record.
  await assertSyncNotRunning(paths)

  // The ledger must be written before the child starts so the UI can observe a
  // running job even if the child fails immediately.
  const job = await startJob(paths.jobs, {
    id: jobId,
    // The child's pid is not known until spawn returns, so record our own pid
    // first: it stays alive for the whole run, which is what liveness checks
    // need. The child's pid is recorded separately for diagnostics.
    pid: process.pid,
    trigger: 'admin',
    ...(options.now ? { startedAt: options.now().toISOString() } : {})
  })

  const child = spawn(nodePath, [...loaderArgs, scriptPath, '--jsonl'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NUXT_GALLERY_DATA_DIR: paths.data
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let outcome: GallerySyncOutcome | undefined
  let lockMessage: string | undefined
  let fatalMessage: string | undefined
  let spawnError: string | undefined
  let stderrBuffer = ''

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    for (const line of chunk.split('\n')) {
      const event = parseSyncEvent(line)

      if (!event) {
        continue
      }

      if (event.type === 'progress') {
        void updateJobProgress(paths.jobs, jobId, event.progress)
      } else if (event.type === 'result') {
        outcome = event.outcome
      } else if (event.type === 'lock-error') {
        lockMessage = event.message
      } else {
        fatalMessage = event.message
      }
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderrBuffer += chunk
  })

  // A spawn failure (ENOENT, EACCES) arrives as an 'error' event, not as a
  // non-zero exit code. Recording it here keeps the exit-code promise from
  // depending on which of the two events happens to fire.
  child.on('error', (error: Error) => {
    spawnError = error.message
  })

  /**
   * Settle the ledger when the child is gone.
   *
   * `completion` is the only place the run's outcome is recorded, and it is
   * deliberately not awaited by its creator: a caller that returned early still
   * gets a finalised ledger. Every rejection path is converted into a
   * `failed` record, because an unhandled rejection here would crash the
   * server — the exact opposite of the child-process isolation this file is
   * built around.
   */
  const completion = new Promise<SyncRunResult>(resolvePromise => {
    child.on('close', async (code: number | null) => {
      try {
        const exitCode = spawnError ? 1 : code
        const failed = exitCode !== 0 || fatalMessage !== undefined

        if (lockMessage) {
          await finishJob(paths.jobs, jobId, {
            status: 'failed',
            message: lockMessage
          })
        } else if (failed && !outcome) {
          await finishJob(paths.jobs, jobId, {
            status: 'failed',
            message:
              fatalMessage ??
              spawnError ??
              stderrBuffer.trim() ??
              `The sync process exited with code ${exitCode}.`
          })
        } else if (outcome) {
          await finishJob(paths.jobs, jobId, {
            status:
              outcome.errors.length > 0 || failed ? 'failed' : 'succeeded',
            summary: outcome.summary,
            errors: outcome.errors,
            warnings: outcome.warnings
          })
        } else {
          await finishJob(paths.jobs, jobId, {
            status: 'failed',
            message: `The sync process exited with code ${exitCode} without reporting a result.`
          })
        }

        const ledger = await readJobsLedger(paths.jobs)

        resolvePromise({
          job: ledger.last ?? job,
          ...(outcome ? { outcome } : {})
        })
      } catch (error: unknown) {
        // Finalising the ledger must not become an unhandled rejection. Report
        // the failure through the same channel as any other failed run.
        resolvePromise({
          job: {
            ...job,
            status: 'failed',
            finishedAt: new Date().toISOString(),
            message: `Could not record the sync outcome: ${
              error instanceof Error ? error.message : String(error)
            }`
          }
        })
      }
    })
  })

  return { job, completion }
}

/**
 * Start a sync and wait for it to finish.
 *
 * A convenience wrapper used by tests, which genuinely need the final result.
 * The CLI does not go through this module at all: it calls `runGallerySync`
 * in-process. The admin API uses `startSyncJob` so its request does not stay
 * open for the length of the run.
 */
export async function runSyncJob(
  options: SyncRunnerOptions
): Promise<SyncRunResult> {
  const { completion } = await startSyncJob(options)

  return completion
}

/**
 * Refuse a new run while a sync is in flight.
 *
 * The child process acquires the real lock; this is an early, cheap check so
 * the admin API can answer "already running" without spawning a process that
 * would immediately exit.
 */
export async function assertSyncNotRunning(paths: GalleryPaths): Promise<void> {
  const { ledger } = await reconcileJobsLedger(paths.jobs)
  const current = ledger.current

  if (current?.status === 'running') {
    throw new SyncAlreadyRunningError(
      `A gallery sync is already running (started ${current.startedAt}).`,
      current.pid
    )
  }

  // Also respect a lock held by a CLI run that this process did not start.
  try {
    const release = await acquireSyncLock({
      lockPath: paths.lock,
      reason: 'admin-precheck'
    })
    await release()
  } catch (error: unknown) {
    if (error instanceof SyncLockError) {
      throw new SyncAlreadyRunningError(error.message, error.holder?.pid)
    }
    throw error
  }
}

function parseSyncEvent(line: string): GallerySyncEvent | undefined {
  const trimmed = line.trim()

  if (!trimmed.startsWith('{')) {
    return undefined
  }

  try {
    const value: unknown = JSON.parse(trimmed)

    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { type?: unknown }).type === 'string'
    ) {
      return value as GallerySyncEvent
    }
  } catch {
    // Ignore non-JSON output such as library warnings on stdout.
  }

  return undefined
}

export type { GallerySyncProgress }
