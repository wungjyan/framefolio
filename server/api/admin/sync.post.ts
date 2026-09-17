import { getAdminContext } from '../../utils/admin-context'
import { requireAdmin } from '../../utils/admin-guard'
import {
  SyncAlreadyRunningError,
  startSyncJob
} from '../../../shared/node/sync-runner'
import type { AdminSyncStartResponse } from '../../../shared/types/admin'

/**
 * Start a gallery sync and return immediately.
 *
 * The handler deliberately does not wait for the run. Holding the request open
 * until the last photo is processed is what produced spurious 504s: a first
 * import of 24 photos takes about 28s on an M4 and longer on NAS hardware, and
 * both nginx (`proxy_read_timeout`) and frp (`vhost_http_timeout`) default to a
 * 60s wait, after which the proxy answers 504 even though the sync goes on to
 * finish successfully.
 *
 * The run happens in a child process so a native crash in libvips cannot take
 * the web server down. Progress and the final outcome are read from the jobs
 * ledger by `GET /api/admin/sync`, which the UI already polls; the response here
 * only confirms that the run started.
 */
export default defineEventHandler(async event => {
  requireAdmin(event)

  const { paths, projectRoot } = getAdminContext(event)

  try {
    const { job, completion } = await startSyncJob({ paths, projectRoot })

    // The request returns before the run ends, so nothing awaits `completion`.
    // It never rejects (failures are recorded in the ledger), but attaching a
    // no-op catch is a deliberate guard: an unhandled rejection here would
    // terminate the server, and a future edit must not be able to reintroduce
    // that by changing the runner.
    void completion.catch(() => {})

    const response: AdminSyncStartResponse = {
      started: true,
      jobId: job.id,
      status: 'running'
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
