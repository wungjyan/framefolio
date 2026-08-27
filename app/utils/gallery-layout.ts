import type { GalleryPhoto } from '../../shared/types/photo'

export type GalleryLayout = 'editorial' | 'justified'
export type PhotoOrientation = 'landscape' | 'portrait' | 'square'

export interface EditorialItem {
  photo: GalleryPhoto
  orientation: PhotoOrientation
  sourceIndex: number
}

export interface EditorialRow {
  id: string
  items: EditorialItem[]
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

export function buildEditorialItems(photos: GalleryPhoto[]): EditorialItem[] {
  return photos.map((photo, sourceIndex): EditorialItem => ({
    photo,
    sourceIndex,
    orientation: classifyPhotoOrientation(photo)
  }))
}

export function buildEditorialRows(
  photos: GalleryPhoto[],
  itemsPerRow: number
): EditorialRow[] {
  if (!Number.isInteger(itemsPerRow) || itemsPerRow <= 0) {
    return []
  }

  const items = buildEditorialItems(photos)
  const rows: EditorialRow[] = []

  for (let index = 0; index < items.length; index += itemsPerRow) {
    const rowItems = items.slice(index, index + itemsPerRow)
    rows.push({
      id: rowItems.map(item => item.photo.id).join('-'),
      items: rowItems
    })
  }

  return rows
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
