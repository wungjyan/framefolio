import { Command } from 'commander'

import { chooseAction } from './lib/prompts'
import { runManagedAction, type Action } from './lib/actions'

export const program = new Command()
  .name('foo-cli')
  .description('Interactive Framefolio project manager')
  .showHelpAfterError()

export async function runProgram() {
  if (process.argv.length <= 2) {
    const action = await chooseAction()

    if (action) {
      await runManagedAction(action, {
        promptPrerender: true,
        yes: action === 'build'
      })
    }

    return
  }

  await program.parseAsync(process.argv)
}

export type { Action }
