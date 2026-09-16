/**
 * Read an image's pixel dimensions without decoding it.
 *
 * Why not sharp: the request path must not load native image code
 * (`tests/unit/gallery-runtime.test.ts` asserts this), because a crafted file can
 * crash libvips inside the web server. Dimensions are the one piece of image
 * metadata the upload endpoint needs to enforce its pixel limit, and every format
 * here stores them in a header, so parsing those bytes directly is both cheaper
 * and safer than decoding.
 *
 * The size fields are not always near the start of the file. A JPEG's SOF marker
 * can sit behind hundreds of kilobytes of ICC profile segments, so parsers report
 * `need-more` instead of giving up, and the caller reads on.
 *
 * Each parser is deliberately strict: it returns `absent` rather than guessing,
 * so a malformed file is rejected by the caller instead of yielding a bogus size
 * that would slip past the limit.
 */

export interface ImageDimensions {
  width: number
  height: number
}

/** Outcome of parsing a header prefix. */
export type DimensionParseResult =
  | { status: 'ok'; dimensions: ImageDimensions }
  /**
   * The prefix ended before the size fields did. The caller should retry with
   * more of the file; only if the file is exhausted does this mean "invalid".
   */
  | { status: 'need-more' }
  /** The size fields are genuinely not where they should be. Reject the file. */
  | { status: 'absent' }

/**
 * Bytes to read per pass.
 *
 * Not a hard cap: some formats need to walk past arbitrary metadata before
 * reaching the size fields. A photo exported from an image editor readily
 * carries 200 KB of ICC profile, so truncating here would reject valid files.
 */
export const DIMENSION_HEADER_BYTES = 64 * 1024

/**
 * Upper bound for the progressive read.
 *
 * A size field that has still not appeared after this much metadata is treated
 * as absent, so a crafted file cannot make the server read indefinitely. Well
 * above any real ICC profile (a JPEG segment maxes out at 65533 bytes, and the
 * ICC spec's own per-tag limit is far larger than any camera emits).
 */
export const MAX_DIMENSION_HEADER_BYTES = 4 * 1024 * 1024

/**
 * Parse dimensions from a header prefix.
 *
 * While the result is `need-more`, the caller must retry with a longer prefix and
 * treat `absent` as a rejection rather than "no limit".
 */
export function parseImageDimensions(
  bytes: Uint8Array,
  format: string
): DimensionParseResult {
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
      return { status: 'absent' }
  }
}

/**
 * Single-shot parse, for callers that already hold the whole header.
 *
 * Collapses `need-more` and `absent` into undefined. Prefer
 * `parseImageDimensions` when the caller can read more bytes and needs to
 * distinguish the two.
 */
export function readImageDimensions(
  bytes: Uint8Array,
  format: string
): ImageDimensions | undefined {
  const result = parseImageDimensions(bytes, format)
  return result.status === 'ok' ? result.dimensions : undefined
}

/** PNG: `IHDR` holds width/height as big-endian uint32 at offsets 16 and 20. */
function readPngDimensions(bytes: Uint8Array): DimensionParseResult {
  if (bytes.length < 24) {
    return { status: 'need-more' }
  }

  const dimensions = normalize(readUint32BE(bytes, 16), readUint32BE(bytes, 20))
  return dimensions ? { status: 'ok', dimensions } : { status: 'absent' }
}

/**
 * JPEG: walk the marker segments to the Start-Of-Frame, which stores height then
 * width as big-endian uint16. A scan is required because EXIF, ICC, and other
 * segments vary in size and order, and can push the frame header far into the
 * file.
 */
