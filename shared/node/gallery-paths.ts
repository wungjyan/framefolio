import { resolve } from 'node:path'

import {
  DEFAULT_GALLERY_DATA_DIRECTORY,
  GALLERY_DATA_DIRECTORY_ENV,
  GALLERY_INDEX_FILENAME,
  GENERATED_DIRECTORY_NAME,
  ORIGINALS_DIRECTORY_NAME
} from '../constants/gallery'

export interface GalleryPaths {
  data: string
  originals: string
  generated: string
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
  const currentWorkingDirectory = options.currentWorkingDirectory ?? process.cwd()
  const environment = options.environment ?? process.env
  const configuredDirectory = options.dataDirectory
    ?? environment[GALLERY_DATA_DIRECTORY_ENV]
    ?? DEFAULT_GALLERY_DATA_DIRECTORY
  const data = resolve(currentWorkingDirectory, configuredDirectory)

  return {
    data,
    originals: resolve(data, ORIGINALS_DIRECTORY_NAME),
    generated: resolve(data, GENERATED_DIRECTORY_NAME),
    index: resolve(data, GALLERY_INDEX_FILENAME)
  }
}
