// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AdminConfirmDialog from '../../app/components/admin/AdminConfirmDialog.vue'
import AdminLogin from '../../app/components/admin/AdminLogin.vue'
import AdminUploader from '../../app/components/admin/AdminUploader.vue'
import AdminPhotoList from '../../app/components/admin/AdminPhotoList.vue'
import type { AdminPhoto } from '../../shared/types/admin'

/**
 * Component tests for the admin UI.
 *
 * These cover things the API tests cannot see: focus behaviour, the wording that
 * tells the user a change is not live yet, and the mobile markup that the CSS
 * turns into card rows.
 */

function createPhoto(overrides: Partial<AdminPhoto> = {}): AdminPhoto {
  return {
    id: '0123456789abcdef',
    filename: 'photo.jpg',
    width: 1200,
    height: 800,
    storage: {
      thumbnail: '0123456789abcdef-fedcba9876543210-thumbnail.webp',
      preview: '0123456789abcdef-fedcba9876543210-preview.webp'
    },
    source: { size: 1024, mtimeMs: 1000, revision: 'fedcba9876543210' },
    state: 'unchanged',
    ...overrides
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AdminLogin', () => {
  it('emits the password on submit', async () => {
    const wrapper = mount(AdminLogin)
    await wrapper.find('#admin-password').setValue('secret')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]).toEqual(['secret'])
  })

  it('refuses an empty password without emitting', async () => {
    const wrapper = mount(AdminLogin)
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.find('#admin-login-error').text()).toContain('请输入')
  })

  it('renders the error set by the parent and marks the field invalid', async () => {
    const wrapper = mount(AdminLogin)
    wrapper.vm.setError('口令不正确。')
    await wrapper.vm.$nextTick()

    const input = wrapper.find('#admin-password')
    expect(wrapper.find('#admin-login-error').text()).toBe('口令不正确。')
    expect(input.attributes('aria-invalid')).toBe('true')
    // Screen readers need the association, not just the visual text.
    expect(input.attributes('aria-describedby')).toBe('admin-login-error')
  })

  it('clears the password and error on reset', async () => {
    const wrapper = mount(AdminLogin)
    await wrapper.find('#admin-password').setValue('secret')
    wrapper.vm.setError('bad')
    await wrapper.vm.$nextTick()

    wrapper.vm.reset()
    await wrapper.vm.$nextTick()

    expect(
      (wrapper.find('#admin-password').element as HTMLInputElement).value
    ).toBe('')
    expect(wrapper.find('#admin-login-error').text()).toBe('')
  })

  it('associates the label with the input and offers password managers the right hint', () => {
    const wrapper = mount(AdminLogin)
    const label = wrapper.find('label[for="admin-password"]')

    expect(label.exists()).toBe(true)
    expect(wrapper.find('#admin-password').attributes('autocomplete')).toBe(
      'current-password'
    )
    expect(wrapper.find('#admin-password').attributes('type')).toBe('password')
  })
})

