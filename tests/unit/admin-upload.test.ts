import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  detectImageFormat,
  readImageHeader,
  sanitizeUploadFilename,
  sniffFormat,
  validateUploadedImage
} from '../../server/utils/admin-upload'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'framefolio-upload-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Minimal byte signatures; enough to exercise the sniffer. */
const SIGNATURES = {
  jpeg: Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1
  ]),
  png: Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13
  ]),
  webp: Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('WEBP')
  ]),
  tiffLe: Buffer.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 0, 0, 0, 0]),
  tiffBe: Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 0, 0, 0]),
  avif: Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from('ftypavif'),
    Buffer.from([0, 0, 0, 0])
  ]),
  heic: Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from('ftypheic'),
    Buffer.from([0, 0, 0, 0])
  ]),
  html: Buffer.from('<!DOCTYPE html><html><body>x</body></html>'),
  empty: Buffer.alloc(0)
}

describe('image format sniffing', () => {
  it.each([
    ['jpeg', SIGNATURES.jpeg],
    ['png', SIGNATURES.png],
    ['webp', SIGNATURES.webp],
    ['tiff', SIGNATURES.tiffLe],
    ['tiff', SIGNATURES.tiffBe],
    ['avif', SIGNATURES.avif],
    ['heic', SIGNATURES.heic]
  ] as const)('detects %s from its leading bytes', (expected, bytes) => {
    expect(sniffFormat(bytes)).toBe(expected)
  })

  it('rejects HTML masquerading as an image', () => {
    expect(sniffFormat(SIGNATURES.html)).toBeUndefined()
  })

  it('rejects an empty or truncated file', () => {
    expect(sniffFormat(SIGNATURES.empty)).toBeUndefined()
    expect(sniffFormat(Buffer.from([0xff, 0xd8]))).toBeUndefined()
  })
})

describe('uploaded image validation', () => {
  it('accepts a JPEG whose bytes match its extension', async () => {
    const path = join(root, 'photo.jpg')
    await writeFile(path, SIGNATURES.jpeg)

    await expect(validateUploadedImage(path, 'photo.jpg')).resolves.toEqual({
      ok: true,
      format: 'jpeg'
    })
  })

  it('detects the format from disk', async () => {
    const path = join(root, 'photo.png')
    await writeFile(path, SIGNATURES.png)

    await expect(detectImageFormat(path)).resolves.toBe('png')
  })

  it('rejects a disallowed extension', async () => {
    const path = join(root, 'payload.svg')
    await writeFile(path, SIGNATURES.jpeg)

    const result = await validateUploadedImage(path, 'payload.svg')

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('.svg')
  })

  it('rejects HTML renamed to .jpg', async () => {
    // The important case: an accepted extension must not bypass content checks,
    // because generated files are served from the same origin.
    const path = join(root, 'evil.jpg')
    await writeFile(path, SIGNATURES.html)

    const result = await validateUploadedImage(path, 'evil.jpg')

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('not a recognisable image')
  })

  it('rejects bytes that contradict the extension', async () => {
    const path = join(root, 'mismatch.png')
    await writeFile(path, SIGNATURES.jpeg)

    const result = await validateUploadedImage(path, 'mismatch.png')

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('do not match its extension')
  })

  it('requires an extension', async () => {
    const path = join(root, 'noextension')
    await writeFile(path, SIGNATURES.jpeg)

    const result = await validateUploadedImage(path, 'noextension')

    expect(result.ok).toBe(false)
  })
})

