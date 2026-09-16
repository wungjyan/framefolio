import { join } from 'node:path'

import { GALLERY_INDEX_FILENAME } from '../../shared/constants/gallery'
import { resolveGalleryPaths } from '../../shared/node/gallery-paths'
import {
  resolveActiveSource,
  resolveStorageConfig
} from '../../shared/node/storage-config'
import { readStorageState } from '../../shared/node/storage-state'
import {
  GalleryIndexError,
  readPublicGalleryPhotos
} from '../utils/gallery-index'

/**
 * Public photo list.
 *
 * The URL source is resolved server-side, so switching between local media and
 * object storage needs no frontend change. A runtime selection written by the
 * admin UI takes precedence over the environment, so switching takes effect on
 * the next request without a container restart.
 *
 * A missing or incompatible index is surfaced as a 500 rather than an empty
 * list: an empty gallery would look like "all photos were deleted".
 */
export default defineEventHandler(async event => {
  const config = useRuntimeConfig(event)
  const paths = resolveGalleryPaths({ dataDirectory: config.galleryDataDir })
  const storage = resolveStorageConfig()

  // An explicit choice in the admin UI wins over the environment default.
  const persisted = await readStorageState(paths.storageState)
  const { effective } = resolveActiveSource({
    storage,
    ...(persisted ? { persisted: persisted.source } : {})
  })

  try {
    return await readPublicGalleryPhotos(
      join(paths.data, GALLERY_INDEX_FILENAME),
      {
        source: effective,
        publicBaseUrl: storage.publicBaseUrl,
        prefix: storage.prefix
      }
    )
  } catch (error: unknown) {
    if (error instanceof GalleryIndexError) {
      console.error(error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Gallery index is unavailable.'
      })
    }

    throw error
  }
})
