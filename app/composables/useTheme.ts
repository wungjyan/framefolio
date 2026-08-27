import { onMounted, type Ref } from 'vue'

import {
  GALLERY_THEME_STORAGE_KEY,
  type GalleryTheme,
  normalizeGalleryTheme,
  resolveGalleryTheme
} from '../utils/theme'

export const GALLERY_THEME_DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

let themeRef: Ref<GalleryTheme> | undefined
let systemQuery: MediaQueryList | undefined
let systemListening = false
let initialized = false

export function useTheme() {
  const theme = useState<GalleryTheme>('gallery-theme', () => 'light')

  onMounted(() => {
    if (import.meta.client && !initialized) {
      initialized = true
      initTheme(theme)
    }
  })

  function toggleTheme(): void {
    const next: GalleryTheme = theme.value === 'dark' ? 'light' : 'dark'
    theme.value = next
    document.documentElement.dataset.theme = next
    writeStoredGalleryTheme(getBrowserStorage(), next)
    stopSystemListener()
  }

  return {
    theme,
    toggleTheme
  }
}

function initTheme(theme: Ref<GalleryTheme>): void {
  const stored = readStoredGalleryTheme(getBrowserStorage())
  themeRef = theme
  systemQuery = window.matchMedia(GALLERY_THEME_DARK_MEDIA_QUERY)
  applyTheme(resolveGalleryTheme(stored, systemQuery.matches))

  // Only follow live system changes until the user makes a manual choice.
  if (!stored) {
    systemQuery.addEventListener('change', handleSystemChange)
    systemListening = true
  }
}

function applyTheme(value: GalleryTheme): void {
  if (themeRef) {
    themeRef.value = value
  }

  document.documentElement.dataset.theme = value
}

function handleSystemChange(event: MediaQueryListEvent): void {
  applyTheme(resolveGalleryTheme(null, event.matches))
}

function stopSystemListener(): void {
  if (!systemListening || !systemQuery) {
    return
  }

  systemQuery.removeEventListener('change', handleSystemChange)
  systemListening = false
}

export function readStoredGalleryTheme(
  storage?: Pick<Storage, 'getItem'>
): GalleryTheme | null {
  try {
    if (!storage) {
      return null
    }

    return normalizeGalleryTheme(storage.getItem(GALLERY_THEME_STORAGE_KEY))
  } catch {
    return null
  }
}

export function writeStoredGalleryTheme(
  storage: Pick<Storage, 'setItem'> | undefined,
  value: GalleryTheme
): void {
  try {
    if (!storage) {
      return
    }

    storage.setItem(GALLERY_THEME_STORAGE_KEY, value)
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
