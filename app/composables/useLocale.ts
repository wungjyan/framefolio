import { onMounted } from 'vue'

import {
  GALLERY_LOCALE_STORAGE_KEY,
  type GalleryLocale,
  htmlLang,
  intlLocale,
  normalizeGalleryLocale,
  otherGalleryLocale,
  resolveGalleryLocale
} from '../utils/locale'
import {
  type AdminErrorCode,
  type MessageKey,
  type MessageParams,
  errorMessageKey,
  isAdminErrorCode,
  isMessageParams,
  translate
} from '../i18n/messages'

let initialized = false

/**
 * Locale and translation.
 *
 * Mirrors `useTheme`: a `useState` value (so SSR and client agree), initialised
 * on mount from storage or the browser language, with the chosen value written
 * back so it survives a reload. The public gallery uses the same composable, so
 * the language is one site-wide choice rather than one per page.
 */
export function useLocale() {
  const locale = useState<GalleryLocale>('gallery-locale', () => 'zh')

  onMounted(() => {
    // Guarded on the DOM rather than on `import.meta.client`: `onMounted` never
    // runs during SSR, so the build-time constant added nothing, and a runtime
    // check is what a bare test runner can actually exercise.
    if (isBrowser() && !initialized) {
      initialized = true
      initLocale(locale)
    }
  })

  function setLocale(value: GalleryLocale): void {
    locale.value = value
    applyHtmlLang(value)
    writeStoredGalleryLocale(getBrowserStorage(), value)
  }

  function toggleLocale(): void {
    setLocale(otherGalleryLocale(locale.value))
  }

  /**
   * Translate a message key.
   *
   * Reading `locale.value` here is what registers the reactive dependency, so a
   * template calling `t(...)` re-renders when the language changes.
   */
  function t(key: MessageKey, params?: MessageParams): string {
    return translate(locale.value, key, params)
  }

  /**
   * Translate a server error.
   *
   * The server replies with a stable `data.code` rather than prose, because it
   * cannot know which language the UI is showing. Anything without a recognised
   * code (a dropped connection, a proxy's HTML error page) falls back to a
   * generic message rather than leaking an English string into a Chinese UI.
   */
  function translateError(
    error: unknown,
    fallbackKey: MessageKey = 'local.unknown'
  ): string {
    const payload = readAdminError(error)

    return payload
      ? t(errorMessageKey(payload.code), payload.params)
      : t(fallbackKey)
  }

  return {
    locale,
    intlLocale: computed(() => intlLocale(locale.value)),
    setLocale,
    toggleLocale,
    t,
    translateError
  }
}

/**
 * Apply the initial locale on the client.
 *
 * `document.documentElement.lang` is set here rather than in `app.vue` because
 * the value is only known once the browser language has been read: the server
 * renders the default and the client corrects it during hydration.
 */
function initLocale(locale: { value: GalleryLocale }): void {
  const stored = readStoredGalleryLocale(getBrowserStorage())
  const resolved = resolveGalleryLocale(stored, readNavigatorLanguage())

  locale.value = resolved
  applyHtmlLang(resolved)
  writeStoredGalleryLocale(getBrowserStorage(), resolved)
}

function applyHtmlLang(locale: GalleryLocale): void {
  if (isBrowser()) {
    document.documentElement.lang = htmlLang(locale)
  }
}

function isBrowser(): boolean {
  return typeof document !== 'undefined'
}

function readNavigatorLanguage(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.language
}

export function readStoredGalleryLocale(
  storage?: Pick<Storage, 'getItem'>
): GalleryLocale | null {
  try {
    if (!storage) {
      return null
    }

    return normalizeGalleryLocale(storage.getItem(GALLERY_LOCALE_STORAGE_KEY))
  } catch {
    return null
  }
}

export function writeStoredGalleryLocale(
  storage: Pick<Storage, 'setItem'> | undefined,
  value: GalleryLocale
): void {
  try {
    if (!storage) {
      return
    }

    storage.setItem(GALLERY_LOCALE_STORAGE_KEY, value)
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

function getBrowserStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * Read the server error payload from a failed request.
 *
 * Nitro's `$fetch` puts the JSON body under `data`, which is where the code and
 * its interpolation values live.
 */
export function readAdminError(
  error: unknown
): { code: AdminErrorCode; params?: MessageParams } | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  const data = (error as { data?: { code?: unknown; params?: unknown } }).data
  const code = data?.code

  if (!isAdminErrorCode(code)) {
    return undefined
  }

  return isMessageParams(data?.params)
    ? { code, params: data.params }
    : { code }
}

/** Test helper: reset the module-level init guard between cases. */
export function resetLocaleState(): void {
  initialized = false
}
