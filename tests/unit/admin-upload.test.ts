import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  detectImageFormat,
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
