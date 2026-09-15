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
  | 'unchanged'
  | 'added'
  | 'changed'
  | 'pending-delete'

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

/** Response of `POST /api/admin/sync`. */
export interface AdminSyncStartResponse {
  started: boolean
  jobId: string
}

/** Response of `PUT /api/admin/photos/:filename`. */
export interface AdminUploadResponse {
  filename: string
  bytes: number
  format?: string
}

/** Response of `DELETE /api/admin/photos/:filename`. */
export interface AdminDeleteResponse {
  filename: string
  /** Where the original was moved, relative to the data directory. */
  trashPath: string
  /** True when the deletion is visible to visitors only after a sync. */
  requiresSync: boolean
}
