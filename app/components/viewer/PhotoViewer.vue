<script setup lang="ts">
import type { GalleryPhoto } from '../../../shared/types/photo'
import { buildPhotoMetadata } from '../../utils/photo-viewer'

const props = withDefaults(defineProps<{
  photos: GalleryPhoto[]
  photoId?: string
}>(), {
  photoId: undefined
})

const emit = defineEmits<{
  close: []
  select: [photoId: string]
}>()

const dialog = ref<HTMLDialogElement>()
const currentIndex = computed(() => (
  props.photoId
    ? props.photos.findIndex(photo => photo.id === props.photoId)
    : -1
))
const currentPhoto = computed(() => props.photos[currentIndex.value])
const image = ref<HTMLImageElement>()
const isImageLoading = ref(false)
const metadata = computed(() => (
  currentPhoto.value ? buildPhotoMetadata(currentPhoto.value) : {}
))
const hasPrevious = computed(() => currentIndex.value > 0)
const hasNext = computed(() => (
  currentIndex.value >= 0 && currentIndex.value < props.photos.length - 1
))

let previousOverflow = ''
let scrollLocked = false

onMounted(() => {
  syncDialog()
})

watch([() => props.photoId, currentPhoto], () => {
  syncDialog()
})

watch(currentPhoto, (photo) => {
  isImageLoading.value = Boolean(photo)

  if (photo) {
    nextTick(() => {
      if (currentPhoto.value?.id === photo.id && image.value?.complete) {
        completeImageLoading()
      }
    })
  }
}, { flush: 'post' })

watch(currentIndex, () => {
  preloadAdjacentPhotos()
}, { immediate: true })

onBeforeUnmount(() => {
  unlockBackgroundScroll()
})

function syncDialog(): void {
  const element = dialog.value

  if (!element) {
    return
  }

  if (currentPhoto.value && !element.open) {
    element.showModal()
    lockBackgroundScroll()
    nextTick(() => focusCloseButton())
  } else if (!currentPhoto.value && element.open) {
    element.close()
  }
}

function closeViewer(): void {
  dialog.value?.close()
}

function handleClosed(): void {
  unlockBackgroundScroll()
  emit('close')
}

function handleBackdropClick(event: MouseEvent): void {
  if (event.target === dialog.value) {
    closeViewer()
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    showPrevious()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    showNext()
  } else if (event.key === 'Tab') {
    constrainFocus(event)
  }
}

function showPrevious(): void {
  if (hasPrevious.value) {
    emit('select', props.photos[currentIndex.value - 1]!.id)
  }
}

function showNext(): void {
  if (hasNext.value) {
    emit('select', props.photos[currentIndex.value + 1]!.id)
  }
}

function focusCloseButton(): void {
  dialog.value?.querySelector<HTMLElement>('[data-viewer-close]')?.focus()
}

function completeImageLoading(): void {
  isImageLoading.value = false
}

function constrainFocus(event: KeyboardEvent): void {
  const focusable = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []
  )

  if (focusable.length === 0) {
    event.preventDefault()
    return
  }

  const first = focusable[0]!
  const last = focusable.at(-1)!

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function preloadAdjacentPhotos(): void {
  if (!import.meta.client || currentIndex.value < 0) {
    return
  }

  const adjacent = [
    props.photos[currentIndex.value - 1],
    props.photos[currentIndex.value + 1]
  ]

  for (const photo of adjacent) {
    if (photo) {
      const image = new Image()
      image.src = photo.preview
    }
  }
}

function lockBackgroundScroll(): void {
  if (scrollLocked) {
    return
  }

  previousOverflow = document.documentElement.style.overflow
  document.documentElement.style.overflow = 'hidden'
  scrollLocked = true
}

function unlockBackgroundScroll(): void {
  if (!scrollLocked) {
    return
  }

  document.documentElement.style.overflow = previousOverflow
  scrollLocked = false
}
</script>

