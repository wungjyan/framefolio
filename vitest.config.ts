import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Compiles `.vue` single-file components for the component tests. The Nuxt
  // build has its own pipeline; this only exists so a bare Vitest run can import
  // a component.
  plugins: [vue()],
  test: {
    // Pure logic tests run in node; component tests opt into a DOM by adding
    // `// @vitest-environment happy-dom` at the top of the file, so the fast
    // default is not slowed down for the majority of the suite.
    environment: 'node',
    setupFiles: ['./tests/setup/nuxt-globals.ts'],
    include: ['tests/**/*.test.ts']
  }
})