describe('upload filename sanitizing', () => {
  it('keeps an ordinary filename', () => {
    expect(sanitizeUploadFilename('holiday.jpg')).toBe('holiday.jpg')
  })

  it('strips directory components from a full path', () => {
    expect(sanitizeUploadFilename('C:\\Users\\me\\Photos\\a.jpg')).toBe('a.jpg')
    expect(sanitizeUploadFilename('/var/tmp/photo.png')).toBe('photo.png')
  })

  it('refuses traversal attempts', () => {
    // The basename is kept, so the traversal is neutralised rather than kept.
    expect(sanitizeUploadFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeUploadFilename('..\\..\\windows\\system32\\x.jpg')).toBe(
      'x.jpg'
    )
  })

  it('strips a leading dot so hidden files are not created', () => {
    expect(sanitizeUploadFilename('.env')).toBe('env')
    expect(sanitizeUploadFilename('...hidden.jpg')).toBe('hidden.jpg')
  })

  it('removes control characters', () => {
    expect(sanitizeUploadFilename('ph\u0000oto\u001f.jpg')).toBe('photo.jpg')
  })

  it('rejects an empty or dot-only name', () => {
    expect(sanitizeUploadFilename('')).toBeUndefined()
    expect(sanitizeUploadFilename('...')).toBeUndefined()
    expect(sanitizeUploadFilename('   ')).toBeUndefined()
  })

  it('rejects an over-long name', () => {
    expect(sanitizeUploadFilename(`${'a'.repeat(256)}.jpg`)).toBeUndefined()
  })
})

describe('pixel dimensions from the header', () => {
  // The upload endpoint enforces FRAMEFOLIO_MAX_UPLOAD_PIXELS with these, so a
  // wrong value either rejects a valid photo or lets an oversized one through.
  it('reads JPEG dimensions without decoding the image', async () => {
    const path = join(root, 'photo.jpg')
    // Minimal SOI + SOF0 for 1234x567.
    const jpeg = Buffer.from([
      0xff,
      0xd8, // SOI
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08, // SOF0, length 17, precision 8
      0x02,
      0x37, // height 567
      0x04,
      0xd2, // width 1234
      0x03,
      0x01,
      0x11,
      0x00,
      0x02,
      0x11,
      0x01,
      0x03,
      0x11,
      0x01
    ])
    await writeFile(path, jpeg)

    const result = await readImageHeader(path)

    expect(result.format).toBe('jpeg')
    expect(result.dimensions).toEqual({ width: 1234, height: 567 })
  })

  it('reads PNG dimensions from IHDR', async () => {
    const path = join(root, 'photo.png')
    const png = Buffer.alloc(24)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
    png.writeUInt32BE(13, 8) // IHDR length
    png.write('IHDR', 12, 'ascii')
    png.writeUInt32BE(800, 16)
    png.writeUInt32BE(600, 20)
    await writeFile(path, png)

    const result = await readImageHeader(path)

    expect(result.format).toBe('png')
    expect(result.dimensions).toEqual({ width: 800, height: 600 })
  })

  it('reads a lossless WebP size, which packs both values into 4 bytes', async () => {
    const path = join(root, 'lossless.webp')
    const webp = Buffer.alloc(30)
    webp.write('RIFF', 0, 'ascii')
    webp.writeUInt32LE(22, 4)
    webp.write('WEBP', 8, 'ascii')
    webp.write('VP8L', 12, 'ascii')
    webp.writeUInt32LE(5, 16)
    webp[20] = 0x2f // signature byte
    // width-1 in bits 0..13, height-1 in bits 14..27
    const packed = (200 - 1) | ((100 - 1) << 14)
    webp.writeUInt32LE(packed >>> 0, 21)
    await writeFile(path, webp)

    const result = await readImageHeader(path)

    expect(result.format).toBe('webp')
    expect(result.dimensions).toEqual({ width: 200, height: 100 })
  })

  it('reports no dimensions for a file it cannot measure', async () => {
    // The caller must treat this as a rejection: assuming no limit here would
    // let a crafted file bypass the check entirely.
    const path = join(root, 'broken.jpg')
    await writeFile(path, Buffer.from([0xff, 0xd8, 0xff]))

    const result = await readImageHeader(path)

    expect(result.dimensions).toBeUndefined()
  })

  it('accepts a file within the pixel limit and reports its size', async () => {
    const path = join(root, 'small.png')
    const png = Buffer.alloc(24)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
    png.writeUInt32BE(13, 8)
    png.write('IHDR', 12, 'ascii')
    png.writeUInt32BE(100, 16)
    png.writeUInt32BE(50, 20)
    await writeFile(path, png)

    const result = await validateUploadedImage(path, 'small.png')

    expect(result.ok).toBe(true)
    expect(result.dimensions).toEqual({ width: 100, height: 50 })
  })
})

