import { resolveGalleryPaths } from './shared/node/gallery-paths'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    galleryDataDir: resolveGalleryPaths().data
  }
})
