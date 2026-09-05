import { runCommand } from './runtime'

export function runGallerySync() {
  return runCommand('pnpm', [
    'exec',
    'tsx',
    'scripts/gallery-sync.ts'
  ])
}