function readJpegDimensions(bytes: Uint8Array): DimensionParseResult {
  let offset = 2 // skip SOI (FFD8)

  while (offset < bytes.length) {
    // Markers are 0xFF followed by a non-zero type byte. Resynchronise on a stray
    // byte rather than bailing out, since padding is legal here.
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }

    // The marker's type byte may not have been read yet.
    if (offset + 1 >= bytes.length) {
      return { status: 'need-more' }
    }

    const marker = bytes[offset + 1] as number

    // A run of 0xFF bytes before a marker is legal padding, per the JPEG spec:
    // `FF FF FF C0` means "marker 0xC0, preceded by two fill bytes". Advance a
    // single byte so the next 0xFF is re-examined as a potential marker prefix;
    // skipping 2 here would swallow the real marker code whenever the run has an
    // odd length. A lone 0xFF followed by a non-0xFF byte is that marker's prefix.
    if (marker === 0xff) {
      offset += 1
      continue
    }

    // Standalone markers carry no length: TEM (0x01) and RST/SOI/EOI (0xD0-0xD9).
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }

    // Everything from here has a 2-byte length, which may not be in the buffer.
    if (offset + 4 > bytes.length) {
      return { status: 'need-more' }
    }

    const length = readUint16BE(bytes, offset + 2)

    // A length below 2 cannot describe its own field, so the stream is malformed.
    if (length < 2) {
      return { status: 'absent' }
    }

    // SOF0..SOF15, excluding the non-frame markers DHT (C4), JPG (C8) and DAC (CC).
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc

    if (isStartOfFrame) {
      // Segment: FF marker, 2-byte length, 1-byte precision, then height/width,
      // which ends 9 bytes into the marker.
      if (offset + 9 > bytes.length) {
        return { status: 'need-more' }
      }

      const dimensions = normalize(
        readUint16BE(bytes, offset + 7),
        readUint16BE(bytes, offset + 5)
      )
      return dimensions ? { status: 'ok', dimensions } : { status: 'absent' }
    }

    // SOS marks the start of entropy-coded data; the frame header must have come
    // before it, so a size has been missed and the file is not usable.
    if (marker === 0xda) {
      return { status: 'absent' }
    }

    const next = offset + 2 + length

    // Guard against a length that cannot advance the scan.
    if (next <= offset) {
      return { status: 'absent' }
    }

    offset = next
  }

  // Ran out of buffer while still scanning: the caller may need to read more.
  return { status: 'need-more' }
}

/**
 * WebP: a RIFF container with three possible dimension encodings.
 *  - `VP8 `  lossy: 14-bit dimensions after the 3-byte start code
 *  - `VP8L`  lossless: 14-bit width/height packed into 4 bytes
 *  - `VP8X`  extended: 24-bit canvas size minus one, for animation/alpha
 */
function readWebpDimensions(bytes: Uint8Array): DimensionParseResult {
  // The chunk fourcc sits at 12, and the largest layout needs up to offset 30.
  if (bytes.length < 16) {
    return { status: 'need-more' }
  }

  const chunk = ascii(bytes, 12, 4)

  if (chunk === 'VP8X') {
    if (bytes.length < 30) {
      return { status: 'need-more' }
    }

    // Bytes 24..26 width-1, 27..29 height-1, little-endian 24-bit each.
    const dimensions = normalize(
      readUint24LE(bytes, 24) + 1,
      readUint24LE(bytes, 27) + 1
    )
    return dimensions ? { status: 'ok', dimensions } : { status: 'absent' }
  }

  if (chunk === 'VP8 ') {
    if (bytes.length < 30) {
      return { status: 'need-more' }
    }

    const dimensions = normalize(
      readUint16LE(bytes, 26) & 0x3fff,
      readUint16LE(bytes, 28) & 0x3fff
    )
    return dimensions ? { status: 'ok', dimensions } : { status: 'absent' }
  }

  if (chunk === 'VP8L') {
    if (bytes.length < 25) {
      return { status: 'need-more' }
    }

    // 5 bits of signature, then 14 bits width-1 and 14 bits height-1.
    const bits =
      ((bytes[21] as number) |
        ((bytes[22] as number) << 8) |
        ((bytes[23] as number) << 16) |
        ((bytes[24] as number) << 24)) >>>
      0

    const dimensions = normalize(
      (bits & 0x3fff) + 1,
      ((bits >> 14) & 0x3fff) + 1
    )
    return dimensions ? { status: 'ok', dimensions } : { status: 'absent' }
  }

  return { status: 'absent' }
}

/**
 * TIFF: read the first IFD and look up ImageWidth (0x0100) and ImageLength
 * (0x0101). Both byte orders are supported.
 *
 * The IFD can sit anywhere in the file, so a truncated read is reported as
 * `need-more` rather than treated as a missing tag.
 */
