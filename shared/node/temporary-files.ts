import { randomUUID } from 'node:crypto'
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Temporary files are named `<final name>.<pid>-<uuid>.tmp`. The pid is part of
 * the name so a later run can tell whether the owner is still alive.
 */
const TEMPORARY_FILE_PATTERN = /\.(\d+)-[0-9a-f-]{36}\.tmp$/

export function createTemporarySuffix(): string {
  return `${process.pid}-${randomUUID()}.tmp`
}

export function createTemporaryPath(finalPath: string): string {
  return `${finalPath}.${createTemporarySuffix()}`
}

export function parseTemporaryFilePid(filename: string): number | undefined {
  const match = TEMPORARY_FILE_PATTERN.exec(filename)
  if (!match?.[1]) {
    return undefined
  }

  const pid = Number(match[1])
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}

/**
 * `process.kill(pid, 0)` sends no signal; it only reports whether the pid can be
 * signalled. EPERM means the process exists but belongs to another user.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Remove leftover temporary files that no live process can still be writing.
 *
 * This deliberately does NOT remove every `*.tmp` file: the admin button and the
 * CLI can sync against the same data directory, and an unconditional sweep would
 * delete files a concurrent process is about to rename into place, leaving that
 * photo without derivatives (this was observed as ENOENT rename failures).
 *
 * Files whose owner is unidentified are left alone while recent, and removed
 * once older than `staleAfterMs`, so a crashed run cannot leak them forever.
 *
 * A file whose owning pid is alive is never removed, even if it is old. Such a
 * file can only leak through pid reuse by an unrelated process, which is far
 * preferable to deleting a derivative a live sync is about to publish.
 */
export async function cleanStaleTemporaryFiles(
  directory: string,
  staleAfterMs: number,
  now: () => number = Date.now
): Promise<string[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }

  const removed: string[] = []
  const currentTime = now()

  await Promise.all(
    entries.map(async entry => {
      if (!entry.isFile() || !entry.name.endsWith('.tmp')) {
        return
      }

      const fullPath = join(directory, entry.name)
      const pid = parseTemporaryFilePid(entry.name)

      // A live process owns this file, so leave it alone. This includes our own
      // pid: two overlapping requests can share one process, so "same pid" is
      // not proof that the file is safe to delete.
      if (pid !== undefined && isProcessAlive(pid)) {
        return
      }

      if (pid === undefined) {
        let fileStat
        try {
          fileStat = await stat(fullPath)
        } catch {
          return
        }

        if (currentTime - fileStat.mtimeMs < staleAfterMs) {
          return
        }
      }

      await rm(fullPath, { force: true })
      removed.push(entry.name)
    })
  )

  return removed
}
