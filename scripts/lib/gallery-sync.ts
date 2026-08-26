import { createHash, randomUUID } from 'node:crypto'
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { extname, join } from 'node:path'

import exifr from 'exifr'
import sharp from 'sharp'

import {
  GENERATED_IMAGE_COLOURSPACE,
  GENERATED_IMAGE_EXTENSION,
  GALLERY_PIPELINE_VERSION,
  GALLERY_SCHEMA_VERSION,
  IMAGE_RESIZE_OPTIONS,
  IMAGE_VARIANTS,
  SUPPORTED_IMAGE_EXTENSIONS,
  type ImageVariant
} from '../../shared/constants/gallery'
import {
  resolveGalleryPaths,
  type GalleryPaths
} from '../../shared/node/gallery-paths'
import type {
  GalleryIndex,
  GalleryPhoto,
  PhotoIndexItem,
  PhotoSourceState
} from '../../shared/types/photo'

const HASH_LENGTH = 16
const GENERATED_FILE_PATTERN = new RegExp(
  `^[a-f0-9]{${HASH_LENGTH}}-[a-f0-9]{${HASH_LENGTH}}-(thumbnail|preview)\\.${GENERATED_IMAGE_EXTENSION}$`
)

const EXIF_FIELDS = [
  'Make',
  'Model',
  'Lens',
  'LensInfo',
  'LensModel',
  'FocalLength',
  'FNumber',
  'ExposureTime',
  'ISO',
  'DateTimeOriginal',
  'CreateDate'
]

interface SourcePhoto {
  absolutePath: string
  relativePath: string
  size: number
  mtimeMs: number
}

interface LoadedGalleryIndex {
  pipelineVersion: number
  photos: PhotoIndexItem[]
}

interface ExifData {
  Make?: unknown
  Model?: unknown
  Lens?: unknown
  LensInfo?: unknown
  LensModel?: unknown
  FocalLength?: unknown
  FNumber?: unknown
  ExposureTime?: unknown
  ISO?: unknown
  DateTimeOriginal?: unknown
  CreateDate?: unknown
}

export interface GallerySyncSummary {
  added: number
  updated: number
  skipped: number
  deleted: number
  failed: number
}

export interface GallerySyncError {
  filename: string
  message: string
}

export interface GallerySyncResult {
  index: GalleryIndex
  summary: GallerySyncSummary
  errors: GallerySyncError[]
  warnings: string[]
}

export interface RunGallerySyncOptions {
  paths?: GalleryPaths
  now?: () => Date
}

export async function ensureGalleryDirectories(paths: GalleryPaths): Promise<void> {
  await Promise.all([
    mkdir(paths.originals, { recursive: true }),
    mkdir(paths.generated, { recursive: true })
  ])
}

export function createPhotoId(relativePath: string): string {
  return shortHash(normalizeRelativePath(relativePath))
}

export function createPhotoRevision(
  relativePath: string,
  source: Pick<PhotoSourceState, 'size' | 'mtimeMs'>,
  pipelineVersion: number = GALLERY_PIPELINE_VERSION
): string {
  return shortHash([
    normalizeRelativePath(relativePath),
    String(source.size),
    String(source.mtimeMs),
    String(pipelineVersion)
  ].join('\0'))
}

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replaceAll('\\', '/').normalize('NFC')
}

export function normalizeShutterSpeed(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim()

    if (!normalized) {
      return undefined
    }

    return normalized.endsWith('s') ? normalized : `${normalized}s`
  }

  const exposure = toPositiveNumber(value)

  if (exposure === undefined) {
    return undefined
  }

  if (exposure >= 1) {
    return `${formatNumber(exposure)}s`
  }

  const reciprocal = 1 / exposure

  if (reciprocal >= 2) {
    return `1/${formatNumber(reciprocal)}s`
  }

  return `${formatNumber(exposure)}s`
}

