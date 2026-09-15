import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { AdminDeleteResponse } from '../../../../shared/types/admin'
import { getAdminContext } from '../../../utils/admin-context'
import { requireAdmin } from '../../../utils/admin-guard'
import { resolveOriginalPath } from '../../../utils/admin-gallery'
import { sanitizeUploadFilename } from '../../../utils/admin-upload'

/**
 * Soft-delete one original photo.
 *
 * The file moves to `data/.trash/` instead of being unlinked, so a mis-click is
 * recoverable by moving it back. Only the next sync removes it from the public
 * gallery — this is why the response sets `requiresSync`, which the UI surfaces
 * so the user knows the photo is still visible on the site.
 */
export default defineEventHandler(async event => {
  requireAdmin(event)

  const { paths } = getAdminContext(event)
  const rawName = getRouterParam(event, 'filename')
  const filename = rawName
    ? sanitizeUploadFilename(decodeURIComponent(rawName))
    : undefined

  if (!filename) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filename.' })
  }

  const sourcePath = resolveOriginalPath(paths.originals, filename)

  if (!sourcePath) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filename.' })
  }

  // Mirror the nested layout inside .trash/ so two files with the same basename
  // in different folders do not collide.
  const trashPath = join(paths.trash, filename)

  await mkdir(dirname(trashPath), { recursive: true })

  try {
    await rename(sourcePath, trashPath)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found.' })
    }

    // A cross-device move cannot use rename; fall back to copy semantics only
    // when the trash directory lives on another filesystem.
    if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
      throw createError({
        statusCode: 500,
        statusMessage:
          'The trash directory is on a different filesystem; move it next to originals.'
      })
    }

    throw error
  }

  // Remove any leftover staging file for this name so a failed earlier upload
  // cannot resurface later.
  await rm(join(paths.incoming, filename), { force: true }).catch(() => {})

  const response: AdminDeleteResponse = {
    filename,
    trashPath: `.trash/${filename}`,
    requiresSync: true
  }

  return response
})
