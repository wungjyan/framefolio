/**
 * Read an image's pixel dimensions without decoding it.
 *
 * Why not sharp: the request path must not load native image code
 * (`tests/unit/gallery-runtime.test.ts` asserts this), because a crafted file can
 * crash libvips inside the web server. Dimensions are the one piece of image
 * metadata the upload endpoint needs to enforce its pixel limit, and every format
 * here stores them in a small header, so parsing those bytes directly is both
 * cheaper and safer than decoding.
 *
 * Each parser is deliberately strict: it returns undefined rather than guessing,
 * so a malformed file is rejected by the caller instead of yielding a bogus size
 * that would slip past the limit.
 */

export interface ImageDimensions {
  width: number
  height: number
}

/**
 * A header needs more than 32 bytes for these formats. JPEG scans for a marker,
 * PNG reads a fixed offset, and WebP/TIFF vary, so read a generous prefix once.
 */
export const DIMENSION_HEADER_BYTES = 64 * 1024

/**
 * Parse dimensions from a file header.
 *
 * Returns undefined when the format is unknown or the header is truncated; the
 * caller treats that as "cannot verify", which fails the upload rather than
 * letting an unmeasured image through.
 */
export function readImageDimensions(
  bytes: Uint8Array,
  format: string
): ImageDimensions | undefined {
  switch (format) {
    case 'png':
      return readPngDimensions(bytes)
    case 'jpeg':
      return readJpegDimensions(bytes)
    case 'webp':
      return readWebpDimensions(bytes)
    case 'tiff':
      return readTiffDimensions(bytes)
    case 'heic':
    case 'avif':
      return readIsoBmffDimensions(bytes)
    default:
      return undefined
  }
}

/** PNG: `IHDR` holds width/height as big-endian uint32 at offsets 16 and 20. */
function readPngDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 24) {
    return undefined
  }

  return normalize(readUint32BE(bytes, 16), readUint32BE(bytes, 20))
}

/**
 * JPEG: walk the marker segments to the Start-Of-Frame, which stores height then
 * width as big-endian uint16. A scan is required because EXIF and other segments
 * vary in size and order.
 */
function readJpegDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  let offset = 2 // skip SOI (FFD8)

  while (offset + 3 < bytes.length) {
    // Markers are 0xFF followed by a non-zero type byte.
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = bytes[offset + 1] as number

    // Padding and standalone markers carry no length.
    if (
      marker === 0xff ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd9)
    ) {
      offset += 2
      continue
    }

    const length = readUint16BE(bytes, offset + 2)

    if (length < 2) {
      return undefined
    }

    // SOF0..SOF15, excluding the non-frame markers DHT (C4), JPG (C8) and DAC (CC).
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc

    if (isStartOfFrame) {
      // Segment: FF marker, 2-byte length, 1-byte precision, then height/width.
      if (offset + 9 > bytes.length) {
        return undefined
      }

      return normalize(
        readUint16BE(bytes, offset + 7),
        readUint16BE(bytes, offset + 5)
      )
    }

    // SOI/EOI end the scan; SOS means image data begins and no SOF was found.
    if (marker === 0xda) {
      return undefined
    }

    offset += 2 + length
  }

  return undefined
}

/**
 * WebP: a RIFF container with three possible dimension encodings.
 *  - `VP8 `  lossy: 14-bit dimensions after the 3-byte start code
 *  - `VP8L`  lossless: 14-bit width/height packed into 4 bytes
 *  - `VP8X`  extended: 24-bit canvas size minus one, for animation/alpha
 */
function readWebpDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 30) {
    return undefined
  }

  const chunk = ascii(bytes, 12, 4)

  if (chunk === 'VP8X') {
    // Bytes 24..26 width-1, 27..29 height-1, little-endian 24-bit each.
    const width = readUint24LE(bytes, 24)
    const height = readUint24LE(bytes, 27)
    return normalize(width + 1, height + 1)
  }

  if (chunk === 'VP8 ') {
    // Start code 0x9D 0x01 0x2A sits at offset 23, then 14-bit dimensions.
    if (bytes.length < 30) {
      return undefined
    }

    const width = readUint16LE(bytes, 26) & 0x3fff
    const height = readUint16LE(bytes, 28) & 0x3fff
    return normalize(width, height)
  }

  if (chunk === 'VP8L') {
    if (bytes.length < 25) {
      return undefined
    }

    // 5 bits of signature, then 14 bits width-1 and 14 bits height-1.
    const bits =
      ((bytes[21] as number) |
        ((bytes[22] as number) << 8) |
        ((bytes[23] as number) << 16) |
        ((bytes[24] as number) << 24)) >>>
      0

    const width = (bits & 0x3fff) + 1
    const height = ((bits >> 14) & 0x3fff) + 1
    return normalize(width, height)
  }

  return undefined
}

/**
 * TIFF: read the first IFD and look up ImageWidth (0x0100) and ImageLength
 * (0x0101). Both byte orders are supported.
 */
function readTiffDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 8) {
    return undefined
  }

  const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49

  if (!littleEndian && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) {
    return undefined
  }

  const readUint16 = (offset: number): number =>
    littleEndian ? readUint16LE(bytes, offset) : readUint16BE(bytes, offset)

  const readUint32 = (offset: number): number =>
    littleEndian ? readUint32LE(bytes, offset) : readUint32BE(bytes, offset)

  const ifdOffset = readUint32(4)

  if (ifdOffset + 2 > bytes.length) {
    return undefined
  }

  const entryCount = readUint16(ifdOffset)
  let width: number | undefined
  let height: number | undefined

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12

    if (entryOffset + 12 > bytes.length) {
      break
    }

    const tag = readUint16(entryOffset)
    const type = readUint16(entryOffset + 2)

    if (tag !== 0x0100 && tag !== 0x0101) {
      continue
    }

    // SHORT (3) stores the value inline; LONG (4) does too when it fits.
    let value: number
    if (type === 3) {
      value = readUint16(entryOffset + 8)
    } else if (type === 4) {
      value = readUint32(entryOffset + 8)
    } else {
      continue
    }

    if (tag === 0x0100) {
      width = value
    } else {
      height = value
    }
  }

  return normalize(width, height)
}

/**
 * HEIC/AVIF: locate the `ispe` box, whose payload holds width and height as
 * big-endian uint32 after a 4-byte version/flags field. Finding it requires
 * walking the nested box structure rather than reading a fixed offset.
 */
function readIsoBmffDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  const ispe = findIspeBox(bytes, 0, bytes.length)

  if (!ispe) {
    return undefined
  }

  // ispe payload: 4 bytes version+flags, then width (4) and height (4).
  return normalize(
    readUint32BE(bytes, ispe + 8),
    readUint32BE(bytes, ispe + 12)
  )
}

/**
 * Depth-first search for the first `ispe` box, returning the offset of its size
 * field. Containers (`meta`, `iprp`, `ipco`) nest their children, so recursion is
 * needed; leaf boxes are skipped by their declared size.
 */
function findIspeBox(
  bytes: Uint8Array,
  start: number,
  end: number,
  depth = 0
): number | undefined {
  // Bounded to avoid runaway recursion on a crafted file.
  if (depth > 8) {
    return undefined
  }

  const CONTAINERS = new Set(['meta', 'iprp', 'ipco', 'moov', 'trak', 'mdia'])

  let offset = start

  while (offset + 8 <= end) {
    let size = readUint32BE(bytes, offset)
    const type = ascii(bytes, offset + 4, 4)
    let headerSize = 8

    if (size === 1) {
      // 64-bit size follows the type.
      if (offset + 16 > end) {
        return undefined
      }

      const high = readUint32BE(bytes, offset + 8)
      const low = readUint32BE(bytes, offset + 12)

      // Guard against exceeding Number's safe integer range.
      if (high > 0x1fffff) {
        return undefined
      }

      size = high * 2 ** 32 + low
      headerSize = 16
    } else if (size === 0) {
      // A zero size means "to the end of the enclosing box".
      size = end - offset
    }

    if (size < headerSize || offset + size > end) {
      return undefined
    }

    if (type === 'ispe') {
      // Need version+flags (4) + width (4) + height (4).
      return offset + size >= offset + headerSize + 12
        ? offset + headerSize
        : undefined
    }

    if (CONTAINERS.has(type)) {
      // `meta` has a 4-byte version/flags field before its children.
      const childStart =
        type === 'meta' ? offset + headerSize + 4 : offset + headerSize
      const found = findIspeBox(bytes, childStart, offset + size, depth + 1)

      if (found !== undefined) {
        return found
      }
    }

    offset += size
  }

  return undefined
}

function normalize(
  width: number | undefined,
  height: number | undefined
): ImageDimensions | undefined {
  if (
    width === undefined ||
    height === undefined ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined
  }

  return { width, height }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let result = ''

  for (let index = 0; index < length; index += 1) {
    const byte = bytes[offset + index]
    if (byte === undefined) {
      return result
    }
    result += String.fromCharCode(byte)
  }

  return result
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] as number) << 8) | (bytes[offset + 1] as number)
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset + 1] as number) << 8) | (bytes[offset] as number)
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] as number) |
    ((bytes[offset + 1] as number) << 8) |
    ((bytes[offset + 2] as number) << 16)
  )
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] as number) * 2 ** 24 +
      ((bytes[offset + 1] as number) << 16) +
      ((bytes[offset + 2] as number) << 8) +
      (bytes[offset + 3] as number)) >>>
    0
  )
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset + 3] as number) * 2 ** 24 +
      ((bytes[offset + 2] as number) << 16) +
      ((bytes[offset + 1] as number) << 8) +
      (bytes[offset] as number)) >>>
    0
  )
}
