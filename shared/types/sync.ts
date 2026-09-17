export interface GallerySyncSummary {
  added: number
  updated: number
  skipped: number
  deleted: number
  failed: number
}

export interface GallerySyncError {
  filename: string
  message: string
}

export type GallerySyncPhase = 'scanning' | 'processing' | 'finalising' | 'done'

export interface GallerySyncProgress {
  /** Current phase of the pipeline. */
  phase: GallerySyncPhase
  /** Photos already handled (processed, skipped, or failed) in this run. */
  completed: number
  /** Total photos discovered in `originals/`. */
  total: number
  /** Filename currently being processed, when applicable. */
  filename?: string
}

/**
 * The part of a sync result that the web-triggered job runner reports back.
 * The full index is deliberately excluded: the public API re-reads it.
 */
export interface GallerySyncOutcome {
  summary: GallerySyncSummary
  errors: GallerySyncError[]
  warnings: string[]
}

/**
 * Newline-delimited JSON events emitted by `scripts/gallery-sync.ts --jsonl`.
 * The admin sync runner parses these to report progress; the human CLI mode
 * keeps its plain-text output instead.
 */
export type GallerySyncEvent =
  | { type: 'progress'; progress: GallerySyncProgress }
  | { type: 'result'; outcome: GallerySyncOutcome }
  | { type: 'lock-error'; message: string; holderPid?: number }
  | { type: 'fatal'; message: string }

/**
 * Publishes generated derivatives to object storage.
 *
 * Declared here rather than in the pipeline so the S3 adapter can implement it
 * without importing the pipeline, which would pull sharp (a native module) into
 * the server request path.
 */
export interface RemotePublisher {
  /** Upload one generated file. `fileName` is the bare storage key. */
  upload: (fileName: string, filePath: string) => Promise<void>
  /** Remove one generated file. A missing object must not throw. */
  remove: (fileName: string) => Promise<void>
  /**
   * List the storage keys currently present in the bucket.
   *
   * Reconciliation needs a view of the bucket. Relying on the previous index
   * alone can only clean up photos it remembered, which leaks every superseded
   * revision and never retries a removal that failed.
   */
  list: () => Promise<string[]>
}
