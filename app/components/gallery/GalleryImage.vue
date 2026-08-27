<script setup lang="ts">
import type { GalleryPhoto } from '../../../shared/types/photo'

const props = withDefaults(defineProps<{
  photo: GalleryPhoto
  priority?: boolean
  selected?: boolean
  variant?: 'thumbnail' | 'preview'
}>(), {
  priority: false,
  selected: false,
  variant: 'thumbnail'
})

const emit = defineEmits<{
  select: [photo: GalleryPhoto]
}>()

const loadState = ref<'idle' | 'loaded' | 'error'>('idle')

function selectPhoto(): void {
  emit('select', props.photo)
}
</script>

<template>
  <button
    class="gallery-image"
    type="button"
    :aria-label="`打开照片 ${photo.filename}`"
    :aria-pressed="selected"
    :data-state="loadState"
    :style="{ aspectRatio: `${photo.width} / ${photo.height}` }"
    @click="selectPhoto"
  >
    <img
      class="gallery-image__media"
      :src="variant === 'preview' ? photo.preview : photo.thumbnail"
      alt=""
      :width="photo.width"
      :height="photo.height"
      :loading="priority ? 'eager' : 'lazy'"
      :fetchpriority="priority ? 'high' : 'auto'"
      decoding="async"
      @load="loadState = 'loaded'"
      @error="loadState = 'error'"
    >
  </button>
</template>

<style scoped>
.gallery-image {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
  cursor: zoom-in;
  appearance: none;
  background: var(--gallery-surface);
  border: 0;
  border-radius: 0;
  outline: 0;
}

.gallery-image::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: "";
  background: var(--gallery-surface-active);
  opacity: 0;
  transition: opacity var(--gallery-motion-fast) var(--gallery-ease);
}

.gallery-image:hover::after {
  opacity: 0.08;
}

.gallery-image:focus-visible {
  outline: 1px solid var(--gallery-ink);
  outline-offset: 4px;
}

.gallery-image__media {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 1;
}

.gallery-image[data-state="error"] .gallery-image__media {
  visibility: hidden;
}
</style>
