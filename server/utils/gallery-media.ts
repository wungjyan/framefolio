import { resolve, sep } from 'node:path'

import { GENERATED_IMAGE_FILENAME_PATTERN } from '../../shared/constants/gallery'

export const GENERATED_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const GENERATED_IMAGE_CONTENT_TYPE = 'image/webp'

export function resolveGeneratedImagePath(
  generatedDirectory: string,
  filename: string
): string | undefined {
  if (!GENERATED_IMAGE_FILENAME_PATTERN.test(filename)) {
    return undefined
  }

  const directory = resolve(generatedDirectory)
  const filePath = resolve(directory, filename)

  return filePath.startsWith(`${directory}${sep}`) ? filePath : undefined
}
