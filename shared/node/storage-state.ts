import { readJsonFile, writeJsonFileAtomic } from './json-file'
import { parseStorageSource, type StorageSource } from './photo-url'

/**
 * The operator-selected storage source, persisted at runtime.
 *
 * This exists because switching sources should not require editing the
 * environment and restarting the container: the admin UI writes this file and
 * reads pick it up immediately.
 *
 * Precedence: this file wins over `FRAMEFOLIO_STORAGE_SOURCE`. The environment
 * variable is therefore the *initial* value, and an explicit choice in the UI
 * overrides it from then on.
 */
export interface StorageState {
  version: 1
  source: StorageSource
  updatedAt: string
}

export async function readStorageState(
  statePath: string
): Promise<StorageState | undefined> {
  const value = await readJsonFile<StorageState>(statePath)

  if (!value || value.version !== 1) {
    return undefined
  }

  return {
    version: 1,
    source: parseStorageSource(value.source),
    updatedAt:
      typeof value.updatedAt === 'string'
        ? value.updatedAt
        : new Date(0).toISOString()
  }
}

export async function writeStorageState(
  statePath: string,
  source: StorageSource,
  now: Date = new Date()
): Promise<StorageState> {
  const state: StorageState = {
    version: 1,
    source,
    updatedAt: now.toISOString()
  }

  await writeJsonFileAtomic(statePath, state)

  return state
}
