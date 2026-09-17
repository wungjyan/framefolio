import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  formatDateTime,
  formatRelative,
  photoStateLabel,
  syncPhaseLabel,
  syncProgressText
} from '../../app/utils/admin-format'

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
    expect(photoStateLabel('added')).toBe('待新增')
    expect(photoStateLabel('changed')).toBe('待更新')
    expect(photoStateLabel('pending-delete')).toBe('待删除')
    expect(photoStateLabel('unchanged')).toBe('已发布')
  })

  it('treats an unknown state as published', () => {
    expect(photoStateLabel('something-else')).toBe('已发布')
  })
})

describe('syncPhaseLabel', () => {
  it('translates every phase the pipeline emits', () => {
    // The raw values are internal identifiers; showing them put English words
    // like "finalising" in an otherwise Chinese panel.
    expect(syncPhaseLabel('scanning')).toBe('扫描原图')
    expect(syncPhaseLabel('processing')).toBe('处理中')
    expect(syncPhaseLabel('finalising')).toBe('收尾中')
    expect(syncPhaseLabel('done')).toBe('已完成')
  })

  it('has no leftover English for an unknown or missing phase', () => {
    expect(syncPhaseLabel(undefined)).toBe('同步中')
    expect(syncPhaseLabel('something-new')).toBe('同步中')
  })
})

describe('syncProgressText', () => {
  it('says what the counter counts', () => {
    // Deleting 2 of 16 photos still advances to 16 / 16, because every file in
    // originals/ is checked. Without the label that reads as a bug.
    expect(syncProgressText('processing', 12, 16)).toBe(
      '处理中 · 已检查原图 12 / 16'
    )
  })

  it('labels the finalising phase', () => {
    expect(syncProgressText('finalising', 16, 16)).toBe(
      '收尾中 · 已检查原图 16 / 16'
    )
  })

  it('never shows a bare fraction', () => {
    const text = syncProgressText('processing', 0, 16)

    expect(text).toContain('已检查原图')
    expect(text).not.toMatch(/^\d+\s*\/\s*\d+$/)
  })
})
