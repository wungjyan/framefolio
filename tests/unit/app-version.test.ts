import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readAppVersion, VERSION_FILENAME } from '../../shared/node/app-version'

/**
 * The admin header reports the version the running image was built from.
 *
 * The value is read while the bundle is built, from the file the Release Please
 * pull request writes. What matters here is that it either reports the real
 * version or refuses to build — never a fabricated one, since a wrong version
 * number is worse than none at all when the whole point is telling deployments
 * apart.
 */

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'framefolio-version-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function writeVersion(contents: string): Promise<void> {
  await writeFile(join(root, VERSION_FILENAME), contents, 'utf8')
}

describe('readAppVersion', () => {
  it('reads the version Release Please wrote', async () => {
    await writeVersion('1.1.0\n')

    expect(readAppVersion(root)).toBe('1.1.0')
  })

  it('trims the trailing newline and any surrounding whitespace', async () => {
    await writeVersion('\n  1.2.3  \n\n')

    expect(readAppVersion(root)).toBe('1.2.3')
  })

  it('keeps a prerelease suffix intact', async () => {
    // The file is not parsed, only trimmed, so anything Release Please or a
    // future release type writes survives unchanged.
    await writeVersion('2.0.0-rc.1\n')

    expect(readAppVersion(root)).toBe('2.0.0-rc.1')
  })

  it('fails the build when the file is missing', async () => {
    // The image is built from the release commit, which always has the file. A
    // missing one means the build cannot say what it is producing, and showing
    // "unknown" would hide exactly that.
    expect(() => readAppVersion(root)).toThrow(/Cannot read version\.txt/)
  })

  it('fails the build when the file is empty', async () => {
    await writeVersion('\n  \n')

    expect(() => readAppVersion(root)).toThrow(/is empty/)
  })

  it('names the path it looked in, so the failure is actionable', async () => {
    expect(() => readAppVersion(root)).toThrow(new RegExp(root))
  })

  it('reads the repository version by default', () => {
    // Guards the wiring: nuxt.config.ts calls this with no argument, so the
    // real file at the repository root must be readable from the process cwd
    // the build runs in.
    expect(readAppVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('version wiring', () => {
  /**
   * The value only reaches the page if three separate places agree on one name:
   * `nuxt.config.ts` puts it under `runtimeConfig.public.appVersion`, and the
   * admin page reads that same key. Nothing type-checks across that boundary,
   * so a rename in one place would render "vundefined" in the header while all
   * tests stayed green.
   */
  async function read(relativePath: string): Promise<string> {
    const { readFile } = await import('node:fs/promises')
    return readFile(relativePath, 'utf8')
  }

  it('injects the version into the public runtime config', async () => {
    const config = await read('nuxt.config.ts')

    expect(config).toContain('readAppVersion()')
    expect(config).toMatch(
      /public:\s*\{[\s\S]*appVersion:\s*readAppVersion\(\)/
    )
  })

  it('is read by the admin page under the same key', async () => {
    const page = await read('app/pages/admin/index.vue')

    // Matches only `.public`, not merely something starting with it — an
    // earlier, looser pattern passed against `.publicX`, which would have
    // resolved to undefined at runtime.
    expect(page).toMatch(
      /const\s*\{\s*appVersion\s*\}\s*=\s*useRuntimeConfig\(\)\.public\b/
    )
  })

  it('renders the badge with that value', async () => {
    const page = await read('app/pages/admin/index.vue')

    expect(page).toContain('<AdminVersionBadge :version="appVersion" />')
  })
})
