import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { GalleryLayout } from '../utils/gallery-layout'

export const GALLERY_LAYOUT_STORAGE_KEY = 'framefolio:gallery-layout'
export const GALLERY_DESKTOP_MEDIA_QUERY = '(min-width: 48rem)'

export function useGalleryLayout() {
  const layout = ref<GalleryLayout>('editorial')
  const isDesktop = ref(true)
  const isMounted = ref(false)
  let mediaQuery: MediaQueryList | undefined

  function setLayout(value: GalleryLayout): void {
    layout.value = value

    if (import.meta.client) {
      writeStoredGalleryLayout(getBrowserStorage(), value)
    }
  }

  function updateViewport(event: MediaQueryList | MediaQueryListEvent): void {
    isDesktop.value = event.matches
  }

  onMounted(() => {
    isMounted.value = true
    layout.value = readStoredGalleryLayout(getBrowserStorage())
    mediaQuery = window.matchMedia(GALLERY_DESKTOP_MEDIA_QUERY)
    updateViewport(mediaQuery)
    mediaQuery.addEventListener('change', updateViewport)
  })

  onBeforeUnmount(() => {
    mediaQuery?.removeEventListener('change', updateViewport)
  })

  return {
    isDesktop,
    isMobile: computed(() => isMounted.value && !isDesktop.value),
    layout,
    previewEnabled: computed(() => isMounted.value && isDesktop.value),
    setLayout
  }
}

export function readStoredGalleryLayout(
  storage?: Pick<Storage, 'getItem'>
): GalleryLayout {
  try {
    if (!storage) {
      return 'editorial'
    }

    const value = storage.getItem(GALLERY_LAYOUT_STORAGE_KEY)
    return value === 'justified' ? 'justified' : 'editorial'
  } catch {
    return 'editorial'
  }
}

export function writeStoredGalleryLayout(
  storage: Pick<Storage, 'setItem'> | undefined,
  value: GalleryLayout
): void {
  try {
    if (!storage) {
      return
    }

    storage.setItem(GALLERY_LAYOUT_STORAGE_KEY, value)
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
