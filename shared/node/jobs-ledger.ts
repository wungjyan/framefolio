import { readJsonFile, writeJsonFileAtomic } from './json-file'
import { isProcessAlive } from './temporary-files'
import type {
  GalleryJobsLedger,
  GallerySyncJob,
  GallerySyncJobStatus,
  GallerySyncTrigger
} from '../types/job'
import type {
  GallerySyncError,
  GallerySyncProgress,
  GallerySyncSummary
} from '../types/sync'

/**
 * Read the ledger without modifying it. A missing or unparseable file reads as
 * an empty ledger so a corrupt record cannot break the admin UI.
 */
export async function readJobsLedger(
  jobsPath: string
): Promise<GalleryJobsLedger> {
  const ledger = await readJsonFile<GalleryJobsLedger>(jobsPath)

  if (!ledger || ledger.version !== 1) {
    return { version: 1 }
  }

  return ledger
}

/**
 * Finalise a job recorded as running whose process has disappeared.
 *
 * This is deliberately separate from `readJobsLedger`: reading must not write,
 * and only the status endpoint needs to reconcile. Without it, a crashed sync
 * would leave the UI waiting forever on a job nobody is running.
 *
 * Returns the reconciled ledger and whether anything changed.
 */
export async function reconcileJobsLedger(
  jobsPath: string,
  isAlive: (pid: number) => boolean = isProcessAlive
): Promise<{ ledger: GalleryJobsLedger; changed: boolean }> {
  const ledger = await readJobsLedger(jobsPath)
  const current = ledger.current

  if (current?.status !== 'running' || isAlive(current.pid)) {
    return { ledger, changed: false }
  }

  const crashed: GallerySyncJob = {
    ...current,
    status: 'failed',
    finishedAt: new Date().toISOString(),
    message: `The sync process (pid ${current.pid}) is no longer running.`
  }

  const reconciled: GalleryJobsLedger = { version: 1, last: crashed }

  await writeJobsLedger(jobsPath, reconciled)

  return { ledger: reconciled, changed: true }
}

export async function writeJobsLedger(
  jobsPath: string,
  ledger: GalleryJobsLedger
): Promise<void> {
  await writeJsonFileAtomic(jobsPath, ledger)
}

/**
 * Record a newly started job and return the stored record.
 */
export async function startJob(
  jobsPath: string,
  options: {
    id: string
    pid: number
    trigger: GallerySyncTrigger
    startedAt?: string
  }
): Promise<GallerySyncJob> {
  const job: GallerySyncJob = {
    id: options.id,
    status: 'running',
    trigger: options.trigger,
    pid: options.pid,
    startedAt: options.startedAt ?? new Date().toISOString(),
    progress: { phase: 'scanning', completed: 0, total: 0 }
  }

  const ledger = await readJobsLedger(jobsPath)

  await writeJobsLedger(jobsPath, {
    version: 1,
    // Keep the previous `last` while a new job runs, so the UI can still show
    // the outcome of the previous run next to the live progress.
    ...(ledger.last ? { last: ledger.last } : {}),
    current: job
  })

  return job
}

export async function updateJobProgress(
  jobsPath: string,
  jobId: string,
  progress: GallerySyncProgress
): Promise<void> {
  const ledger = await readJobsLedger(jobsPath)

  if (ledger.current?.id !== jobId) {
    return
  }

  await writeJobsLedger(jobsPath, {
    ...ledger,
    current: { ...ledger.current, progress }
  })
}

export async function finishJob(
  jobsPath: string,
  jobId: string,
  outcome: {
    status: Extract<GallerySyncJobStatus, 'succeeded' | 'failed'>
    summary?: GallerySyncSummary
    errors?: GallerySyncError[]
    warnings?: string[]
    message?: string
    finishedAt?: string
  }
): Promise<void> {
  const ledger = await readJobsLedger(jobsPath)

  if (ledger.current?.id !== jobId) {
    return
  }

  const finished: GallerySyncJob = {
    ...ledger.current,
    status: outcome.status,
    finishedAt: outcome.finishedAt ?? new Date().toISOString(),
    ...(outcome.summary ? { summary: outcome.summary } : {}),
    ...(outcome.errors ? { errors: outcome.errors } : {}),
    ...(outcome.warnings ? { warnings: outcome.warnings } : {}),
    ...(outcome.message ? { message: outcome.message } : {})
  }

  await writeJobsLedger(jobsPath, {
    version: 1,
    last: finished
  })
}
