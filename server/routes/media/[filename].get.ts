import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import { GENERATED_DIRECTORY_NAME } from '../../../shared/constants/gallery'
import {
  GENERATED_IMAGE_CACHE_CONTROL,
  GENERATED_IMAGE_CONTENT_TYPE,
  resolveGeneratedImagePath
} from '../../utils/gallery-media'

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename')
  const config = useRuntimeConfig(event)
  const generatedDirectory = join(config.galleryDataDir, GENERATED_DIRECTORY_NAME)
  const filePath = filename
    ? resolveGeneratedImagePath(generatedDirectory, filename)
    : undefined

  if (!filePath) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found.' })
  }

  let fileSize: number

  try {
    const file = await stat(filePath)

    if (!file.isFile()) {
      throw createError({ statusCode: 404, statusMessage: 'Image not found.' })
    }

    fileSize = file.size
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ENOENT')) {
      throw createError({ statusCode: 404, statusMessage: 'Image not found.' })
    }

    throw error
  }

  setResponseHeaders(event, {
    'cache-control': GENERATED_IMAGE_CACHE_CONTROL,
    'content-length': fileSize,
    'content-type': GENERATED_IMAGE_CONTENT_TYPE,
    'x-content-type-options': 'nosniff'
  })

  return sendStream(event, createReadStream(filePath))
})

function isErrorWithCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}
