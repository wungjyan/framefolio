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
  cleanStaleTemporaryFiles,
  createTemporaryPath
} from '../../shared/node/temporary-files'
import {
  createPhotoId,
  createPhotoRevision as createPhotoRevisionHash,
  normalizeRelativePath,
  sourcesMatch
} from '../../shared/node/photo-fingerprint'
import {
  GENERATED_IMAGE_COLOURSPACE,
  GENERATED_IMAGE_EXTENSION,
  GENERATED_IMAGE_FILENAME_PATTERN,
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
  PhotoRemoteState,
  PhotoSourceState
} from '../../shared/types/photo'
import type {
  GallerySyncError,
  GallerySyncProgress,
  GallerySyncSummary,
  RemotePublisher
} from '../../shared/types/sync'

export type {
  GallerySyncError,
  GallerySyncProgress,
  GallerySyncSummary,
  RemotePublisher
} from '../../shared/types/sync'
// Re-export the pure fingerprint helpers so existing callers of this module
// keep working after they moved to `shared/` (the admin API needs them without
// loading sharp).
export {
  createPhotoId,
  normalizeRelativePath,
  sourcesMatch
} from '../../shared/node/photo-fingerprint'

const EXIF_FIELDS = [
  'Make',
  'Model',
  'Lens',
  'LensInfo',
  'LensModel',
  'FocalLength',
  'FocalLengthIn35mmFormat',
  'FNumber',
  'ExposureTime',
  'ISO',
  'DateTimeOriginal',
  'CreateDate'
]

const TEMPORARY_FILE_STALE_AFTER_MS = 60 * 60 * 1000

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
  FocalLengthIn35mmFormat?: unknown
  FNumber?: unknown
  ExposureTime?: unknown
  ISO?: unknown
  DateTimeOriginal?: unknown
  CreateDate?: unknown
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
  /**
   * Called as the pipeline advances. Used by the web-triggered job runner to
   * stream progress to the admin UI; the CLI ignores it.
   */
  onProgress?: (progress: GallerySyncProgress) => void
  /**
   * When provided, every generated derivative is uploaded after it is written,
   * and each photo records the uploaded revision. Omitted means local-only.
   */
  remote?: RemotePublisher
}

export async function ensureGalleryDirectories(
  paths: GalleryPaths
): Promise<void> {
  await Promise.all([
    mkdir(paths.originals, { recursive: true }),
    mkdir(paths.generated, { recursive: true }),
    mkdir(paths.incoming, { recursive: true }),
    mkdir(paths.trash, { recursive: true }),
    mkdir(paths.state, { recursive: true })
  ])
}

