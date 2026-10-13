import { describe, expect, it } from 'vitest'

import {
  DEFAULT_GALLERY_LOCALE,
  GALLERY_LOCALE_STORAGE_KEY,
  htmlLang,
  intlLocale,
  normalizeGalleryLocale,
  otherGalleryLocale,
  resolveGalleryLocale
} from '../../app/utils/locale'

/**
 * Locale resolution.
 *
 * Pure logic, mirroring `theme.test.ts`: the composable that calls it is covered
 * by the component tests, and the browser behaviour by the manual probe.
 */

describe('normalizeGalleryLocale', () => {
  it('accepts the two supported locales', () => {
    expect(normalizeGalleryLocale('zh')).toBe('zh')
    expect(normalizeGalleryLocale('en')).toBe('en')
  })

  it('rejects anything else, including plausible near-misses', () => {
    // A stored value is written by this app only, so anything unexpected is
    // corruption or a hand-edited localStorage entry; falling back is safer
    // than coercing.
    expect(normalizeGalleryLocale('zh-CN')).toBeNull()
    expect(normalizeGalleryLocale('EN')).toBeNull()
    expect(normalizeGalleryLocale('fr')).toBeNull()
    expect(normalizeGalleryLocale('')).toBeNull()
    expect(normalizeGalleryLocale(null)).toBeNull()
    expect(normalizeGalleryLocale(undefined)).toBeNull()
    expect(normalizeGalleryLocale(42)).toBeNull()
  })
})

describe('resolveGalleryLocale', () => {
  it('lets a stored choice win over the browser language', () => {
    expect(resolveGalleryLocale('zh', 'en-US')).toBe('zh')
    expect(resolveGalleryLocale('en', 'zh-CN')).toBe('en')
  })

  it('maps any Chinese tag to Chinese', () => {
    expect(resolveGalleryLocale(null, 'zh')).toBe('zh')
    expect(resolveGalleryLocale(null, 'zh-CN')).toBe('zh')
    expect(resolveGalleryLocale(null, 'zh-Hans-CN')).toBe('zh')
    expect(resolveGalleryLocale(null, 'ZH-TW')).toBe('zh')
  })

  it('maps any non-Chinese tag to English', () => {
    // An unsupported language is far better served by English than by Chinese,
    // and everything else the project exposes (README, env example, CLI, API)
    // is English, so the default flipped away from Chinese for non-zh browsers.
    expect(resolveGalleryLocale(null, 'en')).toBe('en')
    expect(resolveGalleryLocale(null, 'en-GB')).toBe('en')
    expect(resolveGalleryLocale(null, 'ja-JP')).toBe('en')
    expect(resolveGalleryLocale(null, 'fr')).toBe('en')
  })

  it('falls back to Chinese only when the browser language is unusable', () => {
    expect(resolveGalleryLocale(null, undefined)).toBe(DEFAULT_GALLERY_LOCALE)
    expect(resolveGalleryLocale(null, '')).toBe(DEFAULT_GALLERY_LOCALE)
    expect(resolveGalleryLocale(null, '   ')).toBe(DEFAULT_GALLERY_LOCALE)
    expect(resolveGalleryLocale(null, '-')).toBe(DEFAULT_GALLERY_LOCALE)
  })
})

describe('locale presentation helpers', () => {
  it('produces a valid lang attribute', () => {
    expect(htmlLang('zh')).toBe('zh-CN')
    expect(htmlLang('en')).toBe('en')
  })

  it('produces an Intl tag so formatters follow the chosen language', () => {
    // Previously `undefined` was passed and the formatters followed the browser
    // while the text was hard-coded, so an English browser showed an English
    // date beside a Chinese label.
    expect(intlLocale('zh')).toBe('zh-CN')
    expect(intlLocale('en')).toBe('en-US')
  })

  it('toggles to the other locale', () => {
    expect(otherGalleryLocale('zh')).toBe('en')
    expect(otherGalleryLocale('en')).toBe('zh')
  })

  it('uses one storage key, matching the theme convention', () => {
    expect(GALLERY_LOCALE_STORAGE_KEY).toBe('framefolio:gallery-locale')
  })
})
