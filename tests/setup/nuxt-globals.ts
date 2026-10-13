/**
 * Provide the Nuxt auto-imports that components rely on.
 *
 * Components in this project use `ref`, `computed`, and friends without
 * importing them, because Nuxt injects them at build time. A bare Vitest run
 * has no such transform, so the handful used by the tested components is exposed
 * on `globalThis` here.
 *
 * This is deliberately a small, explicit list: adding a global that a component
 * does not actually use would hide a missing import rather than surface it.
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  readonly,
  ref,
  shallowRef,
  toRef,
  toRefs,
  watch,
  watchEffect
} from 'vue'

import { installTestUseLocale } from '../helpers/locale'

const globals = {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  readonly,
  ref,
  shallowRef,
  toRef,
  toRefs,
  watch,
  watchEffect
}

for (const [name, value] of Object.entries(globals)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any)[name] = value
}

/**
 * `useLocale` is installed as a stand-in rather than stubbed per test file.
 *
 * Every admin component calls it, so stubbing individually would be noise. The
 * stand-in uses the real catalogues and the real error-code mapping, so a
 * missing translation or an unmapped code still fails; only the *resolution* of
 * the locale (localStorage / navigator.language) is replaced, and that has its
 * own unit tests.
 */
installTestUseLocale()
