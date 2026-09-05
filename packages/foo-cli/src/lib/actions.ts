import { outro } from '@clack/prompts'

import { copyBuildOutputToPackage, reportBuildResult } from './artifacts'
import { runGallerySync } from './gallery'
import {
  chooseStartTargets,
  confirmGallerySync,
  confirmPrerender
} from './prompts'
import { runCommand } from './runtime'

export type Action = 'start' | 'build'

export type ActionOptions = {
  docs?: boolean
  prerender?: boolean
  site?: boolean
  preview?: boolean
  promptPrerender?: boolean
  skipSync?: boolean
  sync?: boolean
  yes?: boolean
}

export async function runManagedAction(
  action: Action,
  options: ActionOptions = {}
) {
  if (action === 'start') {
    const targets = await chooseStartTargets(
      options.docs,
      options.site,
      options.yes === true
    )

    if (targets === undefined) return
    if (!targets.docs && !targets.site) return

    if (targets.site) {
      const shouldSync = await confirmGallerySync(
        options.skipSync ? false : options.sync,
        options.yes === true
      )

      if (shouldSync === undefined) return

      if (shouldSync) {
        const syncExitCode = await runGallerySync()
        if (syncExitCode !== 0) {
          process.exitCode = syncExitCode
          return
        }
      }
    }

    const command = options.preview ? 'preview' : 'dev'
    const args = targets.docs && targets.site
      ? ['exec', 'turbo', 'run', 'start:app', 'docs:dev']
      : targets.docs
        ? ['exec', 'turbo', 'run', 'docs:dev']
        : ['exec', 'nuxt', command]
    const exitCode = await runCommand('pnpm', args, {
      FOO_CLI_PREVIEW: options.preview ? 'true' : 'false'
    })

    if (exitCode !== 0) process.exitCode = exitCode
    return
  }

  const prerender = await confirmPrerender(
    options.prerender,
    options.yes === true && options.promptPrerender !== true
  )

  if (prerender === undefined) return

  const command = prerender ? 'generate' : 'build'
  const exitCode = await runCommand('pnpm', ['exec', 'nuxt', command])

  if (exitCode !== 0) {
    process.exitCode = exitCode
    return
  }

  copyBuildOutputToPackage()
  reportBuildResult(prerender)
}
