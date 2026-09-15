import { resolveGalleryPaths } from './shared/node/gallery-paths'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  css: ['~/assets/css/main.css'],
  modules: ['@nuxt/eslint'],
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
  },
  routeRules: {
    // The admin area is a client-rendered SPA: it has no SEO requirement and
    // its content (session, job progress, pending changes) is runtime state.
    // The public gallery keeps its SSR rendering untouched.
    '/admin/**': { ssr: false },
    // Belt-and-braces with public/robots.txt. Neither is access control —
    // authentication is enforced by the admin API middleware.
    '/api/admin/**': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } }
  }
})
