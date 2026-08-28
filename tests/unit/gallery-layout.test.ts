import { describe, expect, it } from 'vitest'

import {
  buildEditorialItems,
  buildEditorialRows,
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

  it('builds deterministic items with source order and orientation', () => {
    const photos = [
      createPhoto('a', 1600, 900),
      createPhoto('b', 900, 1600),
      createPhoto('c', 1000, 1000)
    ]

    const first = buildEditorialItems(photos)
    const second = buildEditorialItems(photos)

    expect(second).toEqual(first)
    expect(first.map(item => item.photo.id)).toEqual(['a', 'b', 'c'])
    expect(first.map(item => item.sourceIndex)).toEqual([0, 1, 2])
    expect(first.map(item => item.orientation)).toEqual([
      'landscape',
      'portrait',
      'square'
    ])
  })

  it('preserves every photo for any collection size', () => {
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
      const output = buildEditorialItems(input)
        .map(item => item.photo.id)

      expect(output).toEqual(input.map(photo => photo.id))
      expect(new Set(output).size).toBe(count)
    }
  })

  it('builds fixed-size rows and preserves one final partial row', () => {
    const photos = Array.from({ length: 10 }, (_, index) => (
      createPhoto(String(index), index % 2 === 0 ? 1600 : 900, 1200)
    ))

    const rows = buildEditorialRows(photos, 3)

    expect(rows.map(row => row.items.length)).toEqual([3, 3, 3, 1])
    expect(rows.flatMap(row => row.items.map(item => item.photo.id)))
      .toEqual(photos.map(photo => photo.id))
    expect(buildEditorialRows(photos, 0)).toEqual([])
    expect(buildEditorialRows(photos, 2.5)).toEqual([])
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
