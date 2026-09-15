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