export function createPhotoRevision(
  relativePath: string,
  source: Pick<PhotoSourceState, 'size' | 'mtimeMs'>,
  pipelineVersion: number = GALLERY_PIPELINE_VERSION
): string {
  return createPhotoRevisionHash(relativePath, source, pipelineVersion)
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
    return `1/${Math.round(reciprocal)}s`
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
  await cleanStaleTemporaryFiles(
    paths.generated,
    TEMPORARY_FILE_STALE_AFTER_MS
  ).then(removed => {
    for (const filename of removed) {
      warnings.push(`Removed stale temporary file: ${filename}`)
    }
  })

  const previousIndex = await readGalleryIndex(paths.index, warnings)
  const previousByFilename = new Map(
    previousIndex?.photos.map(photo => [photo.filename, photo]) ?? []
  )
  const sourcePhotos = await scanOriginalPhotos(paths.originals)
  const sourceFilenames = new Set(sourcePhotos.map(photo => photo.relativePath))
  const nextPhotos: PhotoIndexItem[] = []
  const reportProgress = options.onProgress
  const remote = options.remote
  const now = options.now ?? (() => new Date())
  let completed = 0

  summary.deleted = [...previousByFilename.keys()].filter(
    filename => !sourceFilenames.has(filename)
  ).length

  // List the bucket once up front, so "is this photo already published?" can be
  // answered from what is actually stored rather than from the index's claim.
  //
  // The index records that a revision was uploaded, but the objects can still
  // disappear underneath it: a delete from the provider dashboard, a lifecycle
  // rule, an interrupted replication, or a bucket restored from a backup. With
  // only the index to go on, the sync reported "skipped" and left the CDN
  // serving broken images forever, while the admin panel promised the next sync
  // would re-upload them.
  //
  // A failed listing degrades to the previous index-only behaviour rather than
  // forcing a full re-upload.
  let remoteKeys: Set<string> | undefined

  if (remote) {
    try {
      remoteKeys = new Set(await remote.list())
    } catch (error: unknown) {
      warnings.push(
        `Could not list object storage; assuming uploaded copies are intact: ${getErrorMessage(error)}`
      )
    }
  }

  reportProgress?.({
    phase: 'processing',
    completed: 0,
    total: sourcePhotos.length
  })

  for (const sourcePhoto of sourcePhotos) {
    const previousPhoto = previousByFilename.get(sourcePhoto.relativePath)
    const revision = createPhotoRevision(sourcePhoto.relativePath, sourcePhoto)
    const source: PhotoSourceState = {
      size: sourcePhoto.size,
      mtimeMs: sourcePhoto.mtimeMs,
      revision
    }

    // A photo may be skipped only when the local derivatives are current AND, if
    // object storage is in use, its copy is both current and actually present.
    // Without the revision check, a photo whose upload failed once would be
    // skipped forever: the local state never changes again, so the failure could
    // never self-heal. Without the presence check, an object removed from the
    // bucket would stay missing for the same reason.
    const remoteUpToDate =
      !remote ||
      (previousPhoto?.remote?.revision === revision &&
        (remoteKeys === undefined ||
          remoteDerivativesPresent(previousPhoto, remoteKeys)))

    if (
      previousPhoto &&
      previousIndex?.pipelineVersion === GALLERY_PIPELINE_VERSION &&
      remoteUpToDate &&
      sourcesMatch(previousPhoto.source, source) &&
      (await generatedFilesExist(previousPhoto, paths.generated))
    ) {
      nextPhotos.push(previousPhoto)
      summary.skipped += 1
      completed += 1
      reportProgress?.({
        phase: 'processing',
        completed,
        total: sourcePhotos.length,
        filename: sourcePhoto.relativePath
      })
      continue
    }

    try {
      const photo = await processPhoto(
        sourcePhoto,
        source,
        paths,
        warnings,
        remote,
        now
      )
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

    completed += 1
    reportProgress?.({
      phase: 'processing',
      completed,
      total: sourcePhotos.length,
      filename: sourcePhoto.relativePath
    })
  }

  nextPhotos.sort(comparePhotos)

  reportProgress?.({
    phase: 'finalising',
    completed,
    total: sourcePhotos.length
  })

  const index: GalleryIndex = {
    schemaVersion: GALLERY_SCHEMA_VERSION,
    pipelineVersion: GALLERY_PIPELINE_VERSION,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    photos: nextPhotos
  }

  await writeGalleryIndex(paths.index, index)
  await cleanUnreferencedGeneratedFiles(paths.generated, index.photos, errors)

  // Reconcile object storage against the index that was just written.
  //
  // This is what actually keeps the bucket in step with the gallery. The old
  // approach deleted only the derivatives of photos the *previous* index still
  // remembered, which missed two whole classes of leftover:
  //
  //   * a superseded revision — when a photo is re-edited its filename changes,
  //     so the previous revision's objects are referenced by nothing and were
  //     never removed, and
  //   * a removal that failed once — the index has already dropped the photo, so
  //     no later sync would ever look at it again.
  //
  // Both show up to the user as "I deleted it and it came back / never went
  // away". Comparing against the bucket itself fixes both, and is idempotent:
  // it deletes exactly the objects that are not referenced, whoever created
  // them. Local files are reconciled against the same reference set by
  // `cleanUnreferencedGeneratedFiles` above, so the two now agree.
  if (remote) {
    await reconcileRemoteDerivatives(remote, index.photos, remoteKeys, warnings)
  }

  reportProgress?.({
    phase: 'done',
    completed,
    total: sourcePhotos.length
  })

  return {
    index,
    summary,
    errors,
    warnings
  }
}

async function scanOriginalPhotos(
  originalsDirectory: string
): Promise<SourcePhoto[]> {
  const photos: SourcePhoto[] = []

  async function walk(
    directory: string,
    relativeDirectory = ''
  ): Promise<void> {
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
        !entry.isFile() ||
        !SUPPORTED_IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())
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
  photos.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, 'en')
  )

  return photos
}

