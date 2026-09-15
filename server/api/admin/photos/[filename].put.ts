import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'

import type { AdminUploadResponse } from '../../../../shared/types/admin'
import { getAdminContext } from '../../../utils/admin-context'
import { requireAdmin } from '../../../utils/admin-guard'
import { resolveOriginalPath } from '../../../utils/admin-gallery'
import {
  sanitizeUploadFilename,
  validateUploadedImage
} from '../../../utils/admin-upload'

/**
 * Upload one original photo.
 *
 * A single streaming `PUT` is used rather than multipart form data: h3's
 * `readMultipartFormData` buffers the entire request in memory, so a 40MP RAW
 * would be held twice (request buffer plus processing buffer). Streaming into
 * `incoming/` keeps memory flat regardless of file size.
 *
 * The file is validated *after* landing in `incoming/` and only then moved into
 * `originals/`, so a partial or hostile upload never becomes visible to the
 * scanner.
 */
export default defineEventHandler(async event => {
  requireAdmin(event)

  const { paths, config } = getAdminContext(event)
  const rawName = getRouterParam(event, 'filename')
  const filename = rawName
    ? sanitizeUploadFilename(decodeURIComponent(rawName))
    : undefined

  if (!filename) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filename.' })
  }

  const targetPath = resolveOriginalPath(paths.originals, filename)

  if (!targetPath) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filename.' })
  }

  await mkdir(paths.incoming, { recursive: true })

  const stagingPath = join(paths.incoming, `${randomUUID()}.part`)

  try {
    const stream = getRequestWebStream(event)

    if (!stream) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing request body.'
      })
    }

    await writeStreamWithLimit(stream, stagingPath, config.maxUploadBytes)

    const received = (await stat(stagingPath)).size

    if (received === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Empty upload.' })
    }

    const validation = await validateUploadedImage(stagingPath, filename)

    if (!validation.ok) {
      throw createError({
        statusCode: 415,
        statusMessage: validation.reason ?? 'Unsupported image.'
      })
    }

    // Overwrite semantics: uploading the same name replaces the original, which
    // the next sync detects as `changed` via size/mtime.
    await rename(stagingPath, targetPath)

    const response: AdminUploadResponse = {
      filename,
      bytes: received,
      format: validation.format
    }

    return response
  } catch (error: unknown) {
    await rm(stagingPath, { force: true })
    throw error
  }
})

/**
 * Pipe a web stream to disk, aborting once the byte limit is exceeded.
 *
 * The limit is enforced while streaming so an oversized upload is rejected
 * before it can fill the disk; `Content-Length` alone is not trusted because a
 * client can omit or lie about it.
 */
async function writeStreamWithLimit(
  stream: ReadableStream<Uint8Array>,
  destination: string,
  maxBytes: number
): Promise<void> {
  const fileStream = createWriteStream(destination)
  let total = 0

  const reader = stream.getReader()

  try {
    await pipeline(async function* () {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          return
        }

        total += value.byteLength

        if (total > maxBytes) {
          throw createError({
            statusCode: 413,
            statusMessage: `Upload exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB limit.`
          })
        }

        yield value
      }
    }, fileStream)
  } catch (error: unknown) {
    reader.cancel().catch(() => {})
    throw error
  }
}
