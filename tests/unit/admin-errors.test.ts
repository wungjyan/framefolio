import { describe, expect, it } from 'vitest'

import {
  MESSAGES,
  errorMessageKey,
  interpolate,
  isAdminErrorCode,
  knownAdminErrorCodes,
  translate
} from '../../app/i18n/messages'
import { en } from '../../app/i18n/en'
import { zh } from '../../app/i18n/zh'
import { ADMIN_ERROR_CODES } from '../../shared/constants/admin-errors'

/**
 * Catalogue integrity.
 *
 * The type system already forces `en` to have every key of `zh`, so these tests
 * cover what types cannot: keys that are present but empty, placeholders that
 * disagree between languages, and error codes with no message at all.
 */

const LOCALES = ['zh', 'en'] as const

describe('message catalogues', () => {
  it('has the same keys in both languages', () => {
    // `en` is typed as `Record<keyof typeof zh, string>`, so this is asserted by
    // the compiler; the runtime check also catches an `en` file that is cast or
    // a key removed from `zh` while `en` still lists it.
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('has no empty messages', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('')
      }
    }
  })

  it('uses the same placeholders in both languages', () => {
    // A translation that drops `{count}` silently renders a sentence with no
    // number in it, which is the kind of bug that survives review.
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

    for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
      expect(placeholders(en[key]), `placeholders for ${key}`).toEqual(
        placeholders(zh[key])
      )
    }
  })

  it('does not leave Chinese characters in the English catalogue', () => {
    // Exception: the language names themselves are written in their own
    // language on purpose, so a language picker reads correctly in any locale.
    const allowed = new Set(['locale.zh'])

    for (const [key, value] of Object.entries(en)) {
      if (allowed.has(key)) {
        continue
      }

      expect(value, `untranslated key ${key}`).not.toMatch(/[\u4e00-\u9fff]/)
    }
  })
})

describe('error codes', () => {
  it('has a message for every code, in both languages', () => {
    for (const code of ADMIN_ERROR_CODES) {
      expect(isAdminErrorCode(code)).toBe(true)

      for (const locale of LOCALES) {
        const message = translate(locale, errorMessageKey(code))

        expect(message, `${locale}:${code}`).not.toBe('')
        // A missing key would have fallen through to the literal key string.
        expect(message, `${locale}:${code}`).not.toContain('error.')
      }
    }
  })

  it('recognises a real code and rejects anything else', () => {
    expect(isAdminErrorCode('upload-too-large')).toBe(true)
    expect(isAdminErrorCode('not-a-code')).toBe(false)
    expect(isAdminErrorCode(undefined)).toBe(false)
    expect(isAdminErrorCode(42)).toBe(false)
    expect(isAdminErrorCode(null)).toBe(false)
  })

  it('derives exactly the codes the server declares', () => {
    // The runtime set is derived from the `error.*` message keys, because
    // `app/` code may only import TYPES from `shared/` (a runtime import breaks
    // the Nitro server bundle). This is what keeps the two from drifting: a code
    // added to one side without the other fails here.
    expect(knownAdminErrorCodes()).toEqual([...ADMIN_ERROR_CODES].sort())
  })

  it('keeps client-only fallbacks out of the error namespace', () => {
    // `error.*` means "a code the server may send". A local fallback living
    // there would be treated as a valid code, so `local.*` is reserved for them.
    expect(knownAdminErrorCodes()).not.toContain('unknown')
    expect(Object.keys(zh)).toContain('local.unknown')
  })

  it('never renders a raw identifier for an unknown code', () => {
    // The UI falls back to a generic message rather than echoing the server, so
    // an English identifier can never appear in a Chinese interface.
    expect(translate('zh', 'local.unknown')).toBe('操作失败，请重试。')
    expect(translate('en', 'local.unknown')).toBe(
      'That did not work. Please try again.'
    )
  })
})

describe('gallery and viewer strings', () => {
  it('covers the public gallery accessibility labels in both languages', () => {
    // These are screen-reader only, so a gap shows up as a Chinese announcement
    // in an English session rather than as anything visible on screen.
    expect(translate('zh', 'gallery.openPhoto', { filename: 'a.jpg' })).toBe(
      '打开照片 a.jpg'
    )
    expect(translate('en', 'gallery.openPhoto', { filename: 'a.jpg' })).toBe(
      'Open photo a.jpg'
    )

    expect(translate('zh', 'viewer.previous')).toBe('上一张照片')
    expect(translate('en', 'viewer.previous')).toBe('Previous photo')
    expect(translate('zh', 'viewer.metadata')).toBe('照片信息')
    expect(translate('en', 'viewer.metadata')).toBe('Photo information')
  })
})

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('{a} and {b}', { a: 'x', b: 2 })).toBe('x and 2')
  })

  it('leaves an unknown placeholder visible', () => {
    // Visible `{count}` is an obvious bug report; an empty string produces a
    // sentence that reads as merely oddly worded and is far harder to notice.
    expect(interpolate('{missing}', {})).toBe('{missing}')
  })

  it('returns the template untouched without params', () => {
    expect(interpolate('plain text', undefined)).toBe('plain text')
  })
})
