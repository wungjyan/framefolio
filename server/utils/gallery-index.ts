import { readFile } from 'node:fs/promises'

import {
  GALLERY_PIPELINE_VERSION,
  GALLERY_SCHEMA_VERSION,
  GENERATED_IMAGE_FILENAME_PATTERN,
  GENERATED_IMAGE_HASH_LENGTH
} from '../../shared/constants/gallery'
import type {
  GalleryIndex,
  GalleryPhoto,
  PhotoIndexItem,
  PhotosResponse
} from '../../shared/types/photo'

const GENERATED_IMAGE_HASH_PATTERN = new RegExp(
  `^[a-f0-9]{${GENERATED_IMAGE_HASH_LENGTH}}$`
)

export class GalleryIndexError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'GalleryIndexError'
  }
}

export async function readPublicGalleryPhotos(
  indexPath: string
): Promise<PhotosResponse> {
  let contents: string

  try {
    contents = await readFile(indexPath, 'utf8')
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ENOENT')) {
      return []
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
    throw new GalleryIndexError('The gallery index does not match the current schema.')
  }

  return value.photos.map(toPublicPhoto)
}

export function isGalleryIndex(value: unknown): value is GalleryIndex {
  if (!isRecord(value)
    || value.schemaVersion !== GALLERY_SCHEMA_VERSION
    || value.pipelineVersion !== GALLERY_PIPELINE_VERSION
    || !isIsoDate(value.generatedAt)
    || !Array.isArray(value.photos)) {
    return false
  }

  const ids = new Set<string>()
  const filenames = new Set<string>()

  for (const photo of value.photos) {
    if (!isPhotoIndexItem(photo)
      || ids.has(photo.id)
      || filenames.has(photo.filename)) {
      return false
    }

    ids.add(photo.id)
    filenames.add(photo.filename)
  }

  return true
}

export function toPublicPhoto(photo: PhotoIndexItem): GalleryPhoto {
  const result: GalleryPhoto = {
    id: photo.id,
    filename: photo.filename,
    thumbnail: photo.thumbnail,
    preview: photo.preview,
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

function isPhotoIndexItem(value: unknown): value is PhotoIndexItem {
  if (!isRecord(value)
    || !isHash(value.id)
    || !isNonEmptyString(value.filename)
    || !isPositiveInteger(value.width)
    || !isPositiveInteger(value.height)
    || !isRecord(value.source)
    || !isNonNegativeInteger(value.source.size)
    || !isNonNegativeNumber(value.source.mtimeMs)
    || !isHash(value.source.revision)) {
    return false
  }

  const expectedPrefix = `/media/${value.id}-${value.source.revision}-`

  return isGeneratedImageUrl(value.thumbnail, expectedPrefix, 'thumbnail')
    && isGeneratedImageUrl(value.preview, expectedPrefix, 'preview')
    && isOptionalIsoDate(value.takenAt)
    && isOptionalNonEmptyString(value.cameraMake)
    && isOptionalNonEmptyString(value.cameraModel)
    && isOptionalNonEmptyString(value.lens)
    && isOptionalPositiveNumber(value.focalLength)
    && isOptionalPositiveInteger(value.focalLength35mm)
    && isOptionalPositiveNumber(value.aperture)
    && isOptionalNonEmptyString(value.shutterSpeed)
    && isOptionalPositiveInteger(value.iso)
}

function isGeneratedImageUrl(
  value: unknown,
  expectedPrefix: string,
  variant: 'thumbnail' | 'preview'
): value is string {
  if (typeof value !== 'string' || !value.startsWith(expectedPrefix)) {
    return false
  }

  const filename = value.slice('/media/'.length)
  return GENERATED_IMAGE_FILENAME_PATTERN.test(filename)
    && filename.endsWith(`-${variant}.webp`)
}

function copyOptional<Key extends keyof GalleryPhoto>(
  target: GalleryPhoto,
  source: GalleryPhoto,
  key: Key
): void {
  if (source[key] !== undefined) {
    Object.assign(target, { [key]: source[key] })
  }
}

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
  return typeof value === 'string'
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value
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
