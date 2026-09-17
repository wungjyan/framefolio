import {
  resolveActiveSource,
  resolveStorageConfig,
  toObjectStorageConfig,
  isObjectStorageConfigured
} from '../../../shared/node/storage-config'
import { readStorageState } from '../../../shared/node/storage-state'
import { inspectObjectStorage } from '../../../shared/node/remote-publisher'
import { summarizeStorageIntegrity } from '../../../shared/node/storage-integrity'
import type { AdminStorageStatusResponse } from '../../../shared/types/admin'
import { getAdminContext } from '../../utils/admin-context'
import { requireAdmin } from '../../utils/admin-guard'
import { readGalleryIndexTolerant } from '../../utils/gallery-index'

/**
 * Report the active storage source and how complete the object storage copy is.
 *
 * The integrity comparison is what makes switching sources safe: it counts the
 * derivatives the index references against the objects actually present, so the
 * user can see whether every photo is available from the source they are about
 * to select.
 */
export default defineEventHandler(async event => {
  requireAdmin(event)

  const { paths } = getAdminContext(event)
  const storage = resolveStorageConfig()

  // The runtime choice written by the admin UI takes precedence over the
  // environment variable, exactly as the public photo API does. Reporting
  // `storage.source` here instead made this endpoint disagree with
  // GET /api/admin/storage/source, so after switching to object storage the UI
  // showed the radio on "r2" while the caption below it described local mode.
  const persisted = await readStorageState(paths.storageState)
  const active = resolveActiveSource({
    storage,
    ...(persisted ? { persisted: persisted.source } : {})
  })

  const objectConfig = toObjectStorageConfig(storage)
  // Tolerant: an unreadable index still lets the page render.
  const { index } = await readGalleryIndexTolerant(paths.index)

  const base: AdminStorageStatusResponse = {
    source: active.requested,
    effectiveSource: active.effective,
    configured: isObjectStorageConfigured(storage),
    publicBaseUrl: storage.publicBaseUrl,
    prefix: storage.prefix,
    totalPhotos: index.photos.length,
    photosWithRemote: 0,
    expectedObjects: index.photos.length * 2
  }

  if (!objectConfig) {
    // Not configured: report local-only rather than erroring, because the admin
    // page must still render for a local deployment. Nothing can be in a bucket
    // that does not exist, so reporting zero available photos is the honest
    // answer rather than echoing the index's claim that it uploaded them.
    return {
      ...base,
      connected: false,
      message: '对象存储未配置，当前仅使用本地存储。'
    } satisfies AdminStorageStatusResponse
  }

  const report = await inspectObjectStorage(objectConfig)

  if (!report.connected) {
    // The listing failed, so nothing about the bucket's contents is known. The
    // counts are omitted rather than reported as zero, because "0 available,
    // 46 missing" would be a fresh false claim of exactly the kind this
    // endpoint already suffered from. The UI shows the connection error.
    return {
      ...base,
      connected: false,
      ...(report.message ? { message: report.message } : {})
    } satisfies AdminStorageStatusResponse
  }

  // One call produces every count, from one source of truth (the bucket). This
  // is what stops the panel contradicting itself: previously "uploaded" came
  // from the index's own record while "completeness" came from a real listing,
  // so an emptied bucket still read "uploaded 23 / 23 ... completeness 0%".
  const integrity = summarizeStorageIntegrity({
    photos: index.photos,
    storedKeys: report.objects.map(object => object.key)
  })

  return {
    ...base,
    ...integrity,
    connected: true
  } satisfies AdminStorageStatusResponse
})
