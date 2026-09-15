import { readdir, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'

import {
  GALLERY_PIPELINE_VERSION,
  SUPPORTED_IMAGE_EXTENSIONS
} from '../../shared/constants/gallery'
import {
  createPhotoId,
  createPhotoRevision,
  normalizeRelativePath
} from '../../shared/node/photo-fingerprint'
import type { AdminPhoto, AdminPhotoState } from '../../shared/types/admin'
import type { GalleryIndex, PhotoIndexItem } from '../../shared/types/photo'

export interface OriginalsScanEntry {
  relativePath: string
  absolutePath: string
  size: number
  mtimeMs: number
}

/**
 * Walk `originals/` and stat every supported image.
 *
 * This deliberately imports no image library: the admin API runs in the request
 * path, where native image code is forbidden (a corrupt file could otherwise
 * crash the web server). Only size and mtime are needed to detect changes.
 */
export async function scanOriginalFiles(
  originalsDirectory: string
): Promise<OriginalsScanEntry[]> {
  const entries: OriginalsScanEntry[] = []

  async function walk(
    directory: string,
    relativeDirectory = ''
  ): Promise<void> {
    let directoryEntries
    try {
      directoryEntries = await readdir(directory, { withFileTypes: true })
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw error
    }

    directoryEntries.sort((left, right) =>
      left.name.localeCompare(right.name, 'en')
    )

    for (const entry of directoryEntries) {
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
      entries.push({
        relativePath,
        absolutePath,
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs
      })
    }
  }

  await walk(originalsDirectory)
  entries.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, 'en')
  )

  return entries
}

/**
 * Combine the published index with what is currently on disk.
 *
 * The result explains, per photo, what pressing "sync now" would do. This is
 * what powers the "pending changes" banner, and it is why the admin UI can be
 * explicit about uploads and deletions not being live yet.
 */
export function buildAdminPhotos(
  index: GalleryIndex,
  originals: OriginalsScanEntry[]
): AdminPhoto[] {
  const publishedByFilename = new Map(
    index.photos.map(photo => [photo.filename, photo])
  )
  const onDisk = new Set(originals.map(entry => entry.relativePath))
  const photos: AdminPhoto[] = []

  // Photos present on disk: either published and unchanged, or pending.
  for (const entry of originals) {
    const published = publishedByFilename.get(entry.relativePath)
    const revision = createPhotoRevision(
      entry.relativePath,
      entry,
      GALLERY_PIPELINE_VERSION
    )

    if (!published) {
      photos.push({
        ...toAdminPhotoFromScan(entry, revision),
        state: 'added'
      })
      continue
    }

    const unchanged =
      published.source.size === entry.size &&
      published.source.mtimeMs === entry.mtimeMs &&
      published.source.revision === revision

    photos.push({
      ...toAdminPhoto(published),
      // A changed file keeps the previously published derivatives visible until
      // the next sync regenerates them.
      state: unchanged ? 'unchanged' : 'changed'
    })
  }

  // Photos still published but no longer on disk: deleted, awaiting a sync.
  for (const published of index.photos) {
    if (onDisk.has(published.filename)) {
      continue
    }

    photos.push({
      ...toAdminPhoto(published),
      state: 'pending-delete'
    })
  }

  photos.sort((left, right) =>
    left.filename.localeCompare(right.filename, 'en', { numeric: true })
  )

  return photos
}

export function summarizePending(
  photos: AdminPhoto[]
): { added: number; changed: number; pendingDelete: number; total: number } {
  const count = (state: AdminPhotoState): number =>
    photos.filter(photo => photo.state === state).length

  const added = count('added')
  const changed = count('changed')
  const pendingDelete = count('pending-delete')

  return {
    added,
    changed,
    pendingDelete,
    total: added + changed + pendingDelete
  }
}

function toAdminPhoto(photo: PhotoIndexItem): AdminPhoto {
  return {
    id: photo.id,
    filename: photo.filename,
    width: photo.width,
    height: photo.height,
    storage: {
      thumbnail: photo.storage.thumbnail,
      preview: photo.storage.preview
    },
    source: {
      size: photo.source.size,
      mtimeMs: photo.source.mtimeMs,
      revision: photo.source.revision
    },
    ...(photo.remote ? { remote: photo.remote } : {}),
    state: 'unchanged',
    ...(photo.takenAt ? { takenAt: photo.takenAt } : {}),
    ...(photo.cameraMake ? { cameraMake: photo.cameraMake } : {}),
    ...(photo.cameraModel ? { cameraModel: photo.cameraModel } : {})
  }
}

/**
 * Describe a file that has never been published.
 *
 * It has no id or storage keys yet, because those are assigned during the sync
 * that actually processes it. The id is still derivable from the filename, so we
 * compute it for a stable UI key.
 */
function toAdminPhotoFromScan(
  entry: OriginalsScanEntry,
  revision: string
): Omit<AdminPhoto, 'state'> {
  return {
    id: createPhotoId(entry.relativePath),
    filename: entry.relativePath,
    width: 0,
    height: 0,
    storage: { thumbnail: '', preview: '' },
    source: {
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      revision
    }
  }
}

/**
 * Resolve a client-supplied relative filename inside `originals/`.
 *
 * Returns undefined for anything that could escape the directory. Note that
 * only the *shape* is validated here; the caller must still confirm the file is
 * a supported image (by extension and magic bytes).
 */
export function resolveOriginalPath(
  originalsDirectory: string,
  relativePath: string
): string | undefined {
  const normalized = normalizeRelativePath(relativePath)

  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    normalized.includes('\0') ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return undefined
  }

  const segments = normalized.split('/')

  if (segments.some(segment => segment === '' || segment === '..')) {
    return undefined
  }

  const directory = resolve(originalsDirectory)
  const candidate = resolve(directory, normalized)

  if (!candidate.startsWith(`${directory}${sep}`)) {
    return undefined
  }

  if (extname(candidate).toLowerCase() === '') {
    return undefined
  }

  return candidate
}
