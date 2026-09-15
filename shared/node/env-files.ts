import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Load `.env`-style files into `process.env`.
 *
 * Why this exists: Nuxt only loads `.env` into the server runtime, and a bare
 * `node .output/server/index.mjs` loads no `.env` file at all. A `.env.local`
 * (the file most people create, by convention) never reaches `process.env`, so
 * configuration that reads `process.env` silently ignores it — the app just
 * behaves as if nothing were configured.
 *
 * Configuration reads `process.env` rather than Nuxt's `runtimeConfig` on
 * purpose: the sync pipeline runs as a separate child process that cannot see
 * `runtimeConfig`, so `process.env` is the only channel both sides share.
 *
 * Precedence, highest first:
 *   1. A real environment variable — never overwritten
 *   2. `.env.local` — the local override
 *   3. `.env` — shared defaults
 *
 * Rule 2 is why the loader compares values instead of only checking whether a
 * key exists. In dev, Nuxt has already copied `.env` into `process.env` before
 * this runs, so "the key exists" cannot distinguish a file value from a real
 * environment variable. Comparing against the file's own value can: if the
 * current value still equals what `.env` said, it came from the file and
 * `.env.local` is allowed to win.
 */

export interface LoadEnvFilesOptions {
  /** Directory to search. Defaults to the current working directory. */
  directory?: string
  /** Files to load, in increasing order of precedence. */
  filenames?: string[]
  /** Injected for tests. */
  environment?: NodeJS.ProcessEnv
}

const DEFAULT_FILENAMES = ['.env', '.env.local']

/** Files already loaded, so repeated calls do not re-read from disk. */
const loaded = new Set<string>()

export interface LoadEnvFilesResult {
  /** Keys whose value this call changed. */
  applied: string[]
  /** Keys left alone because a real environment variable was set. */
  skipped: string[]
}

/**
 * Load the given files into `process.env`. Missing files are ignored.
 */
export function loadEnvFiles(
  options: LoadEnvFilesOptions = {}
): LoadEnvFilesResult {
  const directory = options.directory ?? process.cwd()
  const filenames = options.filenames ?? DEFAULT_FILENAMES
  const environment = options.environment ?? process.env

  const applied: string[] = []
  const skipped: string[] = []

  // Lowest precedence first, so later files overwrite earlier ones in `values`.
  const values = new Map<string, string>()
  const baseline = new Map<string, string>()

  for (const filename of filenames) {
    const path = resolve(directory, filename)

    // Remember what the lowest-precedence file said, to recognise values that
    // came from a file rather than from the real environment.
    const isBaseline = baseline.size === 0

    let contents: string
    try {
      contents = readFileSync(path, 'utf8')
    } catch {
      // Optional file: a deployment may supply everything through real
      // environment variables instead.
      continue
    }

    for (const [key, value] of parseEnvFile(contents)) {
      values.set(key, value)

      if (isBaseline && !baseline.has(key)) {
        baseline.set(key, value)
      }
    }
  }

  for (const [key, value] of values) {
    const current = environment[key]

    if (current === undefined) {
      environment[key] = value
      applied.push(key)
      continue
    }

    // A value that still matches the lowest-precedence file came from a file we
    // loaded (or that Nuxt loaded), so a higher-precedence file may override it.
    const fromFile = baseline.get(key) === current

    if (fromFile && current !== value) {
      environment[key] = value
      applied.push(key)
      continue
    }

    skipped.push(key)
  }

  return { applied, skipped }
}

/** Test helper: clear the "already loaded" memo. */
export function resetLoadedEnvFiles(): void {
  loaded.clear()
}

/**
 * Parse dotenv syntax.
 *
 * Deliberately small, but it handles what people actually write: comments,
 * blank lines, an optional `export` prefix, values containing `=`, and single-
 * or double-quoted values (quotes stripped; inside double quotes `\n` and
 * friends are expanded, matching dotenv).
 */
export function parseEnvFile(contents: string): [string, string][] {
  const entries: [string, string][] = []

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (line.length === 0 || line.startsWith('#')) {
      continue
    }

    const withoutExport = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line

    const separator = withoutExport.indexOf('=')

    if (separator <= 0) {
      continue
    }

    const key = withoutExport.slice(0, separator).trim()

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue
    }

    entries.push([key, parseValue(withoutExport.slice(separator + 1).trim())])
  }

  return entries
}

function parseValue(raw: string): string {
  // Strip an unquoted trailing comment (`KEY=value # note`).
  const withoutComment = stripTrailingComment(raw)

  if (
    withoutComment.length >= 2 &&
    withoutComment.startsWith('"') &&
    withoutComment.endsWith('"')
  ) {
    return withoutComment
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
  }

  if (
    withoutComment.length >= 2 &&
    withoutComment.startsWith("'") &&
    withoutComment.endsWith("'")
  ) {
    // Single quotes are literal in dotenv: no escape processing.
    return withoutComment.slice(1, -1)
  }

  return withoutComment
}

/**
 * Remove a `# comment` that follows an unquoted value.
 *
 * A `#` inside quotes is part of the value, so quoting is respected.
 */
function stripTrailingComment(raw: string): string {
  let quote: '"' | "'" | undefined

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]

    if (quote) {
      if (character === quote) {
        quote = undefined
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '#') {
      return raw.slice(0, index).trim()
    }
  }

  return raw
}
