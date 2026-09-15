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