<template>
  <dialog
    ref="dialog"
    class="photo-viewer"
    aria-label="照片查看器"
    @click="handleBackdropClick"
    @close="handleClosed"
    @keydown="handleKeydown"
  >
    <template v-if="currentPhoto">
      <header class="photo-viewer__header">
        <button
          data-viewer-close
          type="button"
          aria-label="关闭照片查看器"
          title="关闭"
          @click="closeViewer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </header>

      <div class="photo-viewer__stage">
        <div class="photo-viewer__media">
          <img
            ref="image"
            :key="currentPhoto.id"
            :src="currentPhoto.preview"
            :alt="currentPhoto.filename"
            :width="currentPhoto.width"
            :height="currentPhoto.height"
            decoding="async"
            @load="completeImageLoading"
            @error="completeImageLoading"
          >
        </div>

        <span
          v-if="isImageLoading"
          class="photo-viewer__loading"
          aria-hidden="true"
        />

        <button
          class="photo-viewer__nav photo-viewer__nav--previous"
          type="button"
          aria-label="上一张照片"
          title="上一张"
          :disabled="!hasPrevious"
          @click="showPrevious"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 4l-8 8 8 8" />
          </svg>
        </button>

        <button
          class="photo-viewer__nav photo-viewer__nav--next"
          type="button"
          aria-label="下一张照片"
          title="下一张"
          :disabled="!hasNext"
          @click="showNext"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 4l8 8-8 8" />
          </svg>
        </button>
      </div>

      <footer
        v-if="metadata.equipment || metadata.exposure || metadata.date"
        class="photo-viewer__metadata"
        aria-label="照片信息"
      >
        <p v-if="metadata.equipment">{{ metadata.equipment }}</p>
        <p v-if="metadata.exposure">{{ metadata.exposure }}</p>
        <time v-if="metadata.date" :datetime="currentPhoto.takenAt">
          {{ metadata.date }}
        </time>
      </footer>
    </template>
  </dialog>
</template>

<style scoped>
.photo-viewer {
  position: fixed;
  inset: 0;
  width: 100vw;
  max-width: none;
  height: 100dvh;
  max-height: none;
  padding: 0;
  margin: 0;
  overflow: hidden;
  color: var(--gallery-ink);
  background: var(--gallery-canvas);
  border: 0;
}

.photo-viewer[open] {
  display: grid;
  grid-template-rows: 4rem minmax(0, 1fr) auto;
}

.photo-viewer::backdrop {
  background: var(--gallery-canvas);
}

.photo-viewer__header {
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 var(--gallery-gutter);
}

.photo-viewer button {
  display: grid;
  width: 2rem;
  height: 2rem;
  padding: var(--gallery-space-xs);
  cursor: pointer;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 0;
  color: var(--gallery-ink);
  place-items: center;
  transition: opacity var(--gallery-motion-fast) var(--gallery-ease);
}

.photo-viewer button:hover {
  opacity: 0.5;
}

.photo-viewer button:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 3px;
}

.photo-viewer button:disabled {
  cursor: default;
  opacity: 0.16;
}

.photo-viewer button svg {
  width: 100%;
  fill: none;
  stroke: currentColor;
  stroke-linecap: square;
  stroke-width: 1.25;
}

.photo-viewer__stage {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.photo-viewer__media {
  position: absolute;
  inset: 0;
  padding: 0 clamp(3.25rem, 7vw, 7rem);
}

.photo-viewer__media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.photo-viewer__loading {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  width: 1.25rem;
  height: 1.25rem;
  pointer-events: none;
  border: 1px solid color-mix(in srgb, var(--gallery-ink) 18%, transparent);
  border-top-color: var(--gallery-ink);
  border-radius: 50%;
  animation: photo-viewer-spin 700ms linear infinite;
  transform: translate(-50%, -50%);
}

.photo-viewer__nav {
  position: absolute;
  top: 50%;
  z-index: 2;
  transform: translateY(-50%);
}

.photo-viewer__nav--previous {
  left: var(--gallery-gutter);
}

.photo-viewer__nav--next {
  right: var(--gallery-gutter);
}

.photo-viewer__metadata {
  min-height: 5.5rem;
  padding: 1rem var(--gallery-gutter) 1.25rem;
  color: var(--gallery-muted);
  font-size: 0.6875rem;
  line-height: 1.45;
  text-align: center;
  letter-spacing: 0.01em;
}

.photo-viewer__metadata p {
  margin: 0 0 0.15rem;
}

.photo-viewer__metadata time {
  display: block;
  margin-top: 0.45rem;
}

@keyframes photo-viewer-spin {
  to {
    transform: translate(-50%, -50%) rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .photo-viewer__loading {
    animation: none;
  }
}

@media (max-width: 47.999rem) {
  .photo-viewer[open] {
    grid-template-rows: 3.5rem minmax(0, 1fr) auto;
  }

  .photo-viewer__media {
    padding: 0 var(--gallery-gutter) 3.25rem;
  }

  .photo-viewer__nav {
    top: auto;
    bottom: 0.25rem;
    transform: none;
  }

  .photo-viewer__nav--previous {
    left: calc(50% - 2.75rem);
  }

  .photo-viewer__nav--next {
    right: calc(50% - 2.75rem);
  }

  .photo-viewer__metadata {
    min-height: 4.75rem;
    padding-top: 0.75rem;
  }
}
</style>