describe('shared admin link styling', () => {
  it('centres its label and drops the underline for both <a> and <button>', async () => {
    // `.admin-link` styles an <a> in the header and a <button> in the uploader.
    // An <a> is inline by default, so without an explicit `display` its text
    // sits at the top of the box and it keeps its underline, which made the
    // header's two controls look misaligned.
    const css = await readAdminCss()
    const block = cssRule(css, '.admin-link')

    expect(block).toMatch(/display:\s*inline-flex/)
    expect(block).toMatch(/align-items:\s*center/)
    expect(block).toMatch(/justify-content:\s*center/)
    expect(block).toMatch(/text-decoration:\s*none/)
  })

  it('has no horizontal padding so right-aligned text meets the content edge', async () => {
    // The header controls are right-aligned. Padding here would push their text
    // inside the content edge, so it would no longer line up with the panels
    // below (it was 8px off). The gap between the links comes from the flex gap
    // on their container instead.
    const css = await readAdminCss()
    const block = cssRule(css, '.admin-link')

    expect(block).toMatch(/padding:\s*0\s*;/)
    expect(block).not.toMatch(/padding:\s*0\s+0\.5rem/)
  })

  it('keeps the header controls shorter than form buttons', async () => {
    // The gallery header's icons are 28px; using the 44px form-button height
    // here made the admin header 57px tall and top-heavy. The 28px target is
    // still easy to hit because the two links sit side by side with a gap.
    const css = await readAdminCss()
    const block = cssRule(css, '.admin-header__actions .admin-link')

    expect(block).toMatch(/min-height:\s*1\.75rem/)
  })

  it('aligns the header to the top like the public gallery header', async () => {
    // `baseline` and `center` both pushed the title down by the height
    // difference with the taller controls. `flex-start` matches
    // `.gallery-header` and keeps the two pages' titles on the same line.
    const css = await readAdminCss()
    const block = cssRule(css, '.admin-header')

    expect(block).toMatch(/align-items:\s*flex-start/)
  })

  it('uses the same top padding as the public gallery header', async () => {
    // The gallery uses --gallery-space-md below 48rem and 2rem above it. The
    // admin shell must match, or the two pages' titles start at different
    // heights (it was ~100px off when this used --gallery-space-lg).
    const css = await readAdminCss()
    const shell = cssRule(css, '.admin-shell')

    expect(shell).toMatch(/padding:\s*var\(--gallery-space-md\)/)
    expect(shell).not.toMatch(
      /padding:\s*var\(--gallery-space-lg\)\s+var\(--gallery-gutter\)\s*;/
    )

    const desktop =
      /@media \(min-width: 48rem\) \{\s*\.admin-shell \{([^}]*)\}/.exec(
        css
      )?.[1] ?? ''
    expect(desktop).toMatch(/padding-top:\s*2rem/)
  })

  it('tightens only the first section under the header', async () => {
    // The first section sits directly under the header rule, so the full section
    // spacing left ~120px of dead air and made the page look top-heavy.
    const css = await readAdminCss()
    const block = cssRule(css, '.admin-section:first-of-type')

    expect(block).toMatch(/margin-top:\s*var\(--gallery-space-md\)/)
  })
})
describe('AdminLogin disabled state', () => {
  it('explains a 404 as "admin not configured" rather than a bad password', async () => {
    // A 404 means the whole admin feature is switched off. Mapping it to a
    // password error would send the user hunting for a credential that does not
    // exist, which is exactly the confusion this guards against.
    const failure = Object.assign(new Error('Not Found'), { statusCode: 404 })
    vi.doMock('../../app/composables/useAdminApi', () => ({
      useAdminApi: () => ({
        getSession: async () => {
          throw failure
        }
      })
    }))

    vi.resetModules()
    const { useAdminSession, resetAdminSessionState } =
      await import('../../app/composables/useAdminSession')
    resetAdminSessionState()

    const session = useAdminSession()
    await session.refresh()

    expect(session.disabled.value).toBe(true)
    expect(session.authenticated.value).toBe(false)

    vi.doUnmock('../../app/composables/useAdminApi')
    resetAdminSessionState()
  })

  it('does not flag a 401 as disabled', async () => {
    const failure = Object.assign(new Error('Authentication required.'), {
      statusCode: 401
    })
    vi.doMock('../../app/composables/useAdminApi', () => ({
      useAdminApi: () => ({
        getSession: async () => {
          throw failure
        }
      })
    }))

    vi.resetModules()
    const { useAdminSession, resetAdminSessionState } =
      await import('../../app/composables/useAdminSession')
    resetAdminSessionState()

    const session = useAdminSession()
    await session.refresh()

    // 401 means "configured but not logged in": the login form must show.
    expect(session.disabled.value).toBe(false)
    expect(session.authenticated.value).toBe(false)

    vi.doUnmock('../../app/composables/useAdminApi')
    resetAdminSessionState()
  })
})

