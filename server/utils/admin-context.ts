import type { H3Event } from 'h3'

import { resolveGalleryPaths, type GalleryPaths } from '../../shared/node/gallery-paths'
import { resolveProjectRoot } from '../../shared/node/sync-runner'
import { resolveAdminConfig, type AdminConfig } from './admin-config'

/**
 * Per-request admin context: resolved paths, config, and the project root used
 * to spawn the sync child process.
 */
export interface AdminContext {
  paths: GalleryPaths
  config: AdminConfig
  projectRoot: string
}

export function getAdminContext(event: H3Event): AdminContext {
  const runtimeConfig = useRuntimeConfig(event)

  return {
    paths: resolveGalleryPaths({ dataDirectory: runtimeConfig.galleryDataDir }),
    config: resolveAdminConfig(),
    // Resolved once per request; the helper falls back to a module-relative
    // path when the process cwd is not the project root (for example under a
    // bundler that relocates this module).
    projectRoot: resolveProjectRoot(import.meta.url)
  }
}