function readTiffDimensions(bytes: Uint8Array): DimensionParseResult {
  if (bytes.length < 8) {
    return { status: 'need-more' }
  }

  const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49

  if (!littleEndian && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) {
    return { status: 'absent' }
  }

  const readUint16 = (offset: number): number =>
    littleEndian ? readUint16LE(bytes, offset) : readUint16BE(bytes, offset)

  const readUint32 = (offset: number): number =>
    littleEndian ? readUint32LE(bytes, offset) : readUint32BE(bytes, offset)

  const ifdOffset = readUint32(4)

  if (ifdOffset + 2 > bytes.length) {
    return { status: 'need-more' }
  }

  const entryCount = readUint16(ifdOffset)
  let width: number | undefined
  let height: number | undefined

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12

    if (entryOffset + 12 > bytes.length) {
      // The IFD continues past what was read; ask for more rather than giving up
      // on a legitimate file with a large IFD.
      return { status: 'need-more' }
    }

    const tag = readUint16(entryOffset)
    const type = readUint16(entryOffset + 2)

    if (tag !== 0x0100 && tag !== 0x0101) {
      continue
    }

    // SHORT (3) and LONG (4) store the value inline.
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

  if (width === undefined || height === undefined) {
    return { status: 'absent' }
  }

  const dimensions = normalize(width, height)
  return dimensions ? { status: 'ok', dimensions } : { status: 'absent' }
}

/**
 * HEIC/AVIF: locate the `ispe` box and read width and height from its payload.
 *
 * Layout after the box header: a 4-byte version/flags field, then width as
 * big-endian uint32, then height.
 */
function readIsoBmffDimensions(bytes: Uint8Array): DimensionParseResult {
  const search = findIspeBox(bytes, 0, bytes.length)

  if (search.status !== 'ok') {
    return search
  }

  // payload + 0 is version/flags, so width is at +4 and height at +8. Reading
  // from +8 instead reported the height as the width and pulled the following
  // four bytes in as the height (1234x567 came out as 567x16).
  const { payload } = search

  if (payload + 12 > bytes.length) {
    return { status: 'need-more' }
  }

  const dimensions = normalize(
    readUint32BE(bytes, payload + 4),
    readUint32BE(bytes, payload + 8)
  )
  return dimensions ? { status: 'ok', dimensions } : { status: 'absent' }
}

type IspeSearch =
  | { status: 'ok'; payload: number }
  | { status: 'need-more' }
  | { status: 'absent' }

/**
 * Depth-first search for the first `ispe` box, returning the offset of its
 * payload (the byte after the box header).
 *
 * Containers (`meta`, `iprp`, `ipco`, `moov`, `trak`, `mdia`) nest their
 * children, so recursion is needed; leaf boxes are skipped by their declared
 * size. A box that extends past the buffer yields `need-more`.
 */
function findIspeBox(
  bytes: Uint8Array,
  start: number,
  end: number,
  depth = 0
): IspeSearch {
  // Bounded to avoid runaway recursion on a crafted file.
  if (depth > 8) {
    return { status: 'absent' }
  }

  const CONTAINERS = new Set(['meta', 'iprp', 'ipco', 'moov', 'trak', 'mdia'])

  let offset = start

  while (offset < end) {
    if (offset + 8 > end) {
      return { status: 'need-more' }
    }

    let size = readUint32BE(bytes, offset)
    const type = ascii(bytes, offset + 4, 4)
    let headerSize = 8

    if (size === 1) {
      // 64-bit size follows the type.
      if (offset + 16 > end) {
        return { status: 'need-more' }
      }

      const high = readUint32BE(bytes, offset + 8)
      const low = readUint32BE(bytes, offset + 12)

      // Guard against exceeding Number's safe integer range.
      if (high > 0x1fffff) {
        return { status: 'absent' }
      }

      size = high * 2 ** 32 + low
      headerSize = 16
    } else if (size === 0) {
      // A zero size means "to the end of the enclosing box".
      size = end - offset
    }

    if (size < headerSize) {
      return { status: 'absent' }
    }

    if (offset + size > end) {
      // The box declares more than was read; the caller may read further.
      return { status: 'need-more' }
    }

    if (type === 'ispe') {
      // The payload needs 4 bytes of version/flags plus two uint32 dimensions.
      return size >= headerSize + 12
        ? { status: 'ok', payload: offset + headerSize }
        : { status: 'absent' }
    }

    if (CONTAINERS.has(type)) {
      // `meta` has a 4-byte version/flags field before its children.
      const childStart =
        type === 'meta' ? offset + headerSize + 4 : offset + headerSize
      const found = findIspeBox(bytes, childStart, offset + size, depth + 1)

      if (found.status !== 'absent') {
        return found
      }
    }

    offset += size
  }

  return { status: 'absent' }
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
