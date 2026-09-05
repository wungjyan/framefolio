import { program } from '../program'
import { runCommand } from '../lib/runtime'

program
  .command('test')
  .description('Run the Vitest suite')
  .action(async () => {
    const exitCode = await runCommand('pnpm', ['exec', 'vitest', 'run'])
    if (exitCode !== 0) process.exitCode = exitCode
  })
