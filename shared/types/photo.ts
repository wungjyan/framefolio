import type {
  GALLERY_PIPELINE_VERSION,
  GALLERY_SCHEMA_VERSION
} from '../constants/gallery'

/**
 * Public photo shape returned by `GET /api/photos`.
 *
 * `thumbnail` and `preview` are always complete URLs. Which storage source they
 * point at is a server-side decision, so the frontend never changes when the
 * source is switched.
 */
export interface GalleryPhoto {
  id: string
  filename: string
  thumbnail: string
  preview: string
  width: number
  height: number
  takenAt?: string
  cameraMake?: string
  cameraModel?: string
  lens?: string
  focalLength?: number
  focalLength35mm?: number
  aperture?: number
  shutterSpeed?: string
  iso?: number
}

export interface PhotoSourceState {
  size: number
  mtimeMs: number
  revision: string
}

/** Remote copy state; absent means "not uploaded yet, fall back to local". */
export interface PhotoRemoteState {
  provider: 's3'
  revision: string
  uploadedAt: string
}

/**
 * One photo as stored in `photos.json` (schema v2).
 *
 * The index stores **storage keys** (bare filenames such as
 * `<id>-<revision>-thumbnail.webp`), NOT URLs. This is what lets a single index
 * serve both the local `/media/...` route and an object-storage base URL: the
 * URL is assembled at read time in `server/utils/gallery-index.ts`.
 *
 * Storing URLs directly was the original design and it hard-coded `/media/`
 * into the data model, which is why switching sources required rewriting the
 * index rather than changing configuration.
 */
export interface PhotoIndexItem {
  id: string
  filename: string
  width: number
  height: number
  /** Storage keys, relative to the storage root. Never contain a base URL. */
  storage: {
    thumbnail: string
    preview: string
  }
  source: PhotoSourceState
  /** Present only after this revision was uploaded to object storage. */
  remote?: PhotoRemoteState
  takenAt?: string
  cameraMake?: string
  cameraModel?: string
  lens?: string
  focalLength?: number
  focalLength35mm?: number
  aperture?: number
  shutterSpeed?: string
  iso?: number
}

export interface GalleryIndex {
  schemaVersion: typeof GALLERY_SCHEMA_VERSION
  pipelineVersion: typeof GALLERY_PIPELINE_VERSION
  generatedAt: string
  photos: PhotoIndexItem[]
}

export type PhotosResponse = GalleryPhoto[]