describe('AdminConfirmDialog', () => {
  it('states that the photo stays visible until a sync runs', async () => {
    // This wording is the main safeguard against the "I deleted it but it is
    // still on the site" confusion, so it is asserted explicitly.
    const wrapper = mount(AdminConfirmDialog, {
      props: { open: true, filename: 'holiday.jpg', busy: false },
      attachTo: document.body
    })
    await wrapper.vm.$nextTick()

    const text = wrapper.text()
    expect(text).toContain('holiday.jpg')
    expect(text).toContain('同步之前仍会显示在网站上')
    expect(text).toContain('.trash')

    wrapper.unmount()
  })

  it('emits confirm and cancel from the right buttons', async () => {
    const wrapper = mount(AdminConfirmDialog, {
      props: { open: true, filename: 'a.jpg', busy: false },
      attachTo: document.body
    })
    await wrapper.vm.$nextTick()

    const buttons = wrapper.findAll('button')
    await buttons[0]?.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)

    await buttons[1]?.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)

    wrapper.unmount()
  })

  it('disables both buttons while a deletion is in flight', async () => {
    const wrapper = mount(AdminConfirmDialog, {
      props: { open: true, filename: 'a.jpg', busy: true },
      attachTo: document.body
    })
    await wrapper.vm.$nextTick()

    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined()
    }

    wrapper.unmount()
  })

  it('opens the native dialog as a modal', async () => {
    const showModal = vi.fn()
    // happy-dom implements <dialog>; assert showModal was used rather than the
    // non-modal show(), because focus trapping depends on it.
    HTMLDialogElement.prototype.showModal = showModal

    const wrapper = mount(AdminConfirmDialog, {
      props: { open: false, filename: 'a.jpg', busy: false },
      attachTo: document.body
    })

    await wrapper.setProps({ open: true })
    await wrapper.vm.$nextTick()

    expect(showModal).toHaveBeenCalled()

    wrapper.unmount()
  })
})

describe('AdminUploader', () => {
  // The component calls the Nuxt auto-imported `useAdminApi`. A bare Vitest run
  // has no Nuxt transform, so provide a stub; the upload behaviour itself is
  // covered by the API tests and the browser-level probe.
  const uploadPhoto = vi.fn(async () => ({ filename: 'a.jpg', bytes: 1 }))

  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).useAdminApi = () => ({
      uploadPhoto
    })
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).useAdminApi
    uploadPhoto.mockClear()
  })

  it('warns that uploaded photos are not on the site yet', async () => {
    // Uploading does not sync, so this notice is the only thing stopping the
    // user from assuming their upload failed silently.
    const wrapper = mount(AdminUploader)

    const file = new File(['x'], 'holiday.jpg', { type: 'image/jpeg' })
    Object.defineProperty(wrapper.find('input[type="file"]').element, 'files', {
      value: [file]
    })
    await wrapper.find('input[type="file"]').trigger('change')
    await flushPromises()

    expect(uploadPhoto).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('尚未出现在网站上')
    expect(wrapper.text()).toContain('立即同步')

    wrapper.unmount()
  })

  it('lists each selected file with its outcome', async () => {
    const wrapper = mount(AdminUploader)

    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    Object.defineProperty(wrapper.find('input[type="file"]').element, 'files', {
      value: [file]
    })
    await wrapper.find('input[type="file"]').trigger('change')
    await flushPromises()

    expect(wrapper.text()).toContain('a.jpg')
    expect(wrapper.text()).toContain('已上传')

    wrapper.unmount()
  })

  it('reports a failed upload without losing the list', async () => {
    uploadPhoto.mockRejectedValueOnce(new Error('文件过大'))

    const wrapper = mount(AdminUploader)
    const file = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(wrapper.find('input[type="file"]').element, 'files', {
      value: [file]
    })
    await wrapper.find('input[type="file"]').trigger('change')
    await flushPromises()

    expect(wrapper.text()).toContain('文件过大')
    expect(wrapper.text()).toContain('1 张上传失败')

    wrapper.unmount()
  })

  it('accepts only the supported image types', () => {
    const wrapper = mount(AdminUploader)
    const accept = wrapper.find('input[type="file"]').attributes('accept') ?? ''

    expect(accept).toContain('.jpg')
    expect(accept).toContain('.png')
    expect(accept).toContain('.webp')
    expect(accept).toContain('.tif')
    // Formats the pipeline cannot decode must not be offered.
    expect(accept).not.toContain('heic')
    expect(accept).not.toContain('raw')
  })

  it('allows selecting several files at once', () => {
    const wrapper = mount(AdminUploader)

    expect(
      wrapper.find('input[type="file"]').attributes('multiple')
    ).toBeDefined()
  })

  it('exposes the file input to assistive technology via a label', () => {
    const wrapper = mount(AdminUploader)

    // The input is visually hidden, so it must still be reachable and labelled.
    expect(wrapper.find('label').exists()).toBe(true)
    expect(wrapper.find('input[type="file"]').classes()).toContain(
      'visually-hidden'
    )
  })
})

