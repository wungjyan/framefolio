<script setup lang="ts">
import type { GalleryPhoto } from '../../../shared/types/photo'
import {
  buildEditorialGroups,
  type EditorialPattern,
  type PhotoOrientation
} from '../../utils/gallery-layout'

const props = withDefaults(defineProps<{
  photos: GalleryPhoto[]
  previewEnabled?: boolean
  selectedPhotoId?: string
}>(), {
  previewEnabled: false,
  selectedPhotoId: undefined
})

const emit = defineEmits<{
  select: [photo: GalleryPhoto, trigger: HTMLButtonElement]
}>()

const groups = computed(() => buildEditorialGroups(props.photos))

function usePreview(
  pattern: EditorialPattern,
  orientation: PhotoOrientation
): boolean {
  if (!props.previewEnabled) {
    return false
  }

  return pattern === 'feature'
    || (pattern === 'mixed-pair' && orientation !== 'portrait')
}

function selectPhoto(photo: GalleryPhoto, trigger: HTMLButtonElement): void {
  emit('select', photo, trigger)
}
</script>

<template>
  <ol class="editorial-gallery">
    <li
      v-for="group in groups"
      :key="group.id"
      class="editorial-group"
      :data-pattern="group.pattern"
      :data-side="group.side"
    >
      <article
        v-for="(item, itemIndex) in group.items"
        :key="item.photo.id"
        class="editorial-item"
        :data-orientation="item.orientation"
        :data-position="itemIndex"
      >
        <GalleryImage
          :photo="item.photo"
          :priority="item.sourceIndex === 0"
          :selected="selectedPhotoId === item.photo.id"
          :variant="usePreview(group.pattern, item.orientation) ? 'preview' : 'thumbnail'"
          @select="selectPhoto"
        />
      </article>
    </li>
  </ol>
</template>

<style scoped>
.editorial-gallery {
  display: grid;
  padding: 0;
  margin: 0;
  list-style: none;
  gap: clamp(4rem, 7vw, 7rem);
}

.editorial-group {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: clamp(0.75rem, 1.5vw, 1.5rem);
  align-items: start;
}

.editorial-item {
  min-width: 0;
}

.editorial-group[data-pattern="feature"] .editorial-item[data-orientation="landscape"] {
  grid-column: 2 / 12;
}

.editorial-group[data-pattern="feature"] .editorial-item[data-orientation="square"] {
  grid-column: 3 / 11;
}

.editorial-group[data-pattern="feature"] .editorial-item[data-orientation="portrait"] {
  grid-column: 4 / 10;
}

.editorial-group[data-pattern="mixed-pair"] .editorial-item[data-position="0"][data-orientation="portrait"] {
  grid-column: 1 / 5;
}

.editorial-group[data-pattern="mixed-pair"] .editorial-item[data-position="0"]:not([data-orientation="portrait"]) {
  grid-column: 1 / 8;
}

.editorial-group[data-pattern="mixed-pair"] .editorial-item[data-position="1"][data-orientation="portrait"] {
  grid-column: 9 / 13;
  margin-top: clamp(2rem, 3.5vw, 4.5rem);
}

.editorial-group[data-pattern="mixed-pair"] .editorial-item[data-position="1"]:not([data-orientation="portrait"]) {
  grid-column: 8 / 13;
  margin-top: clamp(1.5rem, 2.5vw, 3.5rem);
}

.editorial-group[data-pattern="portrait-pair"] .editorial-item[data-position="0"] {
  grid-column: 1 / 6;
}

.editorial-group[data-pattern="portrait-pair"] .editorial-item[data-position="1"] {
  grid-column: 8 / 13;
  margin-top: clamp(2.25rem, 4.5vw, 5.5rem);
}

.editorial-group[data-pattern="staggered-pair"] .editorial-item[data-position="0"] {
  grid-column: 1 / 8;
}

.editorial-group[data-pattern="staggered-pair"] .editorial-item[data-position="1"] {
  grid-column: 8 / 13;
  margin-top: clamp(1.5rem, 3vw, 3.5rem);
}

.editorial-group[data-pattern="single-aside"][data-side="left"] .editorial-item {
  grid-column: 1 / 8;
}

.editorial-group[data-pattern="single-aside"][data-side="right"] .editorial-item {
  grid-column: 6 / 13;
}

.editorial-group[data-pattern="single-aside"] .editorial-item[data-orientation="portrait"] {
  grid-column-end: span 5;
}

@media (min-width: 48rem) {
  .editorial-group[data-pattern="mixed-pair"] .editorial-item,
  .editorial-group[data-pattern="portrait-pair"] .editorial-item,
  .editorial-group[data-pattern="staggered-pair"] .editorial-item {
    grid-row: 1;
  }
}

@media (max-width: 47.999rem) {
  .editorial-gallery {
    gap: clamp(2.75rem, 12vw, 4.5rem);
  }

  .editorial-group {
    grid-template-columns: minmax(0, 1fr);
    row-gap: clamp(2.75rem, 12vw, 4.5rem);
  }

  .editorial-group .editorial-item {
    grid-column: 1 !important;
    margin-top: 0 !important;
  }
}
</style>
