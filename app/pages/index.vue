<script setup lang="ts">
import type { GalleryPhoto, PhotosResponse } from '../../shared/types/photo'
import PhotoViewer from '../components/viewer/PhotoViewer.vue'

const {
  isDesktop,
  isMobile,
  layout,
  previewEnabled,
  setLayout
} = useGalleryLayout()
const selectedPhotoId = ref<string>()
const viewerTrigger = shallowRef<HTMLButtonElement>()
const {
  data: photos,
  error,
  refresh,
  status
} = useFetch<PhotosResponse>('/api/photos', {
  default: () => []
})

function selectPhoto(photo: GalleryPhoto, trigger?: HTMLButtonElement): void {
  if (trigger) {
    viewerTrigger.value = trigger
  }

  selectedPhotoId.value = photo.id
}

function selectViewerPhoto(photoId: string): void {
  selectedPhotoId.value = photoId
}

async function closeViewer(): Promise<void> {
  selectedPhotoId.value = undefined
  await nextTick()
  viewerTrigger.value?.focus()
  viewerTrigger.value = undefined
}
</script>

<template>
  <div class="gallery-page">
    <GalleryHeader
      :layout="layout"
      :auto-hide="isDesktop"
      :suspended="Boolean(selectedPhotoId)"
      @select-layout="setLayout"
    />

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

    <PhotoViewer
      :photos="photos"
      :photo-id="selectedPhotoId"
      @close="closeViewer"
      @select="selectViewerPhoto"
    />
  </div>
</template>

<style scoped>
.gallery-page {
  min-height: 100vh;
  background: var(--gallery-canvas);
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

</style>
