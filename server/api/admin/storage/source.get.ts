import {
  isObjectStorageConfigured,
  resolveEffectiveSource,
  resolveStorageConfig
} from '../../../../shared/node/storage-config'
import { readStorageState } from '../../../../shared/node/storage-state'
import type { AdminStorageSourceResponse } from '../../../../shared/types/admin'
import { getAdminContext } from '../../../utils/admin-context'
import { requireAdmin } from '../../../utils/admin-guard'

/**
 * Read the active storage source.
 *
 * Reported separately from the full status so the UI can render the switch
 * without waiting for (or requiring) a live object-storage connection.
 */
export default defineEventHandler(async event => {
  requireAdmin(event)

  const { paths } = getAdminContext(event)
  const storage = resolveStorageConfig()
  const persisted = await readStorageState(paths.storageState)
  const source = persisted?.source ?? storage.source

  const response: AdminStorageSourceResponse = {
    source,
    effectiveSource: resolveEffectiveSource({ ...storage, source }),
    configured: isObjectStorageConfigured(storage),
    ...(storage.publicBaseUrl ? { publicBaseUrl: storage.publicBaseUrl } : {}),
    ...(persisted ? { updatedAt: persisted.updatedAt } : {})
  }

  return response
})
