import { program } from '../program'
import { runGallerySync } from '../lib/gallery'
import {
  hasProductionEntry,
  parsePort,
  productionEntry,
  runCommand
} from '../lib/runtime'

type WebOptions = {
  host: string
  port: string
}

program
  .command('web')
  .description('Sync the gallery and run the production web server')
  .option('--host <host>', 'server host', '127.0.0.1')
  .option('-p, --port <port>', 'server port', '3123')
  .action(async (options: WebOptions) => {
    const port = parsePort(options.port)
    const syncExitCode = await runGallerySync()

    if (syncExitCode !== 0) {
      process.exitCode = syncExitCode
      return
    }

    if (!hasProductionEntry()) {
      const buildExitCode = await runCommand('pnpm', ['exec', 'nuxt', 'build'])

      if (buildExitCode !== 0) {
        process.exitCode = buildExitCode
        return
      }
    }

    const exitCode = await runCommand(
      process.execPath,
      [productionEntry],
      {
        NODE_ENV: 'production',
        NITRO_HOST: options.host,
        NITRO_PORT: String(port)
      }
    )

    if (exitCode !== 0) process.exitCode = exitCode
  })