async function processPhoto(
  sourcePhoto: SourcePhoto,
  source: PhotoSourceState,
  paths: GalleryPaths,
  warnings: string[],
  remote: RemotePublisher | undefined,
  now: () => Date
): Promise<PhotoIndexItem> {
  const id = createPhotoId(sourcePhoto.relativePath)
  const outputFiles = createOutputFiles(id, source.revision, paths.generated)
  const temporaryFiles = {
    thumbnail: createTemporaryPath(outputFiles.thumbnail.path),
    preview: createTemporaryPath(outputFiles.preview.path)
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

    // Upload after the local files are in place. A failure here is recorded and
    // the photo keeps its local derivatives: the index simply omits `remote`, so
    // reads fall back to /media rather than showing a broken CDN image.
    const remoteState = remote
      ? await publishToRemote(
          remote,
          [outputFiles.thumbnail.filename, outputFiles.preview.filename],
          [outputFiles.thumbnail.path, outputFiles.preview.path],
          source,
          sourcePhoto.relativePath,
          warnings,
          now
        )
      : undefined

    return {
      id,
      filename: sourcePhoto.relativePath,
      width: outputInfo.width,
      height: outputInfo.height,
      storage: {
        thumbnail: outputFiles.thumbnail.filename,
        preview: outputFiles.preview.filename
      },
      ...(remoteState ? { remote: remoteState } : {}),
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

/**
 * Upload this photo's derivatives and return the remote state to record.
 *
 * Returns undefined when the upload failed, which is deliberate: the index then
 * omits `remote`, so URL resolution falls back to the local media route for this
 * photo only. A transient object-storage failure must not hide the photo or
 * abort the whole sync.
 */
async function publishToRemote(
  remote: RemotePublisher,
  filenames: string[],
  filePaths: string[],
  source: PhotoSourceState,
  relativePath: string,
  warnings: string[],
  now: () => Date
): Promise<PhotoRemoteState | undefined> {
  try {
    for (let index = 0; index < filenames.length; index += 1) {
      await remote.upload(
        filenames[index] as string,
        filePaths[index] as string
      )
    }

    return {
      provider: 's3',
      revision: source.revision,
      uploadedAt: now().toISOString()
    }
  } catch (error: unknown) {
    warnings.push(
      `Uploaded locally but not to object storage: ${relativePath}: ${getErrorMessage(error)}`
    )

    return undefined
  }
}

/**
 * Whether both of a photo's derivatives are present in the bucket.
 *
 * Returns false when the previous record has no remote state at all, which is
 * what makes a photo whose upload never succeeded retry on the next run.
 */
function remoteDerivativesPresent(
  photo: PhotoIndexItem | undefined,
  remoteKeys: Set<string>
): boolean {
  if (!photo?.remote) {
    return false
  }

  return (
    remoteKeys.has(photo.storage.thumbnail) &&
    remoteKeys.has(photo.storage.preview)
  )
}

/**
 * Delete every object in the bucket that the index no longer references.
 *
 * Only keys matching the generated-derivative filename pattern are considered,
 * so a bucket shared with other content (or holding the operator's own files)
 * is never touched. Within that pattern, anything unreferenced is ours by
 * construction, which is why this can safely clean up objects the current index
 * has no record of.
 *
 * `storedKeys` is the listing taken at the start of the run. Using it rather
 * than listing again is safe in one direction only, which is the direction that
 * matters: objects uploaded during this run are referenced by the index we just
 * wrote, so they can never appear as orphans. The set can therefore only
 * under-report, never over-delete.
 *
 * Failures become warnings rather than errors: an orphan is a cleanup problem,
 * not a reason to fail the run. The run is idempotent, so the next sync retries
 * whatever did not go through — the retry the previous implementation never
 * performed.
 */
async function reconcileRemoteDerivatives(
  remote: RemotePublisher,
  photos: PhotoIndexItem[],
  storedKeys: Set<string> | undefined,
  warnings: string[]
): Promise<void> {
  if (!storedKeys) {
    // The earlier listing failed; that was already warned about. Deleting on an
    // unknown bucket state is exactly what must not happen.
    return
  }

  const referenced = new Set(
    photos
      .flatMap(photo => [photo.storage.thumbnail, photo.storage.preview])
      .filter(key => GENERATED_IMAGE_FILENAME_PATTERN.test(key))
  )

  const orphans = [...storedKeys]
    .filter(key => GENERATED_IMAGE_FILENAME_PATTERN.test(key))
    .filter(key => !referenced.has(key))

  for (const key of orphans) {
    try {
      await remote.remove(key)
    } catch (error: unknown) {
      warnings.push(
        `Could not remove unreferenced object ${key}: ${getErrorMessage(error)}`
      )
    }
  }

  if (orphans.length > 0) {
    warnings.push(
      `Removed ${orphans.length} unreferenced object(s) from object storage.`
    )
  }
}

async function generateImages(
  sourcePath: string,
  temporaryFiles: Record<ImageVariant, string>
): Promise<{ width: number; height: number }> {
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
): Promise<
  Omit<
    GalleryPhoto,
    'id' | 'filename' | 'thumbnail' | 'preview' | 'width' | 'height'
  >
> {
  let data: ExifData | undefined

  try {
    data = (await exifr.parse(sourcePhoto.absolutePath, {
      pick: EXIF_FIELDS,
      gps: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      makerNote: false,
      userComment: false
    })) as ExifData | undefined
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
    focalLength35mm: toPositiveInteger(data.FocalLengthIn35mmFormat),
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
      warnings.push(
        'Existing photos.json is invalid; rebuilding it from originals'
      )
      return undefined
    }

    return value
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      warnings.push(
        'Existing photos.json is malformed; rebuilding it from originals'
      )
      return undefined
    }

    throw error
  }
}

async function writeGalleryIndex(
  indexPath: string,
  index: GalleryIndex
): Promise<void> {
  // The temporary name must be unique per process: the admin button and the CLI
  // can sync concurrently, and a fixed `<index>.tmp` would let one process
  // rename the file out from under the other (observed as an ENOENT rename).
  const temporaryPath = createTemporaryPath(indexPath)

  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(index, null, 2)}\n`,
      'utf8'
    )
    await rename(temporaryPath, indexPath)
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

async function generatedFilesExist(
  photo: PhotoIndexItem,
  generatedDirectory: string
): Promise<boolean> {
  const filenames = [
    generatedFilenameFromKey(photo.storage.thumbnail),
    generatedFilenameFromKey(photo.storage.preview)
  ]

  if (filenames.some(filename => filename === undefined)) {
    return false
  }

  return (
    await Promise.all(
      filenames.map(async filename => {
        try {
          await access(join(generatedDirectory, filename as string))
          return true
        } catch {
          return false
        }
      })
    )
  ).every(Boolean)
}

async function cleanUnreferencedGeneratedFiles(
  generatedDirectory: string,
  photos: PhotoIndexItem[],
  errors: GallerySyncError[]
): Promise<void> {
  const referencedFiles = new Set(
    photos
      .flatMap(photo => [photo.storage.thumbnail, photo.storage.preview])
      .map(generatedFilenameFromKey)
      .filter((filename): filename is string => filename !== undefined)
  )
  const entries = await readdir(generatedDirectory, { withFileTypes: true })

  await Promise.all(
    entries.map(async entry => {
      if (
        !entry.isFile() ||
        !GENERATED_IMAGE_FILENAME_PATTERN.test(entry.name) ||
        referencedFiles.has(entry.name)
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
    })
  )
}

function createOutputFiles(
  id: string,
  revision: string,
  generatedDirectory: string
) {
  return Object.fromEntries(
    Object.entries(IMAGE_VARIANTS).map(([variant, specification]) => {
      const filename = `${id}-${revision}-${specification.suffix}.${GENERATED_IMAGE_EXTENSION}`

      return [
        variant,
        {
          path: join(generatedDirectory, filename),
          // The index stores this bare filename; the URL is assembled at read
          // time so one index can serve both local and object storage.
          filename
        }
      ]
    })
  ) as Record<ImageVariant, { path: string; filename: string }>
}

/** Validate a stored key (a bare generated filename, never a URL). */
function generatedFilenameFromKey(key: string): string | undefined {
  return GENERATED_IMAGE_FILENAME_PATTERN.test(key) ? key : undefined
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

function normalizeDate(value: unknown): string | undefined {
  const date =
    value instanceof Date
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
  const number =
    typeof value === 'number'
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

  if (
    !Number.isInteger(value.pipelineVersion) ||
    !Array.isArray(value.photos)
  ) {
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
  if (!isRecord(value) || !isRecord(value.source) || !isRecord(value.storage)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.filename === 'string' &&
    typeof value.storage.thumbnail === 'string' &&
    typeof value.storage.preview === 'string' &&
    isPositiveFiniteNumber(value.width) &&
    isPositiveFiniteNumber(value.height) &&
    isNonNegativeFiniteNumber(value.source.size) &&
    isNonNegativeFiniteNumber(value.source.mtimeMs) &&
    typeof value.source.revision === 'string' &&
    isOptionalRemoteState(value.remote)
  )
}

function isOptionalRemoteState(value: unknown): boolean {
  if (value === undefined) {
    return true
  }

  return (
    isRecord(value) &&
    value.provider === 's3' &&
    typeof value.revision === 'string' &&
    typeof value.uploadedAt === 'string'
  )
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
