import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Directory that contains this CLI package (source tree or installed node_modules). */
export const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  // Bundled entry lives at <packageRoot>/dist; source entry at <packageRoot>/src/lib.
  // Both are exactly one level below the package root.
  '..'
)
/** Repository root that hosts the Nuxt application (only present when run from source). */
export const repositoryRoot = findRepositoryRoot(packageRoot)

/**
 * Production output directory owned by the CLI package itself. The main project
 * build copies its `.output` here so the published package can serve the web
 * command without depending on the repository checkout.
 */
export const packagedProductionOutput = resolve(packageRoot, '.output')

/** Legacy fallback: the repository-root build output. */
export const repositoryProductionOutput = resolve(repositoryRoot, '.output')

export const productionEntry = resolve(packagedProductionOutput, 'server/index.mjs')

export function parsePort(value: string) {
  const port = Number(value)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}. Use an integer from 1 to 65535.`)
  }

  return port
}

export function hasProductionEntry() {
  return existsSync(productionEntry)
}

export function runCommand(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv = {},
  cwd: string = repositoryRoot
) {
  return new Promise<number>((resolveExit) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: 'inherit'
    })

    child.on('error', (error) => {
      console.error(`Unable to run ${command}:`, error.message)
      resolveExit(1)
    })

    child.on('exit', (code, signal) => {
      resolveExit(code ?? (signal ? 1 : 0))
    })
  })
}

function findRepositoryRoot(startDirectory: string) {
  let directory = startDirectory

  while (true) {
    if (existsSync(join(directory, 'nuxt.config.ts'))) {
      return directory
    }

    const parent = dirname(directory)
    if (parent === directory) return process.cwd()
    directory = parent
  }
}
