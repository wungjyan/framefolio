import { pathToFileURL } from 'node:url'

import { runGallerySync } from './lib/gallery-sync'

async function main(): Promise<void> {
  const result = await runGallerySync()
  const { summary } = result

  console.info([
    'Gallery sync complete:',
    `added ${summary.added}`,
    `updated ${summary.updated}`,
    `skipped ${summary.skipped}`,
    `deleted ${summary.deleted}`,
    `failed ${summary.failed}`
  ].join(' '))

  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`)
  }

  for (const error of result.errors) {
    console.error(`Failed: ${error.filename}: ${error.message}`)
  }

  if (result.errors.length > 0) {
    process.exitCode = 1
  }
}

const entryPath = process.argv[1]

if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Gallery sync aborted: ${message}`)
    process.exitCode = 1
  })
}
