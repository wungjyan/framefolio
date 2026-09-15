import {
  isObjectStorageConfigured,
  resolveEffectiveSource,
  resolveStorageConfig
} from '../../../../shared/node/storage-config'
import { writeStorageState } from '../../../../shared/node/storage-state'
import { parseStorageSource } from '../../../../shared/node/photo-url'
import type { AdminStorageSourceResponse } from '../../../../shared/types/admin'
import { getAdminContext } from '../../../utils/admin-context'
import { requireAdmin } from '../../../utils/admin-guard'

/**
 * Switch the active storage source.
 *
 * The choice is written to `data/.state/storage.json` rather than requiring an
 * environment change, so it takes effect immediately and survives a restart.
 *
 * Selecting `r2` without complete credentials is refused: accepting it would
 * silently serve local URLs, and the user would think CDN was active.
 */
export default defineEventHandler(async event => {
  requireAdmin(event)

  const { paths } = getAdminContext(event)
  const body: unknown = await readBody(event).catch(() => undefined)
  const requested =
    typeof body === 'object' && body !== null && 'source' in body
      ? (body as { source: unknown }).source
      : undefined

  if (requested !== 'local' && requested !== 'r2') {
    throw createError({
      statusCode: 400,
      statusMessage: 'The source must be "local" or "r2".'
    })
  }

  const storage = resolveStorageConfig()

  if (requested === 'r2' && !isObjectStorageConfigured(storage)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Object storage is not configured. Set the FRAMEFOLIO_S3_* variables first.'
    })
  }

  const state = await writeStorageState(paths.storageState, requested)

  const response: AdminStorageSourceResponse = {
    source: parseStorageSource(state.source),
    effectiveSource: resolveEffectiveSource({
      ...storage,
      source: parseStorageSource(state.source)
    }),
    configured: isObjectStorageConfigured(storage),
    ...(storage.publicBaseUrl ? { publicBaseUrl: storage.publicBaseUrl } : {}),
    updatedAt: state.updatedAt
  }

  return response
})
