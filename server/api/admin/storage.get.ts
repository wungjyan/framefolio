import {
  resolveActiveSource,
  resolveStorageConfig,
  toObjectStorageConfig,
  isObjectStorageConfigured
} from '../../../shared/node/storage-config'
import { readStorageState } from '../../../shared/node/storage-state'
import { inspectObjectStorage } from '../../../shared/node/remote-publisher'
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

  // Every derivative the index currently references.
  const expectedKeys = index.photos.flatMap(photo => [
    photo.storage.thumbnail,
    photo.storage.preview
  ])

  const photosWithRemote = index.photos.filter(
    photo => photo.remote?.revision === photo.source.revision
  ).length

  const base: AdminStorageStatusResponse = {
    source: active.requested,
    effectiveSource: active.effective,
    configured: isObjectStorageConfigured(storage),
    publicBaseUrl: storage.publicBaseUrl,
    prefix: storage.prefix,
    totalPhotos: index.photos.length,
    photosWithRemote,
    expectedObjects: expectedKeys.length
  }

  if (!objectConfig) {
    // Not configured: report local-only rather than erroring, because the admin
    // page must still render for a local deployment.
    return {
      ...base,
      connected: false,
      message: '对象存储未配置，当前仅使用本地存储。'
    } satisfies AdminStorageStatusResponse
  }

  const report = await inspectObjectStorage(objectConfig)
  const storedKeys = new Set(report.objects.map(object => object.key))
  const missing = expectedKeys.filter(key => !storedKeys.has(key))
  const expectedSet = new Set(expectedKeys)
  const orphaned = report.objects
    .map(object => object.key)
    .filter(key => !expectedSet.has(key))

  return {
    ...base,
    connected: report.connected,
    ...(report.message ? { message: report.message } : {}),
    storedObjects: report.objects.length,
    missingObjects: missing.length,
    orphanedObjects: orphaned.length
  } satisfies AdminStorageStatusResponse
})
