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

    // Enforce the pixel limit before publishing. Without this, a file small
    // enough to pass the byte check can still be enormous in pixels: a 100 MB
    // highly compressed image can decode to far more memory than the server
    // has, and the sync that follows would be killed by the OOM killer.
    //
    // Dimensions come from the header, not from decoding, so this costs nothing
    // and cannot itself be the thing that exhausts memory.
    const dimensions = validation.dimensions

    if (!dimensions) {
      // Treat "cannot measure" as a rejection. Assuming no limit here would let
      // a crafted header slip past the check entirely.
      throw createError({
        statusCode: 415,
        statusMessage: 'Could not read the image dimensions.'
      })
    }

    const pixels = dimensions.width * dimensions.height

    if (pixels > config.maxUploadPixels) {
      throw createError({
        statusCode: 413,
        statusMessage:
          `Image is ${dimensions.width}x${dimensions.height} ` +
          `(${formatMegapixels(pixels)}), which exceeds the ` +
          `${formatMegapixels(config.maxUploadPixels)} limit.`
      })
    }

    // Overwrite semantics: uploading the same name replaces the original, which
    // the next sync detects as `changed` via size/mtime.
    await rename(stagingPath, targetPath)

    const response: AdminUploadResponse = {
      filename,
      bytes: received,
      format: validation.format,
      width: dimensions.width,
      height: dimensions.height
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

/**
 * Render a pixel count for a message a human can act on.
 *
 * Small values keep a decimal (0.1 MP), but anything under 0.05 MP would round
 * to "0.0", which reads like a bug rather than a limit, so those are shown as a
 * plain pixel count instead.
 */
function formatMegapixels(pixels: number): string {
  const megapixels = pixels / 1_000_000

  if (megapixels < 0.05) {
    return `${Math.round(pixels)} pixels`
  }

  return megapixels >= 10
    ? `${Math.round(megapixels)} MP`
    : `${megapixels.toFixed(1)} MP`
}
