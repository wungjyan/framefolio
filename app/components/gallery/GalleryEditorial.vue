<script setup lang="ts">
import type { GalleryPhoto } from '../../../shared/types/photo'
import { buildEditorialRows } from '../../utils/gallery-layout'

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
const itemsPerRow = ref(3)
let observer: ResizeObserver | undefined
let resizeFrame: number | undefined

const rows = computed(() => buildEditorialRows(
  props.photos,
  itemsPerRow.value
))

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (!entry) {
      return
    }

    window.cancelAnimationFrame(resizeFrame ?? 0)
    resizeFrame = window.requestAnimationFrame(() => {
      itemsPerRow.value = getItemsPerRow(entry.contentRect.width)
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

function getItemsPerRow(containerWidth: number): number {
  if (containerWidth >= 896) {
    return 3
  }

  return 2
}
</script>

<template>
  <div ref="container" class="editorial-layout">
    <ol class="editorial-gallery">
      <li
        v-for="row in rows"
        :key="row.id"
        class="editorial-row"
        :data-full="row.items.length === itemsPerRow"
      >
        <article
          v-for="item in row.items"
          :key="item.photo.id"
          class="editorial-item"
          :data-orientation="item.orientation"
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
  </div>
</template>

<style scoped>
.editorial-layout {
  container-name: editorial;
  container-type: inline-size;
}

.editorial-gallery {
  --editorial-column-gap: clamp(1rem, 2.25cqw, 2.25rem);
  --editorial-row-gap: clamp(2.75rem, 7cqw, 4.75rem);
  display: grid;
  gap: var(--editorial-row-gap);
  padding: 0;
  margin: 0;
  list-style: none;
}

.editorial-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--editorial-column-gap);
}

.editorial-row[data-full="true"] {
  justify-content: space-between;
}

.editorial-item {
  flex: 0 1 var(--editorial-item-width);
  min-width: 0;
}

.editorial-item[data-orientation="landscape"] {
  --editorial-item-width: 48%;
}

.editorial-item[data-orientation="square"] {
  --editorial-item-width: 43%;
}

.editorial-item[data-orientation="portrait"] {
  --editorial-item-width: 38%;
}

@container editorial (min-width: 56rem) {
  .editorial-item[data-orientation="landscape"] {
    --editorial-item-width: min(34cqw, 30rem);
  }

  .editorial-item[data-orientation="square"] {
    --editorial-item-width: min(30cqw, 25rem);
  }

  .editorial-item[data-orientation="portrait"] {
    --editorial-item-width: min(27cqw, 22rem);
  }
}
</style>
