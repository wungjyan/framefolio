<script setup lang="ts">
import type { GalleryPhoto } from '../../../shared/types/photo'
import { buildJustifiedRows } from '../../utils/gallery-layout'

const props = withDefaults(defineProps<{
  photos: GalleryPhoto[]
  selectedPhotoId?: string
}>(), {
  selectedPhotoId: undefined
})

const emit = defineEmits<{
  select: [photo: GalleryPhoto, trigger: HTMLButtonElement]
}>()

const container = ref<HTMLElement>()
const containerWidth = ref(0)
const gap = 10
let observer: ResizeObserver | undefined
let resizeFrame: number | undefined

const rows = computed(() => buildJustifiedRows(props.photos, {
  containerWidth: containerWidth.value,
  gap,
  targetRowHeight: containerWidth.value >= 1200 ? 280 : 230
}))

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (!entry) {
      return
    }

    const nextWidth = entry.contentRect.width
    window.cancelAnimationFrame(resizeFrame ?? 0)
    resizeFrame = window.requestAnimationFrame(() => {
      if (Math.abs(containerWidth.value - nextWidth) >= 0.5) {
        containerWidth.value = nextWidth
      }
    })
  })
  observer.observe(container.value as HTMLElement)
})

onBeforeUnmount(() => {
  window.cancelAnimationFrame(resizeFrame ?? 0)
  observer?.disconnect()
})

function selectPhoto(photo: GalleryPhoto, trigger: HTMLButtonElement): void {
  emit('select', photo, trigger)
}
</script>

<template>
  <ol ref="container" class="justified-gallery">
    <li
      v-for="row in rows"
      :key="row.id"
      class="justified-row"
      :data-last="row.isLast"
    >
      <article
        v-for="item in row.items"
        :key="item.photo.id"
        class="justified-item"
        :style="{
          width: `${item.width}px`,
          height: `${item.height}px`
        }"
      >
        <GalleryImage
          :photo="item.photo"
          :priority="item.sourceIndex === 0"
          :selected="selectedPhotoId === item.photo.id"
          @select="selectPhoto"
        />
      </article>
    </li>
  </ol>
</template>

<style scoped>
.justified-gallery {
  display: grid;
  width: 100%;
  padding: 0;
  margin: 0;
  list-style: none;
  gap: 0.625rem;
}

.justified-row {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
}

.justified-item {
  flex: none;
  min-width: 0;
}

@media (max-width: 47.999rem) {
  .justified-gallery,
  .justified-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(2.75rem, 12vw, 4.5rem);
  }

  .justified-item {
    width: 100% !important;
    height: auto !important;
  }
}
</style>
