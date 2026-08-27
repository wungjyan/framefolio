<script setup lang="ts">
import type { GalleryLayout } from "../../utils/gallery-layout";
import type { GalleryTheme } from "../../utils/theme";
import {
  createHeaderScrollTracker,
  resetHeaderScrollTracker,
  updateHeaderVisibility,
} from "../../utils/header-scroll";

const props = withDefaults(
  defineProps<{
    layout: GalleryLayout;
    theme: GalleryTheme;
    autoHide: boolean;
    suspended?: boolean;
  }>(),
  {
    suspended: false,
  },
);

const emit = defineEmits<{
  selectLayout: [layout: GalleryLayout];
  selectTheme: [theme: GalleryTheme];
}>();

const hidden = ref(false);
const targetLayout = computed<GalleryLayout>(() =>
  props.layout === "editorial" ? "justified" : "editorial",
);
const currentLayoutName = computed(() =>
  props.layout === "editorial" ? "Editorial" : "Justified",
);
const targetLayoutName = computed(() =>
  targetLayout.value === "editorial" ? "Editorial" : "Justified",
);
const targetTheme = computed<GalleryTheme>(() =>
  props.theme === "dark" ? "light" : "dark",
);
const currentThemeName = computed(() =>
  props.theme === "dark" ? "深色主题" : "浅色主题",
);
const targetThemeName = computed(() =>
  targetTheme.value === "dark" ? "深色主题" : "浅色主题",
);
const tracker = createHeaderScrollTracker();

let scrollFrame: number | undefined;
let resetFrame: number | undefined;
let listening = false;

onMounted(() => {
  resetTracking();
  syncScrollListener();
});

watch(
  () => props.autoHide,
  () => {
    syncScrollListener();

    if (!props.autoHide) {
      hidden.value = false;
    }

    scheduleTrackingReset();
  },
);

watch(
  () => props.suspended,
  () => {
    scheduleTrackingReset();
  },
);

watch(
  () => props.layout,
  async () => {
    hidden.value = false;
    await nextTick();
    scheduleTrackingReset();
  },
);

onBeforeUnmount(() => {
  window.cancelAnimationFrame(scrollFrame ?? 0);
  window.cancelAnimationFrame(resetFrame ?? 0);
  stopScrollListener();
});

function selectTargetLayout(): void {
  hidden.value = false;
  emit("selectLayout", targetLayout.value);
}

function selectTargetTheme(): void {
  hidden.value = false;
  emit("selectTheme", targetTheme.value);
}

function syncScrollListener(): void {
  if (props.autoHide && !listening) {
    window.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
    listening = true;
  } else if (!props.autoHide) {
    stopScrollListener();
  }
}

function stopScrollListener(): void {
  if (!listening) {
    return;
  }

  window.removeEventListener("scroll", scheduleScrollUpdate);
  listening = false;
}

function scheduleScrollUpdate(): void {
  if (scrollFrame !== undefined) {
    return;
  }

  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = undefined;

    if (!props.autoHide || props.suspended) {
      resetTracking();
      return;
    }

    hidden.value = updateHeaderVisibility(
      tracker,
      window.scrollY,
      hidden.value,
    );
  });
}

function scheduleTrackingReset(): void {
  window.cancelAnimationFrame(resetFrame ?? 0);
  resetFrame = window.requestAnimationFrame(() => {
    resetFrame = undefined;
    resetTracking();
  });
}

function resetTracking(): void {
  resetHeaderScrollTracker(tracker, window.scrollY);
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

    <nav class="header-controls" aria-label="画廊设置">
      <button
        type="button"
        class="layout-switch"
        :aria-label="`当前为 ${currentLayoutName} 布局，切换到 ${targetLayoutName} 布局`"
        :title="`当前：${currentLayoutName}（切换到 ${targetLayoutName}）`"
        @click="selectTargetLayout"
      >
        <svg v-if="layout === 'editorial'" viewBox="0 0 24 24" aria-hidden="true">
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
      </button>

      <button
        type="button"
        class="theme-toggle"
        :aria-label="`当前为${currentThemeName}，切换到${targetThemeName}`"
        :title="`当前：${currentThemeName}（切换到${targetThemeName}）`"
        @click="selectTargetTheme"
      >
        <svg
          class="theme-toggle__icon theme-toggle__icon--dark"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M12 3a6.8 6.8 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
        <svg
          class="theme-toggle__icon theme-toggle__icon--light"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
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
.gallery-header[data-hidden="true"] .header-controls {
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

.header-controls {
  display: flex;
  align-items: flex-start;
  gap: var(--gallery-space-sm);
  pointer-events: auto;
}

.header-controls button {
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

.header-controls button:hover {
  color: var(--gallery-ink);
}

.header-controls button:focus-visible {
  color: var(--gallery-ink);
  outline: 1px solid currentColor;
  outline-offset: 2px;
}

.header-controls svg {
  width: 100%;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.theme-toggle__icon {
  display: none;
}

.theme-toggle__icon--light {
  display: block;
}

.header-controls .layout-switch {
  display: none;
}

@media (min-width: 48rem) {
  .gallery-header {
    padding-top: 2rem;
  }

  .header-controls .layout-switch {
    display: block;
  }
}
</style>
