import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { createTemporaryPath } from './temporary-files'

/**
 * Read and parse a JSON file, returning `undefined` when it is missing or not
 * valid JSON. Callers treat that as "no stored state yet" rather than an error.
 */
export async function readJsonFile<T>(path: string): Promise<T | undefined> {
  let contents: string

  try {
    contents = await readFile(path, 'utf8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }

  try {
    return JSON.parse(contents) as T
  } catch {
    return undefined
  }
}

/**
 * Write a JSON file atomically: write to a unique temporary file, then rename.
 *
 * The temporary name includes the pid and a random suffix so two processes
 * writing the same target never share a temporary path.
 */
export async function writeJsonFileAtomic(
  path: string,
  value: unknown
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })

  const temporaryPath = createTemporaryPath(path)

  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(value, null, 2)}\n`,
      'utf8'
    )
    await rename(temporaryPath, path)
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}
