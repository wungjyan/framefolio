import { program } from '../program'
import { runManagedAction, type ActionOptions } from '../lib/actions'

program
  .command('build')
  .description('Build the Nuxt app, optionally pre-rendering static pages')
  .option('-y, --yes', 'skip pre-rendering prompt and use a server build')
  .option('--prerender', 'pre-render pages as deployable static assets')
  .action(async (options: ActionOptions) => {
    await runManagedAction('build', options)
  })
