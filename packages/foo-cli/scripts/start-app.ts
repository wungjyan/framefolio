import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repositoryRoot = resolve(packageRoot, '../..')
const args = ['exec', 'foo-cli', 'start', '--yes']

if (process.env.FOO_CLI_PREVIEW === 'true') args.push('--preview')

const child = spawn('pnpm', args, {
  cwd: repositoryRoot,
  env: process.env,
  stdio: 'inherit'
})

child.on('error', (error) => {
  console.error('Unable to start the Framefolio app:', error.message)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
