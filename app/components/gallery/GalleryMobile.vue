<script setup lang="ts">
import type { GalleryPhoto } from '../../../shared/types/photo'

withDefaults(defineProps<{
  photos: GalleryPhoto[]
  selectedPhotoId?: string
}>(), {
  selectedPhotoId: undefined
})

const emit = defineEmits<{
  select: [photo: GalleryPhoto, trigger: HTMLButtonElement]
}>()

function selectPhoto(photo: GalleryPhoto, trigger: HTMLButtonElement): void {
  emit('select', photo, trigger)
}
</script>

<template>
  <ol class="mobile-gallery">
    <li v-for="(photo, index) in photos" :key="photo.id">
      <GalleryImage
        :photo="photo"
        :priority="index === 0"
        :selected="selectedPhotoId === photo.id"
        @select="selectPhoto"
      />
    </li>
  </ol>
</template>

<style scoped>
.mobile-gallery {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding: 0;
  margin: 0;
  list-style: none;
  gap: clamp(2.75rem, 12vw, 4.5rem);
}
</style>
