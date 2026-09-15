import { pathToFileURL } from 'node:url'

import { SyncLockError, withSyncLock } from '../shared/node/gallery-lock'
import {
  resolveGalleryPaths,
  type GalleryPaths
} from '../shared/node/gallery-paths'
import type {
  GallerySyncEvent,
  GallerySyncProgress
} from '../shared/types/sync'
import { runGallerySync } from './lib/gallery-sync'

export interface RunSyncCliOptions {
  /**
   * Emit newline-delimited JSON events on stdout instead of human-readable
   * text. The admin sync runner uses this to report progress.
   */
  jsonl?: boolean
  paths?: GalleryPaths
  stdout?: (line: string) => void
  stderr?: (line: string) => void
}

/**
 * Run one gallery sync from the command line and return a process exit code.
 *
 * The lock is acquired here, which is what makes the CLI and the web-triggered
 * runner mutually exclusive. Returning the code (instead of calling
 * `process.exit`) keeps this testable.
 */
export async function runSyncCli(
  options: RunSyncCliOptions = {}
): Promise<number> {
  const jsonl = options.jsonl ?? false
  const write = options.stdout ?? ((line: string) => console.info(line))
  const writeError = options.stderr ?? ((line: string) => console.error(line))
  const paths = options.paths ?? resolveGalleryPaths()

  const emit = (event: GallerySyncEvent): void => {
    write(JSON.stringify(event))
  }

  try {
    return await withSyncLock(
      { lockPath: paths.lock, reason: 'cli' },
      async () => {
        const result = await runGallerySync({
          paths,
          ...(jsonl
            ? {
                onProgress: (progress: GallerySyncProgress) => {
                  emit({ type: 'progress', progress })
                }
              }
            : {})
        })

        return reportResult(result, jsonl, write, writeError)
      }
    )
  } catch (error: unknown) {
    if (error instanceof SyncLockError) {
      if (jsonl) {
        emit({
          type: 'lock-error',
          message: error.message,
          ...(error.holder ? { holderPid: error.holder.pid } : {})
        })
      } else {
        writeError(`Gallery sync skipped: ${error.message}`)
      }

      return 1
    }

    const message = error instanceof Error ? error.message : String(error)

    if (jsonl) {
      emit({ type: 'fatal', message })
    }

    writeError(`Gallery sync aborted: ${message}`)
    return 1
  }
}

function reportResult(
  result: Awaited<ReturnType<typeof runGallerySync>>,
  jsonl: boolean,
  write: (line: string) => void,
  writeError: (line: string) => void
): number {
  const { summary } = result

  if (jsonl) {
    write(
      JSON.stringify({
        type: 'result',
        outcome: {
          summary,
          errors: result.errors,
          warnings: result.warnings
        }
      })
    )

    return result.errors.length > 0 ? 1 : 0
  }

  write(
    [
      'Gallery sync complete:',
      `added ${summary.added}`,
      `updated ${summary.updated}`,
      `skipped ${summary.skipped}`,
      `deleted ${summary.deleted}`,
      `failed ${summary.failed}`
    ].join(' ')
  )

  for (const warning of result.warnings) {
    writeError(`Warning: ${warning}`)
  }

  for (const error of result.errors) {
    writeError(`Failed: ${error.filename}: ${error.message}`)
  }

  return result.errors.length > 0 ? 1 : 0
}

const entryPath = process.argv[1]

if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  runSyncCli({ jsonl: process.argv.includes('--jsonl') })
    .then(exitCode => {
      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Gallery sync aborted: ${message}`)
      process.exitCode = 1
    })
}
