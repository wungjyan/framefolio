import { getAdminContext } from '../../utils/admin-context'
import { requireAdmin } from '../../utils/admin-guard'
import {
  SyncAlreadyRunningError,
  runSyncJob
} from '../../../shared/node/sync-runner'
import type { AdminSyncStartResponse } from '../../../shared/types/admin'

/**
 * Start a gallery sync.
 *
 * The run happens in a child process so a native crash in libvips cannot take
 * the web server down. The request waits for completion because a typical
 * incremental run is fast (measured 0.08s when nothing changed); the UI shows
 * progress by polling `GET /api/admin/sync`, which works for long first imports.
 */
export default defineEventHandler(async event => {
  requireAdmin(event)

  const { paths, projectRoot } = getAdminContext(event)

  try {
    const { job, outcome } = await runSyncJob({ paths, projectRoot })

    const response: AdminSyncStartResponse & {
      status: string
      summary?: unknown
      errors?: unknown
    } = {
      started: true,
      jobId: job.id,
      status: job.status,
      ...(job.summary ? { summary: job.summary } : {}),
      ...(outcome && outcome.errors.length > 0
        ? { errors: outcome.errors }
        : {})
    }

    return response
  } catch (error: unknown) {
    if (error instanceof SyncAlreadyRunningError) {
      // 409 tells the UI "nothing is wrong, just wait"; the running job's
      // progress is available at GET /api/admin/sync.
      throw createError({
        statusCode: 409,
        statusMessage: error.message
      })
    }

    throw error
  }
})
