import { loadEnvFiles } from '../../shared/node/env-files'

/**
 * Populate `process.env` from `.env` files at server startup.
 *
 * Nuxt loads `.env` itself, but not `.env.local`, and a bare
 * `node .output/server/index.mjs` loads neither. Without this, a value placed in
 * `.env.local` is silently ignored and the app behaves as if unconfigured.
 *
 * Which files apply depends on the mode, following the usual convention that
 * `.env.local` is a developer's personal override and must not affect a
 * production deployment:
 *
 *   development: .env, then .env.local (local wins)
 *   production:  .env only
 *
 * In production, prefer passing real environment variables (as the Compose files
 * do); this only fills in a `.env` placed next to the running process.
 *
 * Real environment variables always win over both files, so container settings
 * can never be overridden by a stray file.
 */
export default defineNitroPlugin(() => {
  const isProduction = process.env.NODE_ENV === 'production'
  const filenames = isProduction ? ['.env'] : ['.env', '.env.local']

  const { applied } = loadEnvFiles({ filenames })

  if (applied.length > 0) {
    // Log the keys only. Values are secrets, and printing them would leak the
    // admin password into container logs.
    console.info(
      `[framefolio] Loaded ${applied.length} setting(s) from ${filenames.join(', ')}: ${applied.join(', ')}`
    )
  }
})
