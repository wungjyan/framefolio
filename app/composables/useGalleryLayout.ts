import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { GalleryLayout } from '../utils/gallery-layout'

export const GALLERY_DESKTOP_MEDIA_QUERY = '(min-width: 48rem)'

export function useGalleryLayout() {
  const layout = ref<GalleryLayout>('justified')
  const isDesktop = ref(true)
  const isMounted = ref(false)
  let mediaQuery: MediaQueryList | undefined

  function setLayout(value: GalleryLayout): void {
    layout.value = value
  }

  function updateViewport(event: MediaQueryList | MediaQueryListEvent): void {
    isDesktop.value = event.matches
  }

  onMounted(() => {
    isMounted.value = true
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
    setLayout
  }
}
