export type GalleryTheme = 'light' | 'dark'

export const GALLERY_THEME_STORAGE_KEY = 'framefolio:gallery-theme'

export function normalizeGalleryTheme(value: unknown): GalleryTheme | null {
  if (value === 'dark') {
    return 'dark'
  }

  if (value === 'light') {
    return 'light'
  }

  return null
}

export function resolveGalleryTheme(
  stored: GalleryTheme | null,
  systemDark: boolean
): GalleryTheme {
  if (stored) {
    return stored
  }

  return systemDark ? 'dark' : 'light'
}
