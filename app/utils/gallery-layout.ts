import type { GalleryPhoto } from '../../shared/types/photo'

export type GalleryLayout = 'editorial' | 'justified'
export type PhotoOrientation = 'landscape' | 'portrait' | 'square'
export type EditorialPattern =
  | 'feature'
  | 'mixed-pair'
  | 'portrait-pair'
  | 'staggered-pair'
  | 'single-aside'

export interface EditorialItem {
  photo: GalleryPhoto
  orientation: PhotoOrientation
  sourceIndex: number
}

export interface EditorialGroup {
  id: string
  pattern: EditorialPattern
  items: EditorialItem[]
  side: 'left' | 'right'
}

export interface JustifiedItem {
  photo: GalleryPhoto
  sourceIndex: number
  width: number
  height: number
}

export interface JustifiedRow {
  id: string
  items: JustifiedItem[]
  height: number
  isLast: boolean
}

export interface JustifiedLayoutOptions {
  containerWidth: number
  targetRowHeight: number
  gap: number
}

const LANDSCAPE_RATIO = 1.18
const PORTRAIT_RATIO = 0.85

export function classifyPhotoOrientation(
  photo: Pick<GalleryPhoto, 'width' | 'height'>
): PhotoOrientation {
  const ratio = photo.width / photo.height

  if (ratio >= LANDSCAPE_RATIO) {
    return 'landscape'
  }

  if (ratio <= PORTRAIT_RATIO) {
    return 'portrait'
  }

  return 'square'
}

export function buildEditorialGroups(photos: GalleryPhoto[]): EditorialGroup[] {
  if (photos.length === 0) {
    return []
  }

  const items = photos.map((photo, sourceIndex): EditorialItem => ({
    photo,
    sourceIndex,
    orientation: classifyPhotoOrientation(photo)
  }))
  const firstItem = items[0] as EditorialItem

  if (items.length === 1) {
    return [createEditorialGroup('feature', [firstItem], 0)]
  }

  const groups: EditorialGroup[] = []
  let itemIndex = 0
  let groupIndex = 0

  while (itemIndex < items.length) {
    const first = items[itemIndex] as EditorialItem
    const second = items[itemIndex + 1]

    if (!second) {
      groups.push(createEditorialGroup('single-aside', [first], groupIndex))
      break
    }

    groups.push(createEditorialGroup(
      selectPairPattern(first.orientation, second.orientation),
      [first, second],
      groupIndex
    ))
    itemIndex += 2
    groupIndex += 1
  }

  return groups
}

export function buildJustifiedRows(
  photos: GalleryPhoto[],
  options: JustifiedLayoutOptions
): JustifiedRow[] {
  const { containerWidth, targetRowHeight, gap } = options

  if (photos.length === 0
    || !Number.isFinite(containerWidth)
    || !Number.isFinite(targetRowHeight)
    || !Number.isFinite(gap)
    || containerWidth <= 0
    || targetRowHeight <= 0
    || gap < 0) {
    return []
  }

  const rows: JustifiedRow[] = []
  let rowItems: Array<{ photo: GalleryPhoto, sourceIndex: number }> = []
  let rowRatio = 0

  photos.forEach((photo, sourceIndex) => {
    rowItems.push({ photo, sourceIndex })
    rowRatio += photo.width / photo.height

    const projectedWidth = rowRatio * targetRowHeight
      + gap * Math.max(0, rowItems.length - 1)
    const hasMorePhotos = sourceIndex < photos.length - 1

    if (projectedWidth >= containerWidth && hasMorePhotos) {
      rows.push(createJustifiedRow(
        rowItems,
        rowRatio,
        containerWidth,
        gap,
        false
      ))
      rowItems = []
      rowRatio = 0
    }
  })

  if (rowItems.length > 0) {
    rows.push(createJustifiedRow(
      rowItems,
      rowRatio,
      containerWidth,
      gap,
      true,
      targetRowHeight
    ))
  }

  return rows
}

function createEditorialGroup(
  pattern: EditorialPattern,
  items: EditorialItem[],
  groupIndex: number
): EditorialGroup {
  return {
    id: items.map(item => item.photo.id).join('-'),
    pattern,
    items,
    side: groupIndex % 2 === 0 ? 'left' : 'right'
  }
}

function selectPairPattern(
  first: PhotoOrientation,
  second: PhotoOrientation
): EditorialPattern {
  if (first === 'portrait' && second === 'portrait') {
    return 'portrait-pair'
  }

  if (first === 'portrait' || second === 'portrait') {
    return 'mixed-pair'
  }

  return 'staggered-pair'
}

function createJustifiedRow(
  entries: Array<{ photo: GalleryPhoto, sourceIndex: number }>,
  totalRatio: number,
  containerWidth: number,
  gap: number,
  isLast: boolean,
  targetRowHeight?: number
): JustifiedRow {
  const availableWidth = containerWidth - gap * Math.max(0, entries.length - 1)
  const fillHeight = availableWidth / totalRatio
  const height = isLast && targetRowHeight !== undefined
    ? Math.min(targetRowHeight, fillHeight)
    : fillHeight

  return {
    id: entries.map(entry => entry.photo.id).join('-'),
    height,
    isLast,
    items: entries.map(entry => ({
      ...entry,
      width: height * (entry.photo.width / entry.photo.height),
      height
    }))
  }
}
