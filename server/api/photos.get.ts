import { join } from 'node:path'

import { GALLERY_INDEX_FILENAME } from '../../shared/constants/gallery'
import {
  GalleryIndexError,
  readPublicGalleryPhotos
} from '../utils/gallery-index'
import {
  resolveEffectiveSource,
  resolveStorageConfig
} from '../utils/storage-config'

/**
 * Public photo list.
 *
 * The URL source is resolved server-side from configuration, so switching
 * between local media and object storage needs no frontend change. A missing or
 * incompatible index is surfaced as a 500 rather than an empty list: an empty
 * gallery would look like "all photos were deleted".
 */
export default defineEventHandler(async event => {
  const config = useRuntimeConfig(event)
  const indexPath = join(config.galleryDataDir, GALLERY_INDEX_FILENAME)
  const storage = resolveStorageConfig()

  try {
    return await readPublicGalleryPhotos(indexPath, {
      source: resolveEffectiveSource(storage),
      publicBaseUrl: storage.publicBaseUrl,
      prefix: storage.prefix
    })
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