describe('AdminPhotoList', () => {
  it('shows an empty hint when there are no photos', () => {
    const wrapper = mount(AdminPhotoList, {
      props: { photos: [], busy: false }
    })

    expect(wrapper.text()).toContain('还没有照片')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('labels each photo state in Chinese', () => {
    const wrapper = mount(AdminPhotoList, {
      props: {
        photos: [
          createPhoto({ id: 'a', filename: 'a.jpg', state: 'added' }),
          createPhoto({ id: 'b', filename: 'b.jpg', state: 'changed' }),
          createPhoto({ id: 'c', filename: 'c.jpg', state: 'pending-delete' }),
          createPhoto({ id: 'd', filename: 'd.jpg', state: 'unchanged' })
        ],
        busy: false
      }
    })

    const text = wrapper.text()
    expect(text).toContain('待新增')
    expect(text).toContain('待更新')
    expect(text).toContain('待删除')
    expect(text).toContain('已发布')
  })

  it('marks non-published rows with the pending badge', () => {
    const wrapper = mount(AdminPhotoList, {
      props: {
        photos: [createPhoto({ state: 'added' })],
        busy: false
      }
    })

    expect(wrapper.find('.admin-badge--pending').exists()).toBe(true)
  })

  it('does not offer delete for a photo that is already pending deletion', () => {
    const wrapper = mount(AdminPhotoList, {
      props: {
        photos: [createPhoto({ state: 'pending-delete' })],
        busy: false
      }
    })

    const button = wrapper.find('button')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('emits the photo to delete', async () => {
    const photo = createPhoto()
    const wrapper = mount(AdminPhotoList, {
      props: { photos: [photo], busy: false }
    })

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('delete')?.[0]).toEqual([photo])
  })

  it('disables delete while another action is in flight', () => {
    const wrapper = mount(AdminPhotoList, {
      props: { photos: [createPhoto()], busy: true }
    })

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('emits data-label for every cell so the mobile card layout has labels', () => {
    // The CSS hides the header row below 48rem and prints these labels instead;
    // without them the mobile table would show bare values.
    const wrapper = mount(AdminPhotoList, {
      props: { photos: [createPhoto()], busy: false }
    })

    const labelled = wrapper.findAll('td[data-label]')
    expect(labelled).toHaveLength(6)
    expect(labelled.map(cell => cell.attributes('data-label'))).toEqual([
      '预览',
      '文件名',
      '尺寸',
      '大小',
      '状态',
      '操作'
    ])
  })

  it('omits the preview image for a photo that has no derivatives yet', () => {
    const wrapper = mount(AdminPhotoList, {
      props: {
        photos: [
          createPhoto({
            state: 'added',
            storage: { thumbnail: '', preview: '' }
          })
        ],
        busy: false
      }
    })

    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('shows a placeholder instead of zero dimensions', () => {
    const wrapper = mount(AdminPhotoList, {
      props: {
        photos: [createPhoto({ width: 0, height: 0, state: 'added' })],
        busy: false
      }
    })

    expect(wrapper.text()).toContain('—')
  })
})

/** Read the admin stylesheet under test. */
async function readAdminCss(): Promise<string> {
  const { readFile } = await import('node:fs/promises')
  return readFile('app/assets/css/admin.css', 'utf8')
}

/**
 * Extract the declaration block for an exact selector.
 *
 * Anchored to the start of a line so `.admin-link` does not also match
 * `.admin-header__actions .admin-link`.
 */
function cssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? ''
}
