<script setup lang="ts">
import type { GalleryLayout } from '../../utils/gallery-layout'
import {
  createHeaderScrollTracker,
  resetHeaderScrollTracker,
  updateHeaderVisibility
} from '../../utils/header-scroll'

const props = withDefaults(defineProps<{
  layout: GalleryLayout
  autoHide: boolean
  suspended?: boolean
}>(), {
  suspended: false
})

const emit = defineEmits<{
  selectLayout: [layout: GalleryLayout]
}>()

const hidden = ref(false)
const targetLayout = computed<GalleryLayout>(() => (
  props.layout === 'editorial' ? 'justified' : 'editorial'
))
const targetLayoutName = computed(() => (
  targetLayout.value === 'editorial' ? 'Editorial' : 'Justified'
))
const tracker = createHeaderScrollTracker()

let scrollFrame: number | undefined
let resetFrame: number | undefined
let listening = false

onMounted(() => {
  resetTracking()
  syncScrollListener()
})

watch(() => props.autoHide, () => {
  syncScrollListener()

  if (!props.autoHide) {
    hidden.value = false
  }

  scheduleTrackingReset()
})

watch(() => props.suspended, () => {
  scheduleTrackingReset()
})

watch(() => props.layout, async () => {
  hidden.value = false
  await nextTick()
  scheduleTrackingReset()
})

onBeforeUnmount(() => {
  window.cancelAnimationFrame(scrollFrame ?? 0)
  window.cancelAnimationFrame(resetFrame ?? 0)
  stopScrollListener()
})

function selectTargetLayout(): void {
  hidden.value = false
  emit('selectLayout', targetLayout.value)
}

function syncScrollListener(): void {
  if (props.autoHide && !listening) {
    window.addEventListener('scroll', scheduleScrollUpdate, { passive: true })
    listening = true
  } else if (!props.autoHide) {
    stopScrollListener()
  }
}

function stopScrollListener(): void {
  if (!listening) {
    return
  }

  window.removeEventListener('scroll', scheduleScrollUpdate)
  listening = false
}

function scheduleScrollUpdate(): void {
  if (scrollFrame !== undefined) {
    return
  }

  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = undefined

    if (!props.autoHide || props.suspended) {
      resetTracking()
      return
    }

    hidden.value = updateHeaderVisibility(
      tracker,
      window.scrollY,
      hidden.value
    )
  })
}

function scheduleTrackingReset(): void {
  window.cancelAnimationFrame(resetFrame ?? 0)
  resetFrame = window.requestAnimationFrame(() => {
    resetFrame = undefined
    resetTracking()
  })
}

function resetTracking(): void {
  resetHeaderScrollTracker(tracker, window.scrollY)
}
</script>

<template>
  <header
    class="gallery-header"
    :data-hidden="hidden"
    :inert="hidden"
    :aria-hidden="hidden ? 'true' : undefined"
  >
    <h1 class="gallery-wordmark">
      <NuxtLink to="/" aria-label="Framefolio 首页">
        <span>FRAME</span>
        <span>FOLIO</span>
      </NuxtLink>
    </h1>

    <nav class="layout-switch" aria-label="画廊布局">
      <button
        type="button"
        :aria-label="`切换到 ${targetLayoutName} 布局`"
        :title="`切换到 ${targetLayoutName}`"
        @click="selectTargetLayout"
      >
        <svg
          v-if="targetLayout === 'editorial'"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <rect x="1" y="1" width="11" height="8" />
          <rect x="14" y="1" width="5" height="5" />
          <rect x="1" y="11" width="5" height="8" />
          <rect x="8" y="11" width="11" height="8" />
        </svg>
        <svg v-else viewBox="0 0 20 20" aria-hidden="true">
          <rect x="1" y="2" width="7" height="6" />
          <rect x="10" y="2" width="9" height="6" />
          <rect x="1" y="11" width="10" height="7" />
          <rect x="13" y="11" width="6" height="7" />
        </svg>
      </button>
    </nav>
  </header>
</template>

<style scoped>
.gallery-header {
  position: fixed;
  z-index: 10;
  top: 0;
  left: 50%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: min(100%, var(--gallery-content-width));
  height: var(--gallery-header-height);
  padding: var(--gallery-space-md) var(--gallery-gutter) 0;
  pointer-events: none;
  opacity: 1;
  transform: translate(-50%, 0);
  transition:
    opacity var(--gallery-motion-fast) var(--gallery-ease),
    transform var(--gallery-motion-fast) var(--gallery-ease);
}

.gallery-header[data-hidden="true"] {
  opacity: 0;
  transform: translate(-50%, -1rem);
}

.gallery-header[data-hidden="true"] .gallery-wordmark,
.gallery-header[data-hidden="true"] .layout-switch {
  pointer-events: none;
}

.gallery-wordmark {
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 0.9;
  letter-spacing: -0.025em;
  pointer-events: auto;
}

.gallery-wordmark a {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  transition: opacity var(--gallery-motion-fast) var(--gallery-ease);
}

.gallery-wordmark a:hover {
  opacity: 0.55;
}

.gallery-wordmark a:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 4px;
}

.layout-switch {
  display: none;
  pointer-events: auto;
}

.layout-switch button {
  width: 1.75rem;
  height: 1.75rem;
  padding: var(--gallery-space-xs);
  cursor: pointer;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 0;
  color: var(--gallery-muted);
  transition: color var(--gallery-motion-fast) var(--gallery-ease);
}

.layout-switch button:hover {
  color: var(--gallery-ink);
}

.layout-switch button:focus-visible {
  color: var(--gallery-ink);
  outline: 1px solid currentColor;
  outline-offset: 2px;
}

.layout-switch svg {
  width: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
}

@media (min-width: 48rem) {
  .gallery-header {
    padding-top: 2rem;
  }

  .layout-switch {
    display: block;
  }
}
</style>
