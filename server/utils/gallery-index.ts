import { readFile } from 'node:fs/promises'

import {
  GALLERY_PIPELINE_VERSION,
  GALLERY_SCHEMA_VERSION,
  GENERATED_IMAGE_FILENAME_PATTERN,
  GENERATED_IMAGE_HASH_LENGTH
} from '../../shared/constants/gallery'
import {
  MEDIA_ROUTE_PREFIX,
  type PhotoUrlContext
} from '../../shared/node/photo-url'
import type {
  GalleryIndex,
  GalleryPhoto,
  PhotoIndexItem,
  PhotosResponse
} from '../../shared/types/photo'

const GENERATED_IMAGE_HASH_PATTERN = new RegExp(
  `^[a-f0-9]{${GENERATED_IMAGE_HASH_LENGTH}}$`
)

const LOCAL_URL_CONTEXT: PhotoUrlContext = { source: 'local' }

export class GalleryIndexError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'GalleryIndexError'
  }
}

/**
 * Read the public photo list, assembling URLs for the requested storage source.
 *
 * The index itself never stores URLs, so switching sources is a read-time
 * decision and needs no rewrite of `photos.json`.
 */
export async function readPublicGalleryPhotos(
  indexPath: string,
  urlContext: PhotoUrlContext = LOCAL_URL_CONTEXT
): Promise<PhotosResponse> {
  const index = await readGalleryIndex(indexPath)

  return index.photos.map(photo => toPublicPhoto(photo, urlContext))
}

/**
 * Read and validate the index.
 *
 * A missing file is an empty gallery rather than an error: a fresh deployment
 * has no index until the first sync. A file that exists but does not match the
 * schema IS an error, because silently returning `[]` would make every photo
 * disappear with no explanation.
 */
export async function readGalleryIndex(
  indexPath: string
): Promise<GalleryIndex> {
  let contents: string

  try {
    contents = await readFile(indexPath, 'utf8')
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ENOENT')) {
      return {
        schemaVersion: GALLERY_SCHEMA_VERSION,
        pipelineVersion: GALLERY_PIPELINE_VERSION,
        generatedAt: new Date(0).toISOString(),
        photos: []
      }
    }

    throw new GalleryIndexError('Unable to read the gallery index.', {
      cause: error
    })
  }

  let value: unknown

  try {
    value = JSON.parse(contents)
  } catch (error: unknown) {
    throw new GalleryIndexError('The gallery index is not valid JSON.', {
      cause: error
    })
  }

  if (!isGalleryIndex(value)) {
    throw new GalleryIndexError(
      'The gallery index does not match the current schema.'
    )
  }

  return value
}

export function isGalleryIndex(value: unknown): value is GalleryIndex {
  if (
    !isRecord(value) ||
    value.schemaVersion !== GALLERY_SCHEMA_VERSION ||
    value.pipelineVersion !== GALLERY_PIPELINE_VERSION ||
    !isIsoDate(value.generatedAt) ||
    !Array.isArray(value.photos)
  ) {
    return false
  }

  const ids = new Set<string>()
  const filenames = new Set<string>()

  for (const photo of value.photos) {
    if (
      !isPhotoIndexItem(photo) ||
      ids.has(photo.id) ||
      filenames.has(photo.filename)
    ) {
      return false
    }

    ids.add(photo.id)
    filenames.add(photo.filename)
  }

  return true
}

export function toPublicPhoto(
  photo: PhotoIndexItem,
  urlContext: PhotoUrlContext = LOCAL_URL_CONTEXT
): GalleryPhoto {
  const result: GalleryPhoto = {
    id: photo.id,
    filename: photo.filename,
    thumbnail: resolvePhotoUrl(photo.storage.thumbnail, photo, urlContext),
    preview: resolvePhotoUrl(photo.storage.preview, photo, urlContext),
    width: photo.width,
    height: photo.height
  }

  copyOptional(result, photo, 'takenAt')
  copyOptional(result, photo, 'cameraMake')
  copyOptional(result, photo, 'cameraModel')
  copyOptional(result, photo, 'lens')
  copyOptional(result, photo, 'focalLength')
  copyOptional(result, photo, 'focalLength35mm')
  copyOptional(result, photo, 'aperture')
  copyOptional(result, photo, 'shutterSpeed')
  copyOptional(result, photo, 'iso')

  return result
}

