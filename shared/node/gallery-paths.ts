import { resolve } from 'node:path'

import {
  DEFAULT_GALLERY_DATA_DIRECTORY,
  GALLERY_DATA_DIRECTORY_ENV,
  GALLERY_INDEX_FILENAME,
  GENERATED_DIRECTORY_NAME,
  INCOMING_DIRECTORY_NAME,
  ORIGINALS_DIRECTORY_NAME,
  STATE_DIRECTORY_NAME,
  TRASH_DIRECTORY_NAME
} from '../constants/gallery'

export interface GalleryPaths {
  data: string
  originals: string
  generated: string
  incoming: string
  trash: string
  state: string
  jobs: string
  lock: string
  /** Persisted storage-source selection, written by the admin UI. */
  storageState: string
  index: string
}

export interface ResolveGalleryPathsOptions {
  currentWorkingDirectory?: string
  dataDirectory?: string
  environment?: NodeJS.ProcessEnv
}

export function resolveGalleryPaths(
  options: ResolveGalleryPathsOptions = {}
): GalleryPaths {
  const currentWorkingDirectory =
    options.currentWorkingDirectory ?? process.cwd()
  const environment = options.environment ?? process.env
  const configuredDirectory =
    options.dataDirectory ??
    environment[GALLERY_DATA_DIRECTORY_ENV] ??
    DEFAULT_GALLERY_DATA_DIRECTORY
  const data = resolve(currentWorkingDirectory, configuredDirectory)
  const state = resolve(data, STATE_DIRECTORY_NAME)

  return {
    data,
    originals: resolve(data, ORIGINALS_DIRECTORY_NAME),
    generated: resolve(data, GENERATED_DIRECTORY_NAME),
    incoming: resolve(data, INCOMING_DIRECTORY_NAME),
    trash: resolve(data, TRASH_DIRECTORY_NAME),
    state,
    jobs: resolve(state, 'jobs.json'),
    lock: resolve(state, 'sync.lock'),
    storageState: resolve(state, 'storage.json'),
    index: resolve(data, GALLERY_INDEX_FILENAME)
  }
}
