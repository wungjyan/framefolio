import { describe, expect, it } from 'vitest'

import {
  readStoredGalleryTheme,
  writeStoredGalleryTheme
} from '../../app/composables/useTheme'
import {
  normalizeGalleryTheme,
  resolveGalleryTheme
} from '../../app/utils/theme'

describe('normalizeGalleryTheme', () => {
  it('accepts both themes', () => {
    expect(normalizeGalleryTheme('dark')).toBe('dark')
    expect(normalizeGalleryTheme('light')).toBe('light')
  })

  it('rejects unknown, empty and missing values', () => {
    expect(normalizeGalleryTheme('blue')).toBeNull()
    expect(normalizeGalleryTheme('')).toBeNull()
    expect(normalizeGalleryTheme(null)).toBeNull()
    expect(normalizeGalleryTheme(undefined)).toBeNull()
  })
})

describe('resolveGalleryTheme', () => {
  it('prefers the stored choice over the system preference', () => {
    expect(resolveGalleryTheme('dark', false)).toBe('dark')
    expect(resolveGalleryTheme('light', true)).toBe('light')
  })

  it('falls back to the system preference without a stored choice', () => {
    expect(resolveGalleryTheme(null, true)).toBe('dark')
    expect(resolveGalleryTheme(null, false)).toBe('light')
  })
})

describe('readStoredGalleryTheme', () => {
  it('reads a valid stored theme', () => {
    expect(readStoredGalleryTheme(createStorage('dark'))).toBe('dark')
    expect(readStoredGalleryTheme(createStorage('light'))).toBe('light')
  })

  it('returns null for invalid or missing stored values', () => {
    expect(readStoredGalleryTheme(createStorage('blue'))).toBeNull()
    expect(readStoredGalleryTheme(createStorage(null))).toBeNull()
    expect(readStoredGalleryTheme()).toBeNull()
  })

  it('returns null when storage access throws', () => {
    expect(readStoredGalleryTheme(createThrowingStorage())).toBeNull()
  })
})

describe('writeStoredGalleryTheme', () => {
  it('writes the theme to storage', () => {
    const storage = createStorage(null)
    writeStoredGalleryTheme(storage, 'dark')
    expect(storage.getItem('framefolio:gallery-theme')).toBe('dark')
  })

  it('does not throw when storage is unavailable or blocked', () => {
    expect(() => writeStoredGalleryTheme(undefined, 'light')).not.toThrow()
    expect(() => writeStoredGalleryTheme(createThrowingStorage(), 'light')).not.toThrow()
  })
})

function createStorage(value: string | null): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>()

  if (value !== null) {
    items.set('framefolio:gallery-theme', value)
  }

  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, item: string) => {
      items.set(key, item)
    }
  }
}

function createThrowingStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  return {
    getItem: () => {
      throw new Error('storage blocked')
    },
    setItem: () => {
      throw new Error('storage blocked')
    }
  }
}
