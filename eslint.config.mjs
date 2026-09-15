import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // Prettier always prints self-closing void elements (`<img />`), while the
    // Nuxt default for this rule is the opposite. Align ESLint with the
    // formatter so `lint` and `format` do not fight each other.
    'vue/html-self-closing': [
      'warn',
      {
        html: { void: 'always', normal: 'always', component: 'always' },
        svg: 'always',
        math: 'always'
      }
    ]
  }
})
