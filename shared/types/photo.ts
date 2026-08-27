import type {
  GALLERY_PIPELINE_VERSION,
  GALLERY_SCHEMA_VERSION
} from '../constants/gallery'

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

export interface PhotoIndexItem extends GalleryPhoto {
  source: PhotoSourceState
}

export interface GalleryIndex {
  schemaVersion: typeof GALLERY_SCHEMA_VERSION
  pipelineVersion: typeof GALLERY_PIPELINE_VERSION
  generatedAt: string
  photos: PhotoIndexItem[]
}

export type PhotosResponse = GalleryPhoto[]
