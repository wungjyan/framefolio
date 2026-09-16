/**
 * Upload validation: extension whitelist, magic-byte sniffing, and size limits.
 *
 * The server never trusts the client's filename or Content-Type. A file must
 * pass all three checks before it is moved out of `incoming/`, which is what
 * keeps a crafted upload from becoming a writable file inside `originals/`.
 */

import { open } from 'node:fs/promises'
import { extname } from 'node:path'

import {
  DIMENSION_HEADER_BYTES,
  MAX_DIMENSION_HEADER_BYTES,
  parseImageDimensions,
  type ImageDimensions
} from './image-dimensions'

const MAGIC_BYTES_TO_READ = 32

/** Extensions we accept, mapped to the container formats we can detect. */
const EXTENSION_FORMATS: Record<string, ImageFormat[]> = {
  '.jpg': ['jpeg'],
  '.jpeg': ['jpeg'],
  '.png': ['png'],
  '.webp': ['webp'],
  '.tif': ['tiff'],
  '.tiff': ['tiff']
}

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'tiff' | 'heic' | 'avif'

export interface UploadValidation {
  ok: boolean
  /** Reason the upload was rejected, suitable for showing to the admin user. */
  reason?: string
  format?: ImageFormat
  /**
   * Pixel dimensions, when they could be read from the header.
   *
   * Undefined means "could not be determined". Callers enforcing a pixel limit
   * must treat that as a rejection rather than as "no limit", otherwise a file
   * with an unparseable header would bypass the check.
   */
  dimensions?: ImageDimensions
}

/**
 * Validate an uploaded file on disk.
 *
 * Checking magic bytes (rather than trusting the extension) matters because the
 * generated files are served from the same origin: a file named `.jpg` that is
 * actually HTML would otherwise be a stored-XSS vector.
 */
export async function validateUploadedImage(
  filePath: string,
  originalFilename: string
): Promise<UploadValidation> {
  const extension = extname(originalFilename).toLowerCase()
  const acceptedFormats = EXTENSION_FORMATS[extension]

  if (!acceptedFormats) {
    return {
      ok: false,
      reason: `Unsupported file type "${extension || originalFilename}".`
    }
  }

  // One header read serves both checks.
  const header = await readImageHeader(filePath)

  if (!header.format) {
    return { ok: false, reason: 'The file is not a recognisable image.' }
  }

  if (!acceptedFormats.includes(header.format)) {
    return {
      ok: false,
      reason: `The file contents (${header.format}) do not match its extension (${extension}).`
    }
  }

  return {
    ok: true,
    format: header.format,
    ...(header.dimensions ? { dimensions: header.dimensions } : {})
  }
}

/**
 * Read the format and dimensions, reading more of the file while needed.
 *
 * The size fields are not always in the first block: a JPEG's SOF marker can sit
 * behind several hundred kilobytes of ICC profile segments, which is what a photo
 * exported from an image editor looks like. A single fixed-size read would report
 * those as unmeasurable and the upload would be rejected, so the parser is
 * consulted repeatedly with an increasing prefix, up to
 * `MAX_DIMENSION_HEADER_BYTES`.
 *
 * The bound keeps a crafted file from making the server read indefinitely.
 */
export async function readImageHeader(filePath: string): Promise<{
  format?: ImageFormat
  dimensions?: ImageDimensions
}> {
  const handle = await open(filePath, 'r')

  try {
    const first = await readPrefix(handle, DIMENSION_HEADER_BYTES)
    const format = sniffFormat(first)

    if (!format) {
      return {}
    }

    let size = DIMENSION_HEADER_BYTES
    let bytes = first

    while (true) {
      const result = parseImageDimensions(bytes, format)

      if (result.status === 'ok') {
        return { format, dimensions: result.dimensions }
      }

      if (result.status === 'absent') {
        // The fields are definitively not where they should be.
        return { format }
      }

      // `need-more`: read a larger prefix, unless the file or the cap is reached.
      const nextSize = Math.min(size * 2, MAX_DIMENSION_HEADER_BYTES)
      const more = await readPrefix(handle, nextSize)

      if (more.length <= bytes.length) {
        // The file is exhausted; the header is genuinely incomplete.
        return { format }
      }

      bytes = more
      size = nextSize

      if (size >= MAX_DIMENSION_HEADER_BYTES) {
        // Cap reached with the parser still asking: give up rather than read on.
        const finalResult = parseImageDimensions(bytes, format)
        return finalResult.status === 'ok'
          ? { format, dimensions: finalResult.dimensions }
          : { format }
      }
    }
  } finally {
    await handle.close()
  }
}

/** Read up to `size` bytes from the start of an open file. */
async function readPrefix(
  handle: Awaited<ReturnType<typeof open>>,
  size: number
): Promise<Buffer> {
  const buffer = Buffer.alloc(size)
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
  return buffer.subarray(0, bytesRead)
}

/** Sniff the leading bytes; returns undefined when nothing matches. */
export async function detectImageFormat(
  filePath: string
): Promise<ImageFormat | undefined> {
  const handle = await open(filePath, 'r')

  try {
    const buffer = Buffer.alloc(MAGIC_BYTES_TO_READ)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)

    return sniffFormat(buffer.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

export function sniffFormat(bytes: Uint8Array): ImageFormat | undefined {
  if (bytes.length < 12) {
    return undefined
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg'
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png'
  }

  // RIFF....WEBP
  if (matchesAscii(bytes, 0, 'RIFF') && matchesAscii(bytes, 8, 'WEBP')) {
    return 'webp'
  }

  // TIFF: II*\0 (little endian) or MM\0* (big endian)
  if (
    (bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
    (bytes[0] === 0x4d &&
      bytes[1] === 0x4d &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x2a)
  ) {
    return 'tiff'
  }

  // ISO-BMFF (HEIC/AVIF): ....ftyp<brand>
  if (matchesAscii(bytes, 4, 'ftyp')) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12))

    if (brand.startsWith('avif') || brand.startsWith('avis')) {
      return 'avif'
    }

    if (
      brand.startsWith('heic') ||
      brand.startsWith('heix') ||
      brand.startsWith('hevc') ||
      brand.startsWith('mif1') ||
      brand.startsWith('msf1')
    ) {
      return 'heic'
    }
  }

  return undefined
}

function matchesAscii(
  bytes: Uint8Array,
  offset: number,
  expected: string
): boolean {
  if (bytes.length < offset + expected.length) {
    return false
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) {
      return false
    }
  }

  return true
}

/**
 * Sanitize a client-supplied filename into a safe basename.
 *
 * Path separators, control characters, and leading dots are stripped so the
 * result cannot traverse directories or become a hidden file. The caller still
 * resolves and verifies the final path.
 */
export function sanitizeUploadFilename(filename: string): string | undefined {
  // Take only the final segment, in case a full path was supplied (some
  // browsers send a path for directory uploads).
  const base = filename.split(/[\\/]/).pop() ?? ''
  const cleaned = stripControlCharacters(base).replace(/^\.+/, '').trim()

  if (cleaned.length === 0 || cleaned.length > 255) {
    return undefined
  }

  return cleaned
}

/**
 * Remove ASCII control characters (0x00-0x1F and 0x7F).
 *
 * Written as an explicit filter rather than a regex with a control-character
 * class, because that pattern is both hard to read and lint-flagged.
 */
function stripControlCharacters(value: string): string {
  let result = ''

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0

    if (code > 0x1f && code !== 0x7f) {
      result += character
    }
  }

  return result
}
