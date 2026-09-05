import { program } from '../program'
import { runCommand } from '../lib/runtime'

program
  .command('typecheck')
  .description('Typecheck the CLI and Nuxt application')
  .action(async () => {
    const cliExitCode = await runCommand('pnpm', [
      'exec',
      'tsc',
      '--noEmit',
      '-p',
      'packages/foo-cli/tsconfig.json'
    ])

    if (cliExitCode !== 0) {
      process.exitCode = cliExitCode
      return
    }

    const exitCode = await runCommand('pnpm', ['exec', 'nuxt', 'typecheck'])
    if (exitCode !== 0) process.exitCode = exitCode
  })