export async function runGallerySync(
  options: RunGallerySyncOptions = {}
): Promise<GallerySyncResult> {
  const paths = options.paths ?? resolveGalleryPaths()
  const warnings: string[] = []
  const errors: GallerySyncError[] = []
  const summary: GallerySyncSummary = {
    added: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    failed: 0
  }

  await ensureGalleryDirectories(paths)
  await cleanTemporaryFiles(paths.generated, errors)

  const previousIndex = await readGalleryIndex(paths.index, warnings)
  const previousByFilename = new Map(
    previousIndex?.photos.map(photo => [photo.filename, photo]) ?? []
  )
  const sourcePhotos = await scanOriginalPhotos(paths.originals)
  const sourceFilenames = new Set(sourcePhotos.map(photo => photo.relativePath))
  const nextPhotos: PhotoIndexItem[] = []

  summary.deleted = [...previousByFilename.keys()]
    .filter(filename => !sourceFilenames.has(filename))
    .length

  for (const sourcePhoto of sourcePhotos) {
    const previousPhoto = previousByFilename.get(sourcePhoto.relativePath)
    const revision = createPhotoRevision(sourcePhoto.relativePath, sourcePhoto)
    const source: PhotoSourceState = {
      size: sourcePhoto.size,
      mtimeMs: sourcePhoto.mtimeMs,
      revision
    }

    if (
      previousPhoto
      && previousIndex?.pipelineVersion === GALLERY_PIPELINE_VERSION
      && sourcesMatch(previousPhoto.source, source)
      && await generatedFilesExist(previousPhoto, paths.generated)
    ) {
      nextPhotos.push(previousPhoto)
      summary.skipped += 1
      continue
    }

    try {
      const photo = await processPhoto(sourcePhoto, source, paths, warnings)
      nextPhotos.push(photo)

      if (previousPhoto) {
        summary.updated += 1
      } else {
        summary.added += 1
      }
    } catch (error: unknown) {
      summary.failed += 1
      errors.push({
        filename: sourcePhoto.relativePath,
        message: getErrorMessage(error)
      })

      if (previousPhoto) {
        nextPhotos.push(previousPhoto)
      }
    }
  }

  nextPhotos.sort(comparePhotos)

  const index: GalleryIndex = {
    schemaVersion: GALLERY_SCHEMA_VERSION,
    pipelineVersion: GALLERY_PIPELINE_VERSION,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    photos: nextPhotos
  }

  await writeGalleryIndex(paths.index, index)
  await cleanUnreferencedGeneratedFiles(paths.generated, index.photos, errors)

  return {
    index,
    summary,
    errors,
    warnings
  }
}

async function scanOriginalPhotos(originalsDirectory: string): Promise<SourcePhoto[]> {
  const photos: SourcePhoto[] = []

  async function walk(directory: string, relativeDirectory = ''): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))

    for (const entry of entries) {
      const relativePath = normalizeRelativePath(
        relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      )
      const absolutePath = join(directory, entry.name)

      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath)
        continue
      }

      if (
        !entry.isFile()
        || !SUPPORTED_IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())
      ) {
        continue
      }

      const fileStat = await stat(absolutePath)
      photos.push({
        absolutePath,
        relativePath,
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs
      })
    }
  }

  await walk(originalsDirectory)
  photos.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'))

  return photos
}

async function processPhoto(
  sourcePhoto: SourcePhoto,
  source: PhotoSourceState,
  paths: GalleryPaths,
  warnings: string[]
): Promise<PhotoIndexItem> {
  const id = createPhotoId(sourcePhoto.relativePath)
  const outputFiles = createOutputFiles(id, source.revision, paths.generated)
  const temporarySuffix = `${process.pid}-${randomUUID()}.tmp`
  const temporaryFiles = {
    thumbnail: `${outputFiles.thumbnail.path}.${temporarySuffix}`,
    preview: `${outputFiles.preview.path}.${temporarySuffix}`
  }
  const finalizedFiles: string[] = []

  try {
    const [metadata, outputInfo] = await Promise.all([
      readExifData(sourcePhoto, warnings),
      generateImages(sourcePhoto.absolutePath, temporaryFiles)
    ])

    await rename(temporaryFiles.thumbnail, outputFiles.thumbnail.path)
    finalizedFiles.push(outputFiles.thumbnail.path)
    await rename(temporaryFiles.preview, outputFiles.preview.path)
    finalizedFiles.push(outputFiles.preview.path)

    return {
      id,
      filename: sourcePhoto.relativePath,
      thumbnail: outputFiles.thumbnail.url,
      preview: outputFiles.preview.url,
      width: outputInfo.width,
      height: outputInfo.height,
      ...metadata,
      source
    }
  } catch (error: unknown) {
    await Promise.all([
      ...Object.values(temporaryFiles).map(file => rm(file, { force: true })),
      ...finalizedFiles.map(file => rm(file, { force: true }))
    ])
    throw error
  }
}

