import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  formatDateTime,
  formatRelative,
  photoStateLabel
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
