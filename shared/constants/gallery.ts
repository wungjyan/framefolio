export const GALLERY_SCHEMA_VERSION = 1 as const
export const GALLERY_PIPELINE_VERSION = 1 as const

export const GALLERY_DATA_DIRECTORY_ENV = 'NUXT_GALLERY_DATA_DIR'
export const DEFAULT_GALLERY_DATA_DIRECTORY = 'data'
export const ORIGINALS_DIRECTORY_NAME = 'originals'
export const GENERATED_DIRECTORY_NAME = 'generated'
export const GALLERY_INDEX_FILENAME = 'photos.json'
export const GENERATED_IMAGE_EXTENSION = 'webp'
export const GENERATED_IMAGE_COLOURSPACE = 'srgb'
export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp'
])

export const IMAGE_RESIZE_OPTIONS = {
  fit: 'inside',
  withoutEnlargement: true
} as const

export const IMAGE_VARIANTS = {
  thumbnail: {
    suffix: 'thumbnail',
    maxEdge: 960,
    quality: 82
  },
  preview: {
    suffix: 'preview',
    maxEdge: 2560,
    quality: 88
  }
} as const

export type ImageVariant = keyof typeof IMAGE_VARIANTS
