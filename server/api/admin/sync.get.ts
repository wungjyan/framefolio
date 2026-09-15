import { getAdminContext } from '../../utils/admin-context'
import { requireAdmin } from '../../utils/admin-guard'
import { reconcileJobsLedger } from '../../../shared/node/jobs-ledger'
import type { AdminSyncStatusResponse } from '../../../shared/types/admin'

/**
 * Report sync progress and the last outcome.
 *
 * This is the endpoint the admin UI polls. Reconciliation runs here (and only
 * here) so a job whose process died is reported as failed instead of leaving
 * the UI waiting forever; plain reads stay side-effect free.
 */
export default defineEventHandler(async event => {
  requireAdmin(event)

  const { paths } = getAdminContext(event)
  const { ledger } = await reconcileJobsLedger(paths.jobs)
  const { current, last } = ledger

  const response: AdminSyncStatusResponse = {
    running: current?.status === 'running',
    ...(current
      ? {
          current: {
            id: current.id,
            startedAt: current.startedAt,
            trigger: current.trigger,
            ...(current.progress ? { progress: current.progress } : {})
          }
        }
      : {}),
    ...(last
      ? {
          last: {
            id: last.id,
            status: last.status === 'succeeded' ? 'succeeded' : 'failed',
            startedAt: last.startedAt,
            ...(last.finishedAt ? { finishedAt: last.finishedAt } : {}),
            ...(last.summary ? { summary: last.summary } : {}),
            ...(last.errors ? { errors: last.errors } : {}),
            ...(last.warnings ? { warnings: last.warnings } : {}),
            ...(last.message ? { message: last.message } : {})
          }
        }
      : {})
  }

  return response
})