/**
 * Build the URL for one stored key.
 *
 * Resolution is per photo, not global: when object storage is selected but this
 * revision was never uploaded, the local URL is returned so a partially
 * published library degrades to a missing CDN copy instead of broken images.
 */
export function resolvePhotoUrl(
  storageKey: string,
  photo: PhotoIndexItem,
  urlContext: PhotoUrlContext
): string {
  if (urlContext.source === 'local') {
    return `${MEDIA_ROUTE_PREFIX}${storageKey}`
  }

  const remote = photo.remote
  const base = urlContext.publicBaseUrl?.replace(/\/+$/, '')

  if (base && remote && remote.revision === photo.source.revision) {
    const prefix = urlContext.prefix?.replace(/^\/+|\/+$/g, '')
    return prefix
      ? `${base}/${prefix}/${storageKey}`
      : `${base}/${storageKey}`
  }

  return `${MEDIA_ROUTE_PREFIX}${storageKey}`
}

function isPhotoIndexItem(value: unknown): value is PhotoIndexItem {
  if (
    !isRecord(value) ||
    !isHash(value.id) ||
    !isNonEmptyString(value.filename) ||
    !isPositiveInteger(value.width) ||
    !isPositiveInteger(value.height) ||
    !isRecord(value.source) ||
    !isNonNegativeInteger(value.source.size) ||
    !isNonNegativeNumber(value.source.mtimeMs) ||
    !isHash(value.source.revision) ||
    !isRecord(value.storage)
  ) {
    return false
  }

  const expectedPrefix = `${value.id}-${value.source.revision}-`

  return (
    isStorageKey(value.storage.thumbnail, expectedPrefix, 'thumbnail') &&
    isStorageKey(value.storage.preview, expectedPrefix, 'preview') &&
    isOptionalRemoteState(value.remote) &&
    isOptionalIsoDate(value.takenAt) &&
    isOptionalNonEmptyString(value.cameraMake) &&
    isOptionalNonEmptyString(value.cameraModel) &&
    isOptionalNonEmptyString(value.lens) &&
    isOptionalPositiveNumber(value.focalLength) &&
    isOptionalPositiveInteger(value.focalLength35mm) &&
    isOptionalPositiveNumber(value.aperture) &&
    isOptionalNonEmptyString(value.shutterSpeed) &&
    isOptionalPositiveInteger(value.iso)
  )
}

function isOptionalRemoteState(value: unknown): boolean {
  if (value === undefined) {
    return true
  }

  return (
    isRecord(value) &&
    value.provider === 's3' &&
    isHash(value.revision) &&
    isIsoDate(value.uploadedAt)
  )
}

/**
 * A stored key must be a bare filename matching this exact revision's
 * fingerprint. This is also the path-traversal guard: `../` or an absolute path
 * cannot satisfy the pattern.
 */
function isStorageKey(
  value: unknown,
  expectedPrefix: string,
  variant: 'thumbnail' | 'preview'
): value is string {
  if (typeof value !== 'string' || !value.startsWith(expectedPrefix)) {
    return false
  }

  return (
    GENERATED_IMAGE_FILENAME_PATTERN.test(value) &&
    value.endsWith(`-${variant}.webp`)
  )
}

/**
 * Copy an optional field when present.
 *
 * The index item no longer extends the public photo (it stores keys, not URLs),
 * so the source is typed by the optional metadata fields they still share.
 */
function copyOptional<Key extends keyof OptionalPhotoMetadata>(
  target: GalleryPhoto,
  source: OptionalPhotoMetadata,
  key: Key
): void {
  if (source[key] !== undefined) {
    Object.assign(target, { [key]: source[key] })
  }
}

type OptionalPhotoMetadata = Pick<
  GalleryPhoto,
  | 'takenAt'
  | 'cameraMake'
  | 'cameraModel'
  | 'lens'
  | 'focalLength'
  | 'focalLength35mm'
  | 'aperture'
  | 'shutterSpeed'
  | 'iso'
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && GENERATED_IMAGE_HASH_PATTERN.test(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && isPositiveNumber(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && isNonNegativeNumber(value)
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

function isOptionalIsoDate(value: unknown): boolean {
  return value === undefined || isIsoDate(value)
}

function isOptionalNonEmptyString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value)
}

function isOptionalPositiveNumber(value: unknown): boolean {
  return value === undefined || isPositiveNumber(value)
}

function isOptionalPositiveInteger(value: unknown): boolean {
  return value === undefined || isPositiveInteger(value)
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code
}
