import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = findRepositoryRoot(dirname(fileURLToPath(import.meta.url)))
export const productionEntry = resolve(repositoryRoot, '.output/server/index.mjs')

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
  environment: NodeJS.ProcessEnv = {}
) {
  return new Promise<number>((resolveExit) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
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
