import type { GalleryPhoto } from '../../shared/types/photo'

export interface PhotoMetadata {
  equipment?: string
  exposure?: string
  date?: string
}

export function buildPhotoMetadata(photo: GalleryPhoto): PhotoMetadata {
  const camera = formatCamera(photo.cameraMake, photo.cameraModel)
  const equipment = joinParts([camera, photo.lens])
  const exposure = joinParts([
    formatFocalLength(photo.focalLength, photo.focalLength35mm),
    formatNumber(photo.aperture, 'f/'),
    photo.shutterSpeed,
    formatNumber(photo.iso, 'ISO ')
  ])
  const date = formatTakenAt(photo.takenAt)

  return {
    ...(equipment ? { equipment } : {}),
    ...(exposure ? { exposure } : {}),
    ...(date ? { date } : {})
  }
}

function formatFocalLength(
  focalLength?: number,
  focalLength35mm?: number
): string | undefined {
  const physical = formatNumber(focalLength, 'mm')
  const equivalent = formatNumber(focalLength35mm, 'mm')

  if (physical && equivalent) {
    return `${physical}（等效 ${equivalent}）`
  }

  return physical ?? (equivalent ? `等效 ${equivalent}` : undefined)
}

function formatCamera(make?: string, model?: string): string | undefined {
  const normalizedMake = make?.trim()
  const normalizedModel = model?.trim()

  if (!normalizedMake) {
    return normalizedModel
  }

  if (!normalizedModel) {
    return normalizedMake
  }

  if (normalizedModel.toLocaleLowerCase().startsWith(
    normalizedMake.toLocaleLowerCase()
  )) {
    return normalizedModel
  }

  return `${normalizedMake} ${normalizedModel}`
}

function formatNumber(
  value: number | undefined,
  affix: string
): string | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined
  }

  return affix.endsWith(' ')
    ? `${affix}${value}`
    : affix.startsWith('f/')
      ? `${affix}${value}`
      : `${value}${affix}`
}

function formatTakenAt(value?: string): string | undefined {
  if (!value || Number.isNaN(Date.parse(value))) {
    return undefined
  }

  return value.slice(0, 10).replaceAll('-', '.')
}

function joinParts(parts: Array<string | undefined>): string | undefined {
  const values = parts.filter((part): part is string => Boolean(part?.trim()))
  return values.length > 0 ? values.join(' · ') : undefined
}
