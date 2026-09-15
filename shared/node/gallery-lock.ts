import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

import { isProcessAlive } from './temporary-files'

export interface SyncLockInfo {
  pid: number
  acquiredAt: string
  reason?: string
}

export interface AcquireSyncLockOptions {
  /** Where to write the lock file, e.g. `data/.state/sync.lock`. */
  lockPath: string
  /** Free-form note recorded in the lock file, e.g. `cli` or `admin`. */
  reason?: string
  /** Injected for tests. */
  now?: () => Date
  /** Injected for tests; defaults to checking the real process table. */
  isAlive?: (pid: number) => boolean
}

export class SyncLockError extends Error {
  readonly holder: SyncLockInfo | undefined

  constructor(message: string, holder?: SyncLockInfo) {
    super(message)
    this.name = 'SyncLockError'
    this.holder = holder
  }
}

const MAX_ACQUIRE_ATTEMPTS = 3

/**
 * How long an unreadable lock file is trusted as "a live process is between
 * creating the file and writing its contents".
 */
const UNREADABLE_LOCK_GRACE_MS = 30 * 1000

/**
 * Serialise gallery syncs across processes.
 *
 * The admin button, the CLI, and any script all mutate the same index and
 * generated directory. `open(path, 'wx')` is atomic, so only one caller can
 * create the lock file; everyone else is told a sync is already running.
 *
 * A leftover lock whose owning process is gone is reclaimed rather than
 * blocking sync forever, which is what makes the CLI a reliable escape hatch.
 */
export async function acquireSyncLock(
  options: AcquireSyncLockOptions
): Promise<() => Promise<void>> {
  const { lockPath, reason } = options
  const now = options.now ?? (() => new Date())
  const isAlive = options.isAlive ?? isProcessAlive

  await mkdir(dirname(lockPath), { recursive: true })

  for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
    let handle

    try {
      handle = await open(lockPath, 'wx')
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }

      const holder = await readSyncLock(lockPath)

      if (holder && !isAlive(holder.pid)) {
        // The owner is gone; reclaim the lock and try again.
        await rm(lockPath, { force: true })
        continue
      }

      if (!holder && (await isStaleUnreadableLock(lockPath, now))) {
        // The file exists but has no readable owner, and it is old: assume a
        // crashed run left it behind rather than blocking sync forever.
        await rm(lockPath, { force: true })
        continue
      }

      throw new SyncLockError(
        holder
          ? `A gallery sync is already running (pid ${holder.pid}, started ${holder.acquiredAt}).`
          : 'A gallery sync is already running.',
        holder
      )
    }

    const info: SyncLockInfo = {
      pid: process.pid,
      acquiredAt: now().toISOString(),
      ...(reason === undefined ? {} : { reason })
    }

    try {
      await handle.writeFile(`${JSON.stringify(info, null, 2)}\n`, 'utf8')
    } finally {
      await handle.close()
    }

    let released = false

    return async () => {
      if (released) {
        return
      }

      released = true
      // Only remove the lock if we still own it, so a reclaimed lock owned by a
      // newer process is never deleted by a stale release.
      const current = await readSyncLock(lockPath)

      if (
        current?.pid === process.pid &&
        current.acquiredAt === info.acquiredAt
      ) {
        await rm(lockPath, { force: true })
      }
    }
  }

  throw new SyncLockError('Unable to acquire the gallery sync lock.')
}

/**
 * `open(path, 'wx')` makes the file visible before its contents are written, so
 * a concurrent caller can briefly observe an empty lock. Such a file is treated
 * as held until it has been unreadable for longer than the grace period.
 */
async function isStaleUnreadableLock(
  lockPath: string,
  now: () => Date
): Promise<boolean> {
  try {
    const stats = await stat(lockPath)
    return now().getTime() - stats.mtimeMs > UNREADABLE_LOCK_GRACE_MS
  } catch {
    // The file disappeared between the failed open and this stat: the holder
    // released it, so the next attempt can take the lock.
    return true
  }
}

export async function readSyncLock(
  lockPath: string
): Promise<SyncLockInfo | undefined> {
  let contents: string

  try {
    contents = await readFile(lockPath, 'utf8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }

  try {
    const value: unknown = JSON.parse(contents)

    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as SyncLockInfo).pid === 'number' &&
      typeof (value as SyncLockInfo).acquiredAt === 'string'
    ) {
      return value as SyncLockInfo
    }
  } catch {
    // A partially written or corrupt lock is treated as unreadable; the caller
    // then decides based on the missing holder.
  }

  return undefined
}

/**
 * Run `task` while holding the sync lock, releasing it in all outcomes.
 */
export async function withSyncLock<T>(
  options: AcquireSyncLockOptions,
  task: () => Promise<T>
): Promise<T> {
  const release = await acquireSyncLock(options)

  try {
    return await task()
  } finally {
    await release()
  }
}
