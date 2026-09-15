import type {
  GallerySyncError,
  GallerySyncProgress,
  GallerySyncSummary
} from './sync'

export type GallerySyncTrigger = 'admin' | 'cli'

export type GallerySyncJobStatus = 'running' | 'succeeded' | 'failed'

export interface GallerySyncJob {
  id: string
  status: GallerySyncJobStatus
  trigger: GallerySyncTrigger
  /** Pid of the process running the sync; used to detect a crashed job. */
  pid: number
  startedAt: string
  finishedAt?: string
  progress?: GallerySyncProgress
  summary?: GallerySyncSummary
  errors?: GallerySyncError[]
  warnings?: string[]
  /** Human-readable failure reason when `status` is `failed`. */
  message?: string
}

export interface GalleryJobsLedger {
  version: 1
  /** The job in flight, if any. */
  current?: GallerySyncJob
  /** The most recently finished job, kept so the UI can show a summary. */
  last?: GallerySyncJob
}
