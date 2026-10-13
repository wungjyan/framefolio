/**
 * Locale resolution: pure logic, no Nuxt imports.
 *
 * Deliberately mirrors `theme.ts`, including the storage-key and
 * resolve-from-system shape, so both preferences behave identically and are
 * covered by the same kind of unit test.
 */

export type GalleryLocale = 'zh' | 'en'

export const GALLERY_LOCALE_STORAGE_KEY = 'framefolio:gallery-locale'

/** Fallback when nothing is stored and the browser language is unknown. */
export const DEFAULT_GALLERY_LOCALE: GalleryLocale = 'zh'

export const GALLERY_LOCALES: readonly GalleryLocale[] = ['zh', 'en']

export function normalizeGalleryLocale(value: unknown): GalleryLocale | null {
  if (value === 'zh' || value === 'en') {
    return value
  }

  return null
}

/**
 * Pick the locale for a first visit.
 *
 * A stored choice always wins. Otherwise the browser language decides, which is
 * what makes an English-speaking deployment land on an English admin area
 * instead of a Chinese one — everything else the project exposes (README, env
 * example, CLI output, API messages) is English.
 *
 * Any `zh-*` tag maps to Chinese and everything else to English, rather than
 * matching a list of known languages: an unsupported language is far better
 * served by English than by Chinese.
 */
export function resolveGalleryLocale(
  stored: GalleryLocale | null,
  navigatorLanguage: string | undefined
): GalleryLocale {
  if (stored) {
    return stored
  }

  if (typeof navigatorLanguage === 'string') {
    const primary = navigatorLanguage.trim().toLowerCase().split('-')[0] ?? ''

    if (primary === 'zh') {
      return 'zh'
    }

    if (primary.length > 0) {
      return 'en'
    }
  }

  return DEFAULT_GALLERY_LOCALE
}

/** Value for the `lang` attribute on `<html>`. */
export function htmlLang(locale: GalleryLocale): string {
  return locale === 'zh' ? 'zh-CN' : 'en'
}

/**
 * BCP 47 tag for `Intl` formatters.
 *
 * Passed explicitly rather than `undefined`: the formatters used to follow the
 * browser while the surrounding text was hard-coded Chinese, so a date could be
 * rendered in a different language from the label next to it.
 */
export function intlLocale(locale: GalleryLocale): string {
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

/** The other locale, for a two-language toggle. */
export function otherGalleryLocale(locale: GalleryLocale): GalleryLocale {
  return locale === 'zh' ? 'en' : 'zh'
}
