// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AdminSyncPanel from '../../app/components/admin/AdminSyncPanel.vue'
import type { AdminSyncStatusResponse } from '../../shared/types/admin'

/**
 * The line beside the sync button.
 *
 * It used to read "网站已是最新" whenever the pending count was zero, which
 * produced two misleading states: a fresh page load announced it before reading
 * anything, and a running sync showed it next to a live progress bar, directly
 * contradicting the button reading "同步中…".
 */

const runningStatus: AdminSyncStatusResponse = {
  running: true,
  current: {
    id: 'job-1',
    startedAt: '2026-09-17T06:00:00.000Z',
    trigger: 'admin',
    progress: { phase: 'processing', completed: 10, total: 23 }
  }
}

function mountPanel(props: {
  status?: AdminSyncStatusResponse
  pendingTotal?: number
  busy?: boolean
}) {
  return mount(AdminSyncPanel, {
    props: {
      status: props.status,
      pendingTotal: props.pendingTotal,
      busy: props.busy ?? false
    }
  })
}

describe('AdminSyncPanel pending label', () => {
  it('does not claim anything before the counts are known', () => {
    const text = mountPanel({ pendingTotal: undefined }).text()

    expect(text).toContain('正在读取本地变更')
    expect(text).not.toContain('无待同步变更')
  })

  it('reports the pending count', () => {
    expect(mountPanel({ pendingTotal: 3 }).text()).toContain('待同步 3 项')
  })

  it('says the local change set is empty when it is genuinely zero', () => {
    const text = mountPanel({ pendingTotal: 0 }).text()

    expect(text).toContain('本地无待同步变更')
    // The old wording claimed the whole site was current, which this check
    // cannot know: it never contacts object storage.
    expect(text).not.toContain('网站已是最新')
  })

  it('shows no pending line while a sync is running', () => {
    // "本地无待同步变更" beside a running progress bar is a contradiction, and
    // the count is stale mid-run anyway.
    const text = mountPanel({ status: runningStatus, pendingTotal: 0 }).text()

    expect(text).toContain('同步中…')
    expect(text).not.toContain('无待同步变更')
    expect(text).not.toContain('待同步 0 项')
  })

  it('hides a stale pending count while a sync is running', () => {
    const text = mountPanel({ status: runningStatus, pendingTotal: 3 }).text()

    expect(text).not.toContain('待同步 3 项')
  })

  it('shows the live progress instead', () => {
    const text = mountPanel({ status: runningStatus, pendingTotal: 0 }).text()

    expect(text).toContain('10')
    expect(text).toContain('23')
  })

  it('says what the progress counter counts, in Chinese', () => {
    // The counter tracks every file in originals/, not the pending changes, so
    // deleting 2 of 16 photos still advances to 16 / 16. It must also not render
    // the internal English phase name.
    const text = mountPanel({ status: runningStatus, pendingTotal: 0 }).text()

    expect(text).toContain('处理中 · 已检查原图 10 / 23')
    expect(text).not.toContain('processing')
    expect(text).not.toContain('finalising')
  })

  it('labels the finalising phase', () => {
    const text = mountPanel({
      status: {
        ...runningStatus,
        current: {
          ...runningStatus.current!,
          progress: { phase: 'finalising', completed: 16, total: 16 }
        }
      },
      pendingTotal: 0
    }).text()

    expect(text).toContain('收尾中 · 已检查原图 16 / 16')
  })

  it('falls back to a plain label when progress is absent', () => {
    const text = mountPanel({
      status: {
        running: true,
        current: { id: 'j', startedAt: '', trigger: 'admin' }
      },
      pendingTotal: 0
    }).text()

    expect(text).toContain('同步中')
    // No stray fraction or English identifier.
    expect(text).not.toContain('running')
    expect(text).not.toContain('/')
  })

  it('disables the button while a sync is running', () => {
    const button = mountPanel({
      status: runningStatus,
      pendingTotal: 0
    }).find('button')

    expect(button.attributes('disabled')).toBeDefined()
    expect(button.text()).toContain('同步中…')
  })
})
