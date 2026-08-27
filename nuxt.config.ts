import { resolveGalleryPaths } from './shared/node/gallery-paths'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  css: ['~/assets/css/main.css'],
  devServer: {
    port: 3123
  },
  devtools: { enabled: true },
  app: {
    head: {
      meta: [{ name: 'color-scheme', content: 'light dark' }],
      script: [
        {
          // Must stay in sync with GALLERY_THEME_STORAGE_KEY and the
          // resolution logic in app/composables/useTheme.ts; runs before
          // first paint to apply the stored or system theme without a flash.
          innerHTML: `(function(){var t;try{t=localStorage.getItem('framefolio:gallery-theme')}catch(e){}if(t!=='dark'&&t!=='light'){try{t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){t='light'}}document.documentElement.dataset.theme=t})()`
        }
      ]
    }
  },
  runtimeConfig: {
    galleryDataDir: resolveGalleryPaths().data
  }
})