async function generateImages(
  sourcePath: string,
  temporaryFiles: Record<ImageVariant, string>
): Promise<{ width: number, height: number }> {
  const baseImage = sharp(sourcePath, {
    failOn: 'error',
    sequentialRead: true
  })
    .rotate()
    .toColourspace(GENERATED_IMAGE_COLOURSPACE)

  const [sourceMetadata] = await Promise.all([
    sharp(sourcePath).metadata(),
    generateVariant(baseImage.clone(), 'thumbnail', temporaryFiles.thumbnail),
    generateVariant(baseImage.clone(), 'preview', temporaryFiles.preview)
  ])

  const width = sourceMetadata.autoOrient?.width ?? sourceMetadata.width
  const height = sourceMetadata.autoOrient?.height ?? sourceMetadata.height

  if (!width || !height) {
    throw new Error('Sharp did not return generated image dimensions')
  }

  return { width, height }
}

async function generateVariant(
  image: sharp.Sharp,
  variant: ImageVariant,
  outputPath: string
): Promise<sharp.OutputInfo> {
  const specification = IMAGE_VARIANTS[variant]

  return image
    .resize({
      width: specification.maxEdge,
      height: specification.maxEdge,
      ...IMAGE_RESIZE_OPTIONS
    })
    .webp({ quality: specification.quality })
    .toFile(outputPath)
}

async function readExifData(
  sourcePhoto: SourcePhoto,
  warnings: string[]
): Promise<Omit<GalleryPhoto, 'id' | 'filename' | 'thumbnail' | 'preview' | 'width' | 'height'>> {
  let data: ExifData | undefined

  try {
    data = await exifr.parse(sourcePhoto.absolutePath, {
      pick: EXIF_FIELDS,
      gps: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      makerNote: false,
      userComment: false
    }) as ExifData | undefined
  } catch (error: unknown) {
    warnings.push(
      `${sourcePhoto.relativePath}: EXIF unavailable (${getErrorMessage(error)})`
    )
    return {}
  }

  if (!data) {
    return {}
  }

  const metadata = {
    takenAt: normalizeDate(data.DateTimeOriginal ?? data.CreateDate),
    cameraMake: toCleanString(data.Make),
    cameraModel: toCleanString(data.Model),
    lens: toCleanString(data.LensModel ?? data.Lens ?? data.LensInfo),
    focalLength: toPositiveNumber(data.FocalLength),
    aperture: toPositiveNumber(data.FNumber),
    shutterSpeed: normalizeShutterSpeed(data.ExposureTime),
    iso: toPositiveInteger(data.ISO)
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  )
}

async function readGalleryIndex(
  indexPath: string,
  warnings: string[]
): Promise<LoadedGalleryIndex | undefined> {
  let rawIndex: string

  try {
    rawIndex = await readFile(indexPath, 'utf8')
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ENOENT')) {
      return undefined
    }

    throw error
  }

  try {
    const value: unknown = JSON.parse(rawIndex)

    if (!isLoadedGalleryIndex(value)) {
      warnings.push('Existing photos.json is invalid; rebuilding it from originals')
      return undefined
    }

    return value
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      warnings.push('Existing photos.json is malformed; rebuilding it from originals')
      return undefined
    }

    throw error
  }
}

async function writeGalleryIndex(indexPath: string, index: GalleryIndex): Promise<void> {
  const temporaryPath = `${indexPath}.tmp`

  await writeFile(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, indexPath)
}

async function generatedFilesExist(
  photo: PhotoIndexItem,
  generatedDirectory: string
): Promise<boolean> {
  const filenames = [
    generatedFilenameFromUrl(photo.thumbnail),
    generatedFilenameFromUrl(photo.preview)
  ]

  if (filenames.some(filename => filename === undefined)) {
    return false
  }

  return (await Promise.all(
    filenames.map(async (filename) => {
      try {
        await access(join(generatedDirectory, filename as string))
        return true
      } catch {
        return false
      }
    })
  )).every(Boolean)
}

