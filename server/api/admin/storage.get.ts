import {
  resolveEffectiveSource,
  resolveStorageConfig,
  toObjectStorageConfig,
  isObjectStorageConfigured
} from '../../../shared/node/storage-config'
import { inspectObjectStorage } from '../../../shared/node/remote-publisher'
import type { AdminStorageStatusResponse } from '../../../shared/types/admin'
import { getAdminContext } from '../../utils/admin-context'
import { requireAdmin } from '../../utils/admin-guard'
import { readGalleryIndex } from '../../utils/gallery-index'

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
  const objectConfig = toObjectStorageConfig(storage)
  const index = await readGalleryIndex(paths.index)

  // Every derivative the index currently references.
  const expectedKeys = index.photos.flatMap(photo => [
    photo.storage.thumbnail,
    photo.storage.preview
  ])

  const photosWithRemote = index.photos.filter(
    photo => photo.remote?.revision === photo.source.revision
  ).length

  const base: AdminStorageStatusResponse = {
    source: storage.source,
    effectiveSource: resolveEffectiveSource(storage),
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
