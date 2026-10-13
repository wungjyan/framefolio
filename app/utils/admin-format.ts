import type { MessageKey, MessageParams } from '../i18n/messages'

/**
 * Formatting helpers for the admin UI.
 *
 * Every function that produces words takes a `t` function rather than importing
 * the catalogue, so the locale stays owned by `useLocale` and these remain pure
 * and directly testable.
 */
export type Translate = (key: MessageKey, params?: MessageParams) => string

/** Human-readable byte size, e.g. `1.6 MB`. Units are locale-neutral. */
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

/**
 * Local date-time for timestamps, or `—` when absent/invalid.
 *
 * The Intl tag is passed explicitly instead of `undefined`. Previously these
 * formatters followed the browser while the surrounding text was hard-coded
 * Chinese, so an English browser produced an English date beside a Chinese
 * label; both now follow the selected language.
 */
export function formatDateTime(
  value: string | undefined,
  locale?: string
): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

/** Short relative age, e.g. `3 minutes ago` / `3 分钟前`. */
export function formatRelative(
  value: string | undefined,
  now: Date = new Date(),
  locale?: string
): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  const seconds = Math.round((now.getTime() - date.getTime()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

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
export function photoStateLabel(state: string, t: Translate): string {
  switch (state) {
    case 'added':
      return t('photos.state.added')
    case 'changed':
      return t('photos.state.changed')
    case 'pending-delete':
      return t('photos.state.pendingDelete')
    default:
      return t('photos.state.unchanged')
  }
}

/**
 * Label for a sync phase.
 *
 * The raw values are internal identifiers, so displaying them put English words
 * like "finalising" in an otherwise Chinese panel. Every known phase is mapped.
 */
export function syncPhaseLabel(
  phase: string | undefined,
  t: Translate
): string {
  switch (phase) {
    case 'scanning':
      return t('sync.phase.scanning')
    case 'processing':
      return t('sync.phase.processing')
    case 'finalising':
      return t('sync.phase.finalising')
    case 'done':
      return t('sync.phase.done')
    default:
      return t('sync.phase.unknown')
  }
}

/**
 * The progress line under the bar, e.g. `Processing · checked 12 / 16 originals`.
 *
 * The counter is spelled out on purpose. It counts every file in `originals/`,
 * not the number of pending changes, so deleting two photos out of sixteen still
 * advances to 16 / 16 — which reads as a bug unless the line says what is being
 * counted.
 */
export function syncProgressText(
  phase: string | undefined,
  completed: number,
  total: number,
  t: Translate
): string {
  return t('sync.progress', {
    phase: syncPhaseLabel(phase, t),
    completed,
    total
  })
}

/**
 * Confirmation shown after switching the storage source.
 *
 * Both directions need a page refresh for the same reason: the switch changes
 * what `GET /api/photos` returns, but the public gallery is an already-loaded
 * page that resolved its image URLs when it mounted. Only the r2 wording used to
 * mention this, which made an identical requirement look like an r2-only quirk.
 */
export function storageSourceSwitchMessage(
  source: 'local' | 'r2',
  t: Translate
): string {
  return source === 'r2'
    ? t('storage.switchedToRemote')
    : t('storage.switchedToLocal')
}
