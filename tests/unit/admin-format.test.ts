import { describe, expect, it } from 'vitest'

import { translate } from '../../app/i18n/messages'
import type { GalleryLocale } from '../../app/utils/locale'
import {
  formatBytes,
  formatDateTime,
  formatRelative,
  photoStateLabel,
  storageSourceSwitchMessage,
  syncPhaseLabel,
  syncProgressText
} from '../../app/utils/admin-format'

/**
 * These helpers now take a `t` function instead of importing the catalogue, so
 * the locale stays owned by `useLocale`. Binding the real `translate` here keeps
 * the assertions on real messages while making the language explicit per call.
 */
function bind(locale: GalleryLocale) {
  return (
    key: Parameters<typeof translate>[1],
    params?: Record<string, string | number>
  ) => translate(locale, key, params)
}

const zh = bind('zh')
const en = bind('en')

describe('formatBytes', () => {
  it('shows small sizes in bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('scales to larger units', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
  })

  it('drops the decimal for values of 10 or more', () => {
    expect(formatBytes(15 * 1024)).toBe('15 KB')
    expect(formatBytes(1639983)).toBe('1.6 MB')
  })

  it('returns a dash for invalid input', () => {
    expect(formatBytes(Number.NaN)).toBe('—')
    expect(formatBytes(-1)).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('formats a valid timestamp', () => {
    expect(formatDateTime('2026-09-01T12:30:00.000Z')).not.toBe('—')
  })

  it('returns a dash for missing or invalid values', () => {
    expect(formatDateTime(undefined)).toBe('—')
    expect(formatDateTime('not a date')).toBe('—')
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-09-01T12:00:00.000Z')

  it('describes recent times in seconds', () => {
    expect(formatRelative('2026-09-01T11:59:30.000Z', now)).toMatch(/second|秒/)
  })

  it('describes minutes and hours', () => {
    expect(formatRelative('2026-09-01T11:30:00.000Z', now)).toMatch(
      /minute|分钟/
    )
    expect(formatRelative('2026-09-01T09:00:00.000Z', now)).toMatch(/hour|小时/)
  })

  it('falls back to days', () => {
    expect(formatRelative('2026-08-20T12:00:00.000Z', now)).toMatch(/day|天/)
  })

  it('returns a dash for missing or invalid values', () => {
    expect(formatRelative(undefined, now)).toBe('—')
    expect(formatRelative('nope', now)).toBe('—')
  })
})

describe('photoStateLabel', () => {
  it('labels each state', () => {
    expect(photoStateLabel('added', zh)).toBe('待新增')
    expect(photoStateLabel('changed', zh)).toBe('待更新')
    expect(photoStateLabel('pending-delete', zh)).toBe('待删除')
    expect(photoStateLabel('unchanged', zh)).toBe('已发布')
  })

  it('treats an unknown state as published', () => {
    expect(photoStateLabel('something-else', zh)).toBe('已发布')
  })

  it('labels each state in English', () => {
    expect(photoStateLabel('added', en)).toBe('To add')
    expect(photoStateLabel('changed', en)).toBe('To update')
    expect(photoStateLabel('pending-delete', en)).toBe('To delete')
    expect(photoStateLabel('unchanged', en)).toBe('Published')
  })
})

describe('syncPhaseLabel', () => {
  it('translates every phase the pipeline emits', () => {
    // The raw values are internal identifiers; showing them put English words
    // like "finalising" in an otherwise Chinese panel.
    expect(syncPhaseLabel('scanning', zh)).toBe('扫描原图')
    expect(syncPhaseLabel('processing', zh)).toBe('处理中')
    expect(syncPhaseLabel('finalising', zh)).toBe('收尾中')
    expect(syncPhaseLabel('done', zh)).toBe('已完成')
  })

  it('has no leftover English for an unknown or missing phase', () => {
    expect(syncPhaseLabel(undefined, zh)).toBe('同步中')
    expect(syncPhaseLabel('something-new', zh)).toBe('同步中')
  })

  it('translates every phase in English', () => {
    expect(syncPhaseLabel('scanning', en)).toBe('Scanning originals')
    expect(syncPhaseLabel('processing', en)).toBe('Processing')
    expect(syncPhaseLabel('finalising', en)).toBe('Finishing')
    expect(syncPhaseLabel('done', en)).toBe('Done')
  })
})

describe('syncProgressText', () => {
  it('says what the counter counts', () => {
    // Deleting 2 of 16 photos still advances to 16 / 16, because every file in
    // originals/ is checked. Without the label that reads as a bug.
    expect(syncProgressText('processing', 12, 16, zh)).toBe(
      '处理中 · 已检查原图 12 / 16'
    )
  })

  it('labels the finalising phase', () => {
    expect(syncProgressText('finalising', 16, 16, zh)).toBe(
      '收尾中 · 已检查原图 16 / 16'
    )
  })

  it('never shows a bare fraction', () => {
    const text = syncProgressText('processing', 0, 16, zh)

    expect(text).toContain('已检查原图')
    expect(text).not.toMatch(/^\d+\s*\/\s*\d+$/)
  })

  it('never leaks the internal phase identifier in English either', () => {
    const text = syncProgressText('finalising', 16, 16, en)

    expect(text).toBe('Finishing · checked 16 / 16 originals')
    expect(text).not.toContain('finalising')
  })
})

describe('storageSourceSwitchMessage', () => {
  it('tells the user to refresh after switching to r2', () => {
    const message = storageSourceSwitchMessage('r2', zh)

    expect(message).toContain('对象存储')
    expect(message).toContain('刷新首页')
  })

  it('tells the user to refresh after switching to local too', () => {
    // Switching in either direction changes what /api/photos returns, but the
    // gallery already resolved its URLs on mount. Mentioning the refresh only
    // for r2 made an identical requirement look like an r2-only quirk.
    const message = storageSourceSwitchMessage('local', zh)

    expect(message).toContain('本地')
    expect(message).toContain('刷新首页')
  })

  it('uses the same sentence structure for both directions', () => {
    // Whitespace before Latin text is correct typography ("走 CDN") and wrong
    // before Chinese ("走本地"), so the invariant is the same *shape*, not the
    // same whitespace.
    const shape = /^访问源已切换为.+。刷新首页即可看到图片走\s*.+。$/

    expect(storageSourceSwitchMessage('r2', zh)).toMatch(shape)
    expect(storageSourceSwitchMessage('local', zh)).toMatch(shape)
  })

  it('keeps both directions distinct and refresh-aware in English', () => {
    const remote = storageSourceSwitchMessage('r2', en)
    const local = storageSourceSwitchMessage('local', en)

    expect(remote).toContain('object storage')
    expect(remote).toContain('Refresh the home page')
    expect(local).toContain('local')
    expect(local).toContain('Refresh the home page')
    expect(remote).not.toBe(local)
  })
})
