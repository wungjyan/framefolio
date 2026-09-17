/** Formatting helpers for the admin UI. */

/** Human-readable byte size, e.g. `1.6 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—'
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`
}

/** Local date-time for timestamps, or `—` when absent/invalid. */
export function formatDateTime(value: string | undefined): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

/** Short relative age, e.g. `3 分钟前`. */
export function formatRelative(
  value: string | undefined,
  now: Date = new Date()
): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  const seconds = Math.round((now.getTime() - date.getTime()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

  if (Math.abs(seconds) < 60) {
    return formatter.format(-seconds, 'second')
  }

  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) {
    return formatter.format(-minutes, 'minute')
  }

  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) {
    return formatter.format(-hours, 'hour')
  }

  return formatter.format(-Math.round(hours / 24), 'day')
}

/** Display label for a photo state badge. */
export function photoStateLabel(state: string): string {
  switch (state) {
    case 'added':
      return '待新增'
    case 'changed':
      return '待更新'
    case 'pending-delete':
      return '待删除'
    default:
      return '已发布'
  }
}

/**
 * Chinese label for a sync phase.
 *
 * The raw values are internal identifiers, so displaying them put English words
 * like "finalising" in an otherwise Chinese panel.
 */
export function syncPhaseLabel(phase: string | undefined): string {
  switch (phase) {
    case 'scanning':
      return '扫描原图'
    case 'processing':
      return '处理中'
    case 'finalising':
      return '收尾中'
    case 'done':
      return '已完成'
    default:
      return '同步中'
  }
}

/**
 * The progress line under the bar, e.g. `处理中 · 已检查原图 12 / 16`.
 *
 * The counter is spelled out on purpose. It counts every file in `originals/`,
 * not the number of pending changes, so deleting two photos out of sixteen still
 * advances to 16 / 16 — which reads as a bug unless the line says what is being
 * counted.
 */
export function syncProgressText(
  phase: string | undefined,
  completed: number,
  total: number
): string {
  return `${syncPhaseLabel(phase)} · 已检查原图 ${completed} / ${total}`
}

/**
 * Confirmation shown after switching the storage source.
 *
 * Both directions need a page refresh for the same reason: the switch changes
 * what `GET /api/photos` returns, but the public gallery is an already-loaded
 * page that resolved its image URLs when it mounted. Only the r2 wording used to
 * mention this, which made an identical requirement look like an r2-only quirk.
 */
export function storageSourceSwitchMessage(source: 'local' | 'r2'): string {
  return source === 'r2'
    ? '访问源已切换为对象存储。刷新首页即可看到图片走 CDN。'
    : '访问源已切换为本地。刷新首页即可看到图片走本地。'
}
