import { program } from '../program'
import { runManagedAction, type ActionOptions } from '../lib/actions'

program
  .command('start')
  .description('Start the Nuxt development server or production preview')
  .option('-y, --yes', 'start the site without the selection prompt')
  .option('--docs', 'start the documentation site')
  .option('--site', 'start the Nuxt gallery site')
  .option('--sync', 'run gallery:sync without prompting')
  .option('--skip-sync', 'skip gallery:sync')
  .option('--preview', 'preview the production output')
  .action(async (options: ActionOptions) => {
    await runManagedAction('start', options)
  })
