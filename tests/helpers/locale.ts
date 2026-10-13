import { computed, ref } from 'vue'

import {
  type AdminErrorCode,
  type MessageKey,
  type MessageParams,
  errorMessageKey,
  isAdminErrorCode,
  isMessageParams,
  translate
} from '../../app/i18n/messages'
import type { GalleryLocale } from '../../app/utils/locale'

/**
 * A controllable stand-in for the real `useLocale`, for component tests.
 *
 * The real composable resolves the locale from `localStorage` and
 * `navigator.language` on mount, which would make every component test depend
 * on the DOM's language — happy-dom reports `en-US`, so the whole Chinese suite
 * would silently flip to English. This keeps the resolution logic out of the way
 * (it has its own unit tests in `locale.test.ts`) and exposes a switch instead.
 *
 * `t` and `translateError` are the REAL implementations from `app/i18n`, so a
 * missing key or an unmapped error code still fails here.
 */
const locale = ref<GalleryLocale>('zh')

export function setTestLocale(value: GalleryLocale): void {
  locale.value = value
}

export function resetTestLocale(): void {
  locale.value = 'zh'
}

export function createTestUseLocale() {
  function t(key: MessageKey, params?: MessageParams): string {
    return translate(locale.value, key, params)
  }

  return {
    locale,
    intlLocale: computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US')),
    setLocale: (value: GalleryLocale) => {
      locale.value = value
    },
    toggleLocale: () => {
      locale.value = locale.value === 'zh' ? 'en' : 'zh'
    },
    t,
    translateError(error: unknown, fallbackKey: MessageKey = 'local.unknown') {
      const data = (
        error as { data?: { code?: unknown; params?: unknown } } | undefined
      )?.data
      const code = data?.code

      if (isAdminErrorCode(code)) {
        return t(
          errorMessageKey(code as AdminErrorCode),
          isMessageParams(data?.params) ? data.params : undefined
        )
      }

      return t(fallbackKey)
    }
  }
}

/** Register the stand-in on `globalThis`, where Nuxt auto-imports live. */
export function installTestUseLocale(): void {
  ;(globalThis as Record<string, unknown>).useLocale = createTestUseLocale
}