async function cleanUnreferencedGeneratedFiles(
  generatedDirectory: string,
  photos: PhotoIndexItem[],
  errors: GallerySyncError[]
): Promise<void> {
  const referencedFiles = new Set(
    photos.flatMap(photo => [photo.thumbnail, photo.preview])
      .map(generatedFilenameFromUrl)
      .filter((filename): filename is string => filename !== undefined)
  )
  const entries = await readdir(generatedDirectory, { withFileTypes: true })

  await Promise.all(entries.map(async (entry) => {
    if (
      !entry.isFile()
      || !GENERATED_FILE_PATTERN.test(entry.name)
      || referencedFiles.has(entry.name)
    ) {
      return
    }

    try {
      await rm(join(generatedDirectory, entry.name), { force: true })
    } catch (error: unknown) {
      errors.push({
        filename: entry.name,
        message: `unable to remove stale generated file: ${getErrorMessage(error)}`
      })
    }
  }))
}

async function cleanTemporaryFiles(
  generatedDirectory: string,
  errors: GallerySyncError[]
): Promise<void> {
  const entries = await readdir(generatedDirectory, { withFileTypes: true })

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || !entry.name.endsWith('.tmp')) {
      return
    }

    try {
      await rm(join(generatedDirectory, entry.name), { force: true })
    } catch (error: unknown) {
      errors.push({
        filename: entry.name,
        message: `unable to remove temporary file: ${getErrorMessage(error)}`
      })
    }
  }))
}

function createOutputFiles(id: string, revision: string, generatedDirectory: string) {
  return Object.fromEntries(
    Object.entries(IMAGE_VARIANTS).map(([variant, specification]) => {
      const filename = `${id}-${revision}-${specification.suffix}.${GENERATED_IMAGE_EXTENSION}`

      return [variant, {
        path: join(generatedDirectory, filename),
        url: `/media/${filename}`
      }]
    })
  ) as Record<ImageVariant, { path: string, url: string }>
}

function generatedFilenameFromUrl(url: string): string | undefined {
  const prefix = '/media/'

  if (!url.startsWith(prefix)) {
    return undefined
  }

  const filename = url.slice(prefix.length)
  return GENERATED_FILE_PATTERN.test(filename) ? filename : undefined
}

function sourcesMatch(left: PhotoSourceState, right: PhotoSourceState): boolean {
  return left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.revision === right.revision
}

function comparePhotos(left: PhotoIndexItem, right: PhotoIndexItem): number {
  if (left.takenAt && right.takenAt && left.takenAt !== right.takenAt) {
    return right.takenAt.localeCompare(left.takenAt)
  }

  if (left.takenAt && !right.takenAt) {
    return -1
  }

  if (!left.takenAt && right.takenAt) {
    return 1
  }

  return left.filename.localeCompare(right.filename, 'en', {
    numeric: true,
    sensitivity: 'base'
  })
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, HASH_LENGTH)
}

function normalizeDate(value: unknown): string | undefined {
  const date = value instanceof Date
    ? value
    : typeof value === 'string' || typeof value === 'number'
      ? new Date(value)
      : undefined

  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined
}

function toCleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized || undefined
}

function toPositiveNumber(value: unknown): number | undefined {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : undefined

  return number !== undefined && Number.isFinite(number) && number > 0
    ? number
    : undefined
}

function toPositiveInteger(value: unknown): number | undefined {
  const number = Array.isArray(value) ? value[0] : value
  const normalized = toPositiveNumber(number)
  return normalized === undefined ? undefined : Math.round(normalized)
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(6)).toString()
}

function isLoadedGalleryIndex(value: unknown): value is LoadedGalleryIndex {
  if (!isRecord(value) || value.schemaVersion !== GALLERY_SCHEMA_VERSION) {
    return false
  }

  if (!Number.isInteger(value.pipelineVersion) || !Array.isArray(value.photos)) {
    return false
  }

  const filenames = new Set<string>()

  for (const photo of value.photos) {
    if (!isPhotoIndexItem(photo) || filenames.has(photo.filename)) {
      return false
    }

    filenames.add(photo.filename)
  }

  return true
}

function isPhotoIndexItem(value: unknown): value is PhotoIndexItem {
  if (!isRecord(value) || !isRecord(value.source)) {
    return false
  }

  return ['id', 'filename', 'thumbnail', 'preview'].every(
    key => typeof value[key] === 'string'
  )
    && isPositiveFiniteNumber(value.width)
    && isPositiveFiniteNumber(value.height)
    && isNonNegativeFiniteNumber(value.source.size)
    && isNonNegativeFiniteNumber(value.source.mtimeMs)
    && typeof value.source.revision === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
