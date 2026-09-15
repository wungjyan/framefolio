import { getAdminContext } from '../../utils/admin-context'
import { requireAdmin } from '../../utils/admin-guard'
import { readGalleryIndex } from '../../utils/gallery-index'
import {
  buildAdminPhotos,
  scanOriginalFiles,
  summarizePending
} from '../../utils/admin-gallery'
import type { AdminPhotosResponse } from '../../../shared/types/admin'

/**
 * List every photo the admin area knows about, with the pending-change summary.
 *
 * "Pending" means: what would change if the user pressed Sync now. It is derived
 * by comparing `originals/` against the published index — not by consulting a
 * queue — because nothing is queued: uploads and deletions only touch
 * `originals/`.
 */
export default defineEventHandler(async event => {
  requireAdmin(event)

  const { paths } = getAdminContext(event)

  // A missing index is an empty gallery; an incompatible one throws, which is
  // correct here: the admin must know the index needs a sync.
  const index = await readGalleryIndex(paths.index)
  const originals = await scanOriginalFiles(paths.originals)
  const photos = buildAdminPhotos(index, originals)

  const response: AdminPhotosResponse = {
    photos,
    pending: summarizePending(photos)
  }

  return response
})
