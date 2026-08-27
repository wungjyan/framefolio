import { describe, expect, it } from 'vitest'

import {
  GALLERY_LAYOUT_STORAGE_KEY,
  readStoredGalleryLayout,
  writeStoredGalleryLayout
} from '../../app/composables/useGalleryLayout'
import {
  buildEditorialGroups,
  buildJustifiedRows,
  classifyPhotoOrientation
} from '../../app/utils/gallery-layout'
import type { GalleryPhoto } from '../../shared/types/photo'

describe('editorial gallery layout', () => {
  it('classifies photo orientation using stable ratio boundaries', () => {
    expect(classifyPhotoOrientation(createPhoto('landscape', 1600, 900)))
      .toBe('landscape')
    expect(classifyPhotoOrientation(createPhoto('portrait', 900, 1600)))
      .toBe('portrait')
    expect(classifyPhotoOrientation(createPhoto('square', 1000, 1050)))
      .toBe('square')
  })

  it('builds deterministic groups selected from photo orientation', () => {
    const photos = [
      createPhoto('a', 1600, 900),
      createPhoto('b', 900, 1600),
      createPhoto('c', 900, 1600),
      createPhoto('d', 900, 1600),
      createPhoto('e', 1600, 900),
      createPhoto('f', 1000, 1000),
      createPhoto('g', 1000, 1000)
    ]

    const first = buildEditorialGroups(photos)
    const second = buildEditorialGroups(photos)

    expect(second).toEqual(first)
    expect(first.map(group => group.pattern)).toEqual([
      'mixed-pair',
      'portrait-pair',
      'staggered-pair',
      'single-aside'
    ])
    expect(first.flatMap(group => group.items.map(item => item.photo.id)))
      .toEqual(photos.map(photo => photo.id))
  })

  it('preserves every photo for empty, odd, and even collection sizes', () => {
    const photos = [
      createPhoto('a', 1600, 900),
      createPhoto('b', 900, 1600),
      createPhoto('c', 1000, 1000),
      createPhoto('d', 900, 1600),
      createPhoto('e', 1600, 900),
      createPhoto('f', 1000, 1000),
      createPhoto('g', 900, 1600)
    ]

    for (let count = 0; count <= photos.length; count += 1) {
      const input = photos.slice(0, count)
      const output = buildEditorialGroups(input)
        .flatMap(group => group.items.map(item => item.photo.id))

      expect(output).toEqual(input.map(photo => photo.id))
      expect(new Set(output).size).toBe(count)
    }
  })

  it('uses pairs throughout the collection and leaves at most one final item', () => {
    const photos = Array.from({ length: 7 }, (_, index) => (
      createPhoto(String(index), 1600, 900)
    ))

    for (let count = 2; count <= photos.length; count += 1) {
      const groups = buildEditorialGroups(photos.slice(0, count))
      const groupsBeforeLast = groups.slice(0, -1)
      const lastGroup = groups.at(-1)

      expect(groupsBeforeLast.every(group => group.items.length === 2)).toBe(true)
      expect(lastGroup?.items).toHaveLength(count % 2 === 0 ? 2 : 1)
      expect(groups.findIndex(group => group.items.length === 1))
        .toBe(count % 2 === 0 ? -1 : groups.length - 1)
    }

    expect(buildEditorialGroups(photos.slice(0, 1))[0]?.pattern).toBe('feature')
  })
})

describe('justified gallery layout', () => {
  it('fills non-final rows and keeps the final row at its target height', () => {
    const photos = [
      createPhoto('a', 1600, 900),
      createPhoto('b', 1200, 800),
      createPhoto('c', 900, 1200),
      createPhoto('d', 1000, 1000),
      createPhoto('e', 1000, 1000)
    ]
    const containerWidth = 1000
    const gap = 10
    const rows = buildJustifiedRows(photos, {
      containerWidth,
      targetRowHeight: 240,
      gap
    })

    expect(rows.length).toBeGreaterThan(1)

    for (const row of rows.slice(0, -1)) {
      const rowWidth = row.items.reduce((sum, item) => sum + item.width, 0)
        + gap * (row.items.length - 1)
      expect(rowWidth).toBeCloseTo(containerWidth, 6)
      expect(row.isLast).toBe(false)
    }

    const last = rows.at(-1)
    expect(last?.isLast).toBe(true)
    expect(last?.height).toBe(240)
    expect(last?.items.reduce((sum, item) => sum + item.width, 0))
      .toBeLessThan(containerWidth)
  })

  it('returns no rows for invalid dimensions', () => {
    expect(buildJustifiedRows([createPhoto('a', 4, 3)], {
      containerWidth: 0,
      targetRowHeight: 240,
      gap: 8
    })).toEqual([])
  })
})

describe('gallery layout preference', () => {
  it('reads, writes, and safely falls back when storage is unavailable', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    }

    expect(readStoredGalleryLayout(storage)).toBe('editorial')
    expect(readStoredGalleryLayout()).toBe('editorial')
    writeStoredGalleryLayout(storage, 'justified')
    expect(values.get(GALLERY_LAYOUT_STORAGE_KEY)).toBe('justified')
    expect(readStoredGalleryLayout(storage)).toBe('justified')

    values.set(GALLERY_LAYOUT_STORAGE_KEY, 'unknown')
    expect(readStoredGalleryLayout(storage)).toBe('editorial')

    expect(readStoredGalleryLayout({
      getItem: () => {
        throw new Error('blocked')
      }
    })).toBe('editorial')
    expect(() => writeStoredGalleryLayout({
      setItem: () => {
        throw new Error('blocked')
      }
    }, 'justified')).not.toThrow()
  })
})

function createPhoto(id: string, width: number, height: number): GalleryPhoto {
  return {
    id,
    filename: `${id}.jpg`,
    thumbnail: `/media/${id}-thumbnail.webp`,
    preview: `/media/${id}-preview.webp`,
    width,
    height
  }
}
