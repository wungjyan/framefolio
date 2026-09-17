/** Response of `GET /api/admin/session`. */
export interface AdminSessionResponse {
  authenticated: boolean
  expiresInSeconds?: number
}

/** Response of `POST /api/admin/session`. */
export interface AdminLoginResponse {
  authenticated: boolean
  expiresInSeconds: number
}

/** Per-photo remote (object storage) state. */
export interface AdminPhotoRemoteState {
  provider: 's3'
  revision: string
  uploadedAt: string
}

/**
 * A row in the admin photo list.
 *
 * This is intentionally richer than the public `GalleryPhoto`: the admin UI
 * needs to explain *why* a photo differs from what visitors see.
 */
export interface AdminPhoto {
  id: string
  filename: string
  width: number
  height: number
  /** Storage keys used by both storage sources. */
  storage: {
    thumbnail: string
    preview: string
  }
  /** Local original state. */
  source: {
    size: number
    mtimeMs: number
    revision: string
  }
  /** Present only after the derivative was uploaded to object storage. */
  remote?: AdminPhotoRemoteState
  /**
   * Difference between `originals/` and the published index:
   * - `unchanged`: what visitors see matches the file on disk
   * - `added`:     not published yet
   * - `changed`:   the file changed since it was published
   * - `pending-delete`: still published, but the original is gone (in `.trash/`)
   */
  state: AdminPhotoState
  publishedAt?: string
  takenAt?: string
  cameraMake?: string
  cameraModel?: string
}

export type AdminPhotoState =
  'unchanged' | 'added' | 'changed' | 'pending-delete'

/** Counts of unpublished changes, shown as the "pending" banner. */
export interface AdminPendingSummary {
  added: number
  changed: number
  pendingDelete: number
  total: number
}

/** Response of `GET /api/admin/photos`. */
export interface AdminPhotosResponse {
  photos: AdminPhoto[]
  pending: AdminPendingSummary
  /**
   * True when `photos.json` exists but this version cannot read it (for example
   * after upgrading from an older schema). The admin area must still work in
   * that state, because pressing Sync is what fixes it.
   */
  indexIncompatible?: boolean
  indexMessage?: string
}

/** Response of `GET /api/admin/sync`. */
export interface AdminSyncStatusResponse {
  running: boolean
  current?: {
    id: string
    startedAt: string
    trigger: string
    progress?: {
      phase: string
      completed: number
      total: number
      filename?: string
    }
  }
  last?: {
    id: string
    status: 'succeeded' | 'failed'
    startedAt: string
    finishedAt?: string
    summary?: {
      added: number
      updated: number
      skipped: number
      deleted: number
      failed: number
    }
    errors?: { filename: string; message: string }[]
    warnings?: string[]
    message?: string
  }
}

/**
 * Response of `POST /api/admin/sync`.
 *
 * The request only starts the run and answers immediately, so the outcome is
 * not known here. Poll `GET /api/admin/sync` for progress and for the final
 * `last` record, including its summary and errors.
 */
export interface AdminSyncStartResponse {
  started: boolean
  jobId: string
  /** Always `running`: the run was started but is not awaited by the request. */
  status?: 'running'
}

/** Response of `PUT /api/admin/photos/:filename`. */
export interface AdminUploadResponse {
  filename: string
  bytes: number
  format?: string
  width?: number
  height?: number
}

/** Response of `DELETE /api/admin/photos/:filename`. */
export interface AdminDeleteResponse {
  filename: string
  /** Where the original was moved, relative to the data directory. */
  trashPath: string
  /** True when the deletion is visible to visitors only after a sync. */
  requiresSync: boolean
}

/** Response of `GET|PUT /api/admin/storage/source`. */
export interface AdminStorageSourceResponse {
  /** Configured source, as requested by the operator. */
  source: 'local' | 'r2'
  /** Source actually used; differs when r2 is selected but incomplete. */
  effectiveSource: 'local' | 'r2'
  configured: boolean
  publicBaseUrl?: string
  updatedAt?: string
}

/** Response of `GET /api/admin/storage`. */
export interface AdminStorageStatusResponse {
  /** Configured source, as requested by the operator. */
  source: 'local' | 'r2'
  /** Source actually used; differs when r2 is selected but incomplete. */
  effectiveSource: 'local' | 'r2'
  configured: boolean
  connected?: boolean
  message?: string
  publicBaseUrl?: string
  prefix?: string
  /** Photos in the published index. */
  totalPhotos: number
  /** Photos whose current revision is recorded as uploaded. */
  photosWithRemote: number
  /** Derivatives the index references (2 per photo). */
  expectedObjects: number
  /** Objects found in the bucket under the prefix. */
  storedObjects?: number
  /** Referenced derivatives missing from the bucket. */
  missingObjects?: number
  /** Objects in the bucket that no photo references. */
  orphanedObjects?: number
}
