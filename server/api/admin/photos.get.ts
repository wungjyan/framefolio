import { getAdminContext } from '../../utils/admin-context'
import { requireAdmin } from '../../utils/admin-guard'
import { readGalleryIndexTolerant } from '../../utils/gallery-index'
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

  // Tolerant on purpose: after upgrading from an older schema the index cannot
  // be read, and the admin area must still work so the user can press Sync.
  // Every original then reports as "added", which is accurate.
  const { index, compatible, reason } = await readGalleryIndexTolerant(
    paths.index
  )
  const originals = await scanOriginalFiles(paths.originals)
  const photos = buildAdminPhotos(index, originals)

  const response: AdminPhotosResponse = {
    photos,
    pending: summarizePending(photos),
    ...(compatible
      ? {}
      : {
          indexIncompatible: true,
          indexMessage:
            reason ?? 'The photo index needs to be rebuilt. Press Sync now.'
        })
  }

  return response
})
