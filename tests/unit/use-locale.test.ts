// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import {
  readStoredGalleryLocale,
  resetLocaleState,
  useLocale,
  writeStoredGalleryLocale
} from '../../app/composables/useLocale'
import { GALLERY_LOCALE_STORAGE_KEY } from '../../app/utils/locale'

/**
 * The real `useLocale` composable.
 *
 * Component tests use a stand-in (`tests/helpers/locale.ts`) so they are not at
 * the mercy of the DOM's language. This file covers what the stand-in
 * deliberately bypasses: reading storage, falling back to `navigator.language`,
 * and writing `document.documentElement.lang`.
 *
 * The composable initialises from `onMounted`, so it must be used inside a real
 * component — mounting one is what makes this test exercise the actual wiring
 * rather than a copy of it.
 *
 * `useState` is Nuxt's SSR-safe container. It is stubbed with a plain ref here,
 * which is what it degrades to on the client.
 */
function stubUseState() {
  const state = ref<unknown>(undefined)
  ;(globalThis as Record<string, unknown>).useState = (
    _key: string,
    init: () => unknown
  ) => {
    if (state.value === undefined) {
      state.value = init()
    }
    return state
  }
  return state
}

/** Mount the composable and return it, after `onMounted` has run. */
async function mountLocale() {
  let api: ReturnType<typeof useLocale> | undefined

  mount(
    defineComponent({
      setup() {
        api = useLocale()
        return () => h('div')
      }
    })
  )

  await nextTick()

  return api as ReturnType<typeof useLocale>
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.lang = ''
  resetLocaleState()
  stubUseState()
  vi.stubGlobal('navigator', { language: 'en-US' })
})

describe('useLocale initialisation', () => {
  it('defaults to English for an English browser with nothing stored', async () => {
    // The project's docs, env example, CLI output and API messages are all
    // English, so an English-speaking deployment must not land on a Chinese UI.
    const { locale, t } = await mountLocale()

    expect(locale.value).toBe('en')
    expect(t('sync.start')).toBe('Sync now')
    expect(document.documentElement.lang).toBe('en')
  })

  it('defaults to Chinese for a Chinese browser', async () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' })

    const { locale, t } = await mountLocale()

    expect(locale.value).toBe('zh')
    expect(t('sync.start')).toBe('立即同步')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('prefers a stored choice over the browser language', async () => {
    localStorage.setItem(GALLERY_LOCALE_STORAGE_KEY, 'zh')

    const { locale } = await mountLocale()

    expect(locale.value).toBe('zh')
  })

  it('persists the resolved default so a later load is decisive', async () => {
    await mountLocale()

    expect(localStorage.getItem(GALLERY_LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('ignores a corrupt stored value instead of coercing it', async () => {
    localStorage.setItem(GALLERY_LOCALE_STORAGE_KEY, 'de')

    const { locale } = await mountLocale()

    // Falls back to the browser language, which is a defensible answer.
    expect(locale.value).toBe('en')
  })
})

describe('useLocale switching', () => {
  it('re-renders translations and updates the lang attribute', async () => {
    const { t, toggleLocale, locale } = await mountLocale()

    expect(t('sync.start')).toBe('Sync now')

    toggleLocale()
    await nextTick()

    expect(locale.value).toBe('zh')
    expect(t('sync.start')).toBe('立即同步')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(localStorage.getItem(GALLERY_LOCALE_STORAGE_KEY)).toBe('zh')

    toggleLocale()
    await nextTick()

    expect(locale.value).toBe('en')
    expect(t('sync.start')).toBe('Sync now')
  })

  it('interpolates params in the selected language', async () => {
    const { t, setLocale } = await mountLocale()

    setLocale('zh')
    expect(t('sync.pending.count', { count: 3 })).toBe('待同步 3 项')

    setLocale('en')
    expect(t('sync.pending.count', { count: 3 })).toBe('3 pending')
  })
})

describe('useLocale error translation', () => {
  it('maps a server code to a translated message', async () => {
    const { translateError, setLocale } = await mountLocale()

    const error = {
      data: { code: 'upload-too-large', params: { limitMb: 100 } }
    }

    setLocale('zh')
    expect(translateError(error)).toBe('上传超过 100 MB 的限制。')

    setLocale('en')
    expect(translateError(error)).toBe('The upload exceeds the 100 MB limit.')
  })

  it('falls back to a generic message rather than leaking server prose', async () => {
    const { translateError, setLocale } = await mountLocale()

    setLocale('zh')

    // A connection failure or a proxy error page has no code.
    expect(translateError(new Error('socket hang up'))).toBe(
      '操作失败，请重试。'
    )
    // An unknown code is also refused, so a future server string cannot appear
    // verbatim in the interface.
    expect(translateError({ data: { code: 'brand-new-code' } })).toBe(
      '操作失败，请重试。'
    )
  })

  it('uses the caller-supplied fallback key when there is no code', async () => {
    const { translateError, setLocale } = await mountLocale()

    setLocale('en')
    expect(translateError(new Error('x'), 'sync.failed')).toBe('Sync failed.')
  })
})

describe('locale storage helpers', () => {
  it('survives storage being unavailable', () => {
    // Private browsing and hardened contexts can throw on access.
    const throwing = {
      getItem: () => {
        throw new Error('denied')
      }
    }

    expect(readStoredGalleryLocale(throwing)).toBeNull()

    const throwingWrite = {
      setItem: () => {
        throw new Error('denied')
      }
    }

    expect(() => writeStoredGalleryLocale(throwingWrite, 'en')).not.toThrow()
  })

  it('treats a missing storage object as no stored value', () => {
    expect(readStoredGalleryLocale(undefined)).toBeNull()
    expect(() => writeStoredGalleryLocale(undefined, 'zh')).not.toThrow()
  })
})