describe('JPEG dimensions behind large metadata segments', () => {
  it('finds the frame header past the first read block', async () => {
    // A photo exported from an image editor can carry hundreds of KB of ICC
    // profile, pushing the SOF marker well past 64 KiB. Reading a fixed prefix
    // made the parser give up, and the upload endpoint then rejected a file that
    // sharp handles fine.
    const { DIMENSION_HEADER_BYTES } =
      await import('../../server/utils/image-dimensions')

    const path = join(root, 'big-icc.jpg')
    await writeFile(
      path,
      createJpegWithApp2({ width: 321, height: 123, segments: 4 })
    )

    // Confirm the fixture really does push the frame header past one block,
    // otherwise this test would pass even with the old fixed-size read.
    const raw = await readFile(path)
    const sofOffset = raw.indexOf(Buffer.from([0xff, 0xc0]))
    expect(sofOffset).toBeGreaterThan(DIMENSION_HEADER_BYTES)

    const result = await readImageHeader(path)

    expect(result.format).toBe('jpeg')
    expect(result.dimensions).toEqual({ width: 321, height: 123 })
  })

  it('still reads a JPEG whose metadata fits in the first block', async () => {
    const path = join(root, 'small.jpg')
    await writeFile(
      path,
      createJpegWithApp2({ width: 40, height: 30, segments: 0 })
    )

    const result = await readImageHeader(path)

    expect(result.dimensions).toEqual({ width: 40, height: 30 })
  })

  it('gives up on a header that never contains a frame marker', async () => {
    // Protects against an unbounded read on a crafted file.
    const path = join(root, 'no-frame.jpg')
    const parts = [Buffer.from([0xff, 0xd8])]
    for (let index = 0; index < 40; index += 1) {
      const payload = Buffer.alloc(65533, 0x41)
      const segment = Buffer.alloc(4 + payload.length)
      segment[0] = 0xff
      segment[1] = 0xe2
      segment.writeUInt16BE(payload.length + 2, 2)
      parts.push(segment)
    }
    parts.push(Buffer.from([0xff, 0xd9]))
    await writeFile(path, Buffer.concat(parts))

    const result = await readImageHeader(path)

    // The format is still recognised, but no size could be measured, so the
    // caller rejects the upload rather than assuming there is no limit.
    expect(result.format).toBe('jpeg')
    expect(result.dimensions).toBeUndefined()
  })
})

describe('ISO-BMFF (AVIF) dimensions', () => {
  it('reads width and height from the ispe payload, not one field early', async () => {
    // The payload starts with a 4-byte version/flags field, so the dimensions are
    // at payload+4 and payload+8. Reading from +8 instead reported the height as
    // the width and pulled the next four bytes in as the height: a real
    // 1234x567 AVIF came out as 567x16.
    const path = join(root, 'image.avif')
    await writeFile(path, createIspeFixture(1234, 567))

    const result = await readImageHeader(path)

    expect(result.format).toBe('avif')
    expect(result.dimensions).toEqual({ width: 1234, height: 567 })
  })

  it('does not transpose a tall image', async () => {
    // Guards against a width/height swap, which a square fixture would hide.
    const path = join(root, 'tall.avif')
    await writeFile(path, createIspeFixture(567, 1234))

    const result = await readImageHeader(path)

    expect(result.dimensions).toEqual({ width: 567, height: 1234 })
  })
})

