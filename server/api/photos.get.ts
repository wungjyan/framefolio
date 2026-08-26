import { join } from 'node:path'

import { GALLERY_INDEX_FILENAME } from '../../shared/constants/gallery'
import {
  GalleryIndexError,
  readPublicGalleryPhotos
} from '../utils/gallery-index'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const indexPath = join(config.galleryDataDir, GALLERY_INDEX_FILENAME)

  try {
    return await readPublicGalleryPhotos(indexPath)
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
