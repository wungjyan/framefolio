<script setup lang="ts">
import type { GalleryPhoto, PhotosResponse } from '../../shared/types/photo'

const {
  isMobile,
  layout,
  previewEnabled,
  setLayout
} = useGalleryLayout()
const selectedPhotoId = ref<string>()
const {
  data: photos,
  error,
  refresh,
  status
} = useFetch<PhotosResponse>('/api/photos', {
  default: () => []
})

function selectPhoto(photo: GalleryPhoto): void {
  selectedPhotoId.value = photo.id
}
</script>

<template>
  <div class="gallery-page">
    <header class="gallery-header">
      <h1 class="gallery-wordmark">
        <NuxtLink to="/" aria-label="Framefolio 首页">
          <span>FRAME</span>
          <span>FOLIO</span>
        </NuxtLink>
      </h1>

      <nav class="layout-switch" aria-label="画廊布局">
        <button
          type="button"
          aria-label="Editorial 布局"
          title="Editorial"
          :aria-pressed="layout === 'editorial'"
          @click="setLayout('editorial')"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="1" y="1" width="11" height="8" />
            <rect x="14" y="1" width="5" height="5" />
            <rect x="1" y="11" width="5" height="8" />
            <rect x="8" y="11" width="11" height="8" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Justified 布局"
          title="Justified"
          :aria-pressed="layout === 'justified'"
          @click="setLayout('justified')"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="1" y="2" width="7" height="6" />
            <rect x="10" y="2" width="9" height="6" />
            <rect x="1" y="11" width="10" height="7" />
            <rect x="13" y="11" width="6" height="7" />
          </svg>
        </button>
      </nav>
    </header>

    <main class="gallery-main">
      <section
        v-if="status === 'pending' && photos.length === 0"
        class="gallery-loading"
        aria-label="正在加载照片"
        aria-busy="true"
      >
        <span v-for="index in 3" :key="index" />
      </section>

      <section
        v-else-if="error"
        class="gallery-state"
        role="alert"
        aria-label="照片加载失败"
      >
        <button type="button" aria-label="重新加载" @click="refresh()">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.34 5.66" />
            <path d="M20 5v6h-6" />
          </svg>
        </button>
      </section>

      <section
        v-else-if="photos.length === 0"
        class="gallery-state"
        role="status"
        aria-label="暂无照片"
      >
        <svg class="gallery-state__empty" viewBox="0 0 32 24" aria-hidden="true">
          <rect x="0.5" y="0.5" width="31" height="23" />
        </svg>
      </section>

      <GalleryMobile
        v-else-if="isMobile"
        :photos="photos"
        :selected-photo-id="selectedPhotoId"
        @select="selectPhoto"
      />

      <GalleryJustified
        v-else-if="layout === 'justified'"
        :photos="photos"
        :selected-photo-id="selectedPhotoId"
        @select="selectPhoto"
      />

      <GalleryEditorial
        v-else
        :photos="photos"
        :preview-enabled="previewEnabled"
        :selected-photo-id="selectedPhotoId"
        @select="selectPhoto"
      />
    </main>
  </div>
</template>

<style scoped>
.gallery-page {
  min-height: 100vh;
  background: var(--gallery-canvas);
}

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
  transform: translateX(-50%);
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
  align-items: center;
  gap: var(--gallery-space-sm);
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

.layout-switch button:hover,
.layout-switch button[aria-pressed="true"] {
  color: var(--gallery-ink);
}

.layout-switch button:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 2px;
}

.layout-switch svg {
  width: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
}

.gallery-main {
  width: min(100%, var(--gallery-content-width));
  min-height: 100vh;
  padding: var(--gallery-header-height) var(--gallery-gutter) var(--gallery-space-lg);
  margin: 0 auto;
}

.gallery-loading {
  display: grid;
  width: min(100%, var(--gallery-image-width));
  margin: 0 auto;
  gap: var(--gallery-space-lg);
}

.gallery-loading span {
  display: block;
  aspect-ratio: 3 / 2;
  background: var(--gallery-surface);
  animation: gallery-pulse 1.4s ease-in-out infinite alternate;
}

.gallery-loading span:nth-child(2) {
  aspect-ratio: 4 / 5;
}

.gallery-state {
  display: grid;
  min-height: calc(100vh - var(--gallery-header-height));
  place-items: center;
  color: var(--gallery-muted);
}

.gallery-state button {
  width: 2rem;
  height: 2rem;
  padding: var(--gallery-space-xs);
  cursor: pointer;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 0;
  color: inherit;
}

.gallery-state button:hover,
.gallery-state button:focus-visible {
  color: var(--gallery-ink);
}

.gallery-state button:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 4px;
}

.gallery-state button svg {
  fill: none;
  stroke: currentColor;
  stroke-linecap: square;
  stroke-width: 1.25;
}

.gallery-state__empty {
  width: 2rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 0.75;
}

@keyframes gallery-pulse {
  from {
    opacity: 0.55;
  }
  to {
    opacity: 1;
  }
}

@media (min-width: 48rem) {
  .gallery-header {
    padding-top: 2rem;
  }

  .layout-switch {
    display: flex;
  }
}
</style>
