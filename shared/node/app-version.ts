import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * File Release Please keeps at the repository root, beside `CHANGELOG.md`.
 *
 * It is the single source of truth for the released version: the release PR
 * writes it, and the same commit is what the Docker image is built from. That
 * is why the version is read at build time rather than at runtime — the image
 * and the number it displays then come from one commit and cannot disagree.
 */
export const VERSION_FILENAME = 'version.txt'

/**
 * Read the released version.
 *
 * Called from `nuxt.config.ts`, so this runs when the bundle is built. The
 * result is embedded in the build output; the file itself is not needed at
 * runtime (the image does not even contain it).
 *
 * Throws rather than falling back to a placeholder. A missing or empty
 * `version.txt` means the build cannot say which release it is, and quietly
 * showing "unknown" would hide exactly the problem this version display exists
 * to surface. Failing the build is cheap; noticing a wrong version on a running
 * NAS is not.
 */
export function readAppVersion(projectRoot: string = process.cwd()): string {
  const versionPath = resolve(projectRoot, VERSION_FILENAME)

  let raw: string
  try {
    raw = readFileSync(versionPath, 'utf8')
  } catch (cause) {
    throw new Error(
      `Cannot read ${VERSION_FILENAME} at ${versionPath}. It is written by ` +
        'the Release Please pull request and must exist for the build to know ' +
        'which version it is producing.',
      { cause }
    )
  }

  const version = raw.trim()

  if (version === '') {
    throw new Error(
      `${VERSION_FILENAME} at ${versionPath} is empty, so the build cannot ` +
        'report a version.'
    )
  }

  return version
}
