import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { program } from '../program'
import { repositoryRoot, runCommand } from '../lib/runtime'

program
  .command('prepare')
  .description('Generate Nuxt types and build metadata')
  .action(async () => {
    if (!existsSync(resolve(repositoryRoot, 'nuxt.config.ts'))) return

    const exitCode = await runCommand('pnpm', ['exec', 'nuxt', 'prepare'])
    if (exitCode !== 0) process.exitCode = exitCode
  })
