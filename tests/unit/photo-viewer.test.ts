import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { buildPhotoMetadata } from '../../app/utils/photo-viewer'
import type { GalleryPhoto } from '../../shared/types/photo'

describe('photo viewer metadata', () => {
  it('combines available EXIF fields without empty separators', () => {
    expect(buildPhotoMetadata(createPhoto({
      cameraMake: 'Sony',
      cameraModel: 'Sony A7 IV',
      lens: 'FE 35mm F1.4 GM',
      focalLength: 35,
      focalLength35mm: 35,
      aperture: 2.8,
      shutterSpeed: '1/250s',
      iso: 100,
      takenAt: '2026-08-20T12:00:00.000Z'
    }))).toEqual({
      equipment: 'Sony A7 IV · FE 35mm F1.4 GM',
      exposure: '35mm（等效 35mm） · f/2.8 · 1/250s · ISO 100',
      date: '2026.08.20'
    })
  })

  it('omits missing groups and keeps partial EXIF meaningful', () => {
    expect(buildPhotoMetadata(createPhoto({
      cameraModel: 'Example Camera',
      aperture: 4
    }))).toEqual({
      equipment: 'Example Camera',
      exposure: 'f/4'
    })

    expect(buildPhotoMetadata(createPhoto())).toEqual({})
  })

  it('shows physical and optional 35mm-equivalent focal lengths', () => {
    expect(buildPhotoMetadata(createPhoto({
      focalLength: 2.32,
      focalLength35mm: 25
    })).exposure).toBe('2.32mm（等效 25mm）')

    expect(buildPhotoMetadata(createPhoto({
      focalLength: 2.32
    })).exposure).toBe('2.32mm')

    expect(buildPhotoMetadata(createPhoto({
      focalLength35mm: 25
    })).exposure).toBe('等效 25mm')
  })

  it('adds camera make when it is not already part of the model', () => {
    expect(buildPhotoMetadata(createPhoto({
      cameraMake: 'Fujifilm',
      cameraModel: 'X-T5'
    })).equipment).toBe('Fujifilm X-T5')
  })
})

describe('photo viewer media sizing', () => {
  it('removes the media layer from grid sizing and contains the image', async () => {
    const source = await readFile(
      'app/components/viewer/PhotoViewer.vue',
      'utf8'
    )

    expect(source).toMatch(
      /\.photo-viewer__media \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;/
    )
    expect(source).toMatch(
      /\.photo-viewer__media img \{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?object-fit: contain;/
    )
  })
})

function createPhoto(overrides: Partial<GalleryPhoto> = {}): GalleryPhoto {
  return {
    id: 'photo',
    filename: 'photo.jpg',
    thumbnail: '/media/photo-thumbnail.webp',
    preview: '/media/photo-preview.webp',
    width: 1600,
    height: 900,
    ...overrides
  }
}