/** Build a JPEG with N maximum-size APP2 segments before the frame header. */
function createJpegWithApp2(input: {
  width: number
  height: number
  segments: number
}): Buffer {
  const sof = Buffer.from([
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (input.height >> 8) & 0xff,
    input.height & 0xff,
    (input.width >> 8) & 0xff,
    input.width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01
  ])

  const parts = [Buffer.from([0xff, 0xd8])]

  for (let index = 0; index < input.segments; index += 1) {
    const payload = Buffer.alloc(65533, 0x41)
    payload.write('ICC_PROFILE\0', 0, 'ascii')
    const segment = Buffer.alloc(4 + payload.length)
    segment[0] = 0xff
    segment[1] = 0xe2
    segment.writeUInt16BE(payload.length + 2, 2)
    payload.copy(segment, 4)
    parts.push(segment)
  }

  parts.push(sof, Buffer.from([0xff, 0xd9]))

  return Buffer.concat(parts)
}

/**
 * Minimal ISO-BMFF container with an `ispe` box inside a `meta` box, matching the
 * structure a real AVIF uses for its size.
 */
function createIspeFixture(width: number, height: number): Buffer {
  const ispePayload = Buffer.alloc(12)
  ispePayload.writeUInt32BE(0, 0) // version + flags
  ispePayload.writeUInt32BE(width, 4)
  ispePayload.writeUInt32BE(height, 8)

  const ispe = box('ispe', ispePayload)

  const metaPayload = Buffer.concat([
    Buffer.alloc(4), // version + flags
    ispe
  ])
  const meta = box('meta', metaPayload)

  const ftypPayload = Buffer.concat([
    Buffer.from('avif', 'ascii'),
    Buffer.alloc(4)
  ])

  return Buffer.concat([
    box('ftyp', ftypPayload),
    meta,
    // Padding so a truncated read can still be detected by the parser.
    Buffer.alloc(16)
  ])
}

/** Wrap a payload in an ISO-BMFF box with a 32-bit size. */
function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(payload.length + 8, 0)
  header.write(type, 4, 'ascii')
  return Buffer.concat([header, payload])
}

describe('JPEG fill bytes before a marker', () => {
  it('finds the frame header when odd numbers of fill bytes precede it', async () => {
    // The JPEG spec permits extra 0xFF bytes between markers: `FF FF C0` means
    // "0xC0, preceded by one fill byte". Advancing 2 bytes on a run of 0xFF
    // swallowed the real marker code whenever the run had an odd length, so a
    // one-byte fill made the frame header invisible. Odd counts are the ones
    // that expose it; an even count pairs up and happens to work.
    for (const fills of [1, 3, 5]) {
      const path = join(root, `fill-${fills}.jpg`)
      await writeFile(path, createJpegWithFillBeforeFrame(321, 123, fills))

      const result = await readImageHeader(path)

      expect(result.dimensions, `${fills} fill byte(s)`).toEqual({
        width: 321,
        height: 123
      })
    }
  })

  it('still reads a frame header with no fill bytes', async () => {
    const path = join(root, 'fill-0.jpg')
    await writeFile(path, createJpegWithFillBeforeFrame(321, 123, 0))

    const result = await readImageHeader(path)

    expect(result.dimensions).toEqual({ width: 321, height: 123 })
  })

  it('tolerates a long run of fill bytes', async () => {
    // Long runs occur in files written by encoders that pad to a boundary.
    const path = join(root, 'fill-many.jpg')
    await writeFile(path, createJpegWithFillBeforeFrame(321, 123, 17))

    const result = await readImageHeader(path)

    expect(result.dimensions).toEqual({ width: 321, height: 123 })
  })
})

/** A JPEG whose SOF marker is preceded by `fills` extra 0xFF bytes. */
function createJpegWithFillBeforeFrame(
  width: number,
  height: number,
  fills: number
): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    // A minimal APP0 segment so the scan has something to skip first.
    Buffer.from([0xff, 0xe0, 0x00, 0x10]),
    Buffer.alloc(14),
    Buffer.from([0xff]),
    Buffer.alloc(fills, 0xff), // the fill run under test
    Buffer.from([
      0xc0,
      0x00,
      0x11,
      0x08,
      (height >> 8) & 0xff,
      height & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
      0x03,
      0x01,
      0x11,
      0x00,
      0x02,
      0x11,
      0x01,
      0x03,
      0x11,
      0x01
    ]),
    Buffer.from([0xff, 0xd9]) // EOI
  ])
}
