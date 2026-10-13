<script setup lang="ts">
import type { AdminUploadResponse } from '../../../shared/types/admin'
import { formatBytes } from '../../utils/admin-format'

/**
 * Multi-file uploader.
 *
 * Files are uploaded one at a time (sequentially) rather than in parallel:
 * the server streams each request to disk, and the target is a NAS where
 * parallel large writes would contend for both disk and CPU.
 *
 * Uploading never triggers a sync. The parent is responsible for telling the
 * user that the photos appear only after pressing Sync.
 */
const emit = defineEmits<{
  uploaded: [filename: string]
}>()

interface UploadItem {
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  message?: string
}

const api = useAdminApi()
const { t, translateError } = useLocale()
const items = ref<UploadItem[]>([])
const dragging = ref(false)
const busy = ref(false)
const input = ref<HTMLInputElement>()

const accept = '.jpg,.jpeg,.png,.webp,.tif,.tiff'

async function addFiles(
  files: FileList | File[] | null | undefined
): Promise<void> {
  if (!files) {
    return
  }

  const incoming = Array.from(files).map(file => ({
    file,
    status: 'pending' as const
  }))

  if (incoming.length === 0) {
    return
  }

  items.value = [...items.value, ...incoming]
  await drain()
}

/** Upload every pending item, one at a time. */
async function drain(): Promise<void> {
  if (busy.value) {
    return
  }

  busy.value = true

  try {
    for (const item of items.value) {
      if (item.status !== 'pending') {
        continue
      }

      item.status = 'uploading'

      try {
        const result: AdminUploadResponse = await api.uploadPhoto(item.file)
        item.status = 'done'
        item.message = formatBytes(result.bytes)
        emit('uploaded', result.filename)
      } catch (error: unknown) {
        item.status = 'error'
        item.message = readErrorMessage(error)
      }
    }
  } finally {
    busy.value = false
    // Let the same file be chosen again without a page reload.
    if (input.value) {
      input.value.value = ''
    }
  }
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  void addFiles(event.dataTransfer?.files)
}

function onSelect(event: Event): void {
  const target = event.target as HTMLInputElement
  void addFiles(target.files)
}

function clearFinished(): void {
  items.value = items.value.filter(item => item.status === 'error')
}

function readErrorMessage(error: unknown): string {
  return translateError(error, 'upload.errorFallback')
}

const doneCount = computed(
  () => items.value.filter(item => item.status === 'done').length
)
const errorCount = computed(
  () => items.value.filter(item => item.status === 'error').length
)
</script>

<template>
  <div class="admin-uploader">
    <label
      class="admin-dropzone"
      :data-active="dragging"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <span>{{ t('upload.dropzone') }}</span>
      <span>{{ t('upload.formats') }}</span>
      <input
        ref="input"
        class="visually-hidden"
        type="file"
        multiple
        :accept="accept"
        :disabled="busy"
        @change="onSelect"
      />
    </label>

    <p v-if="busy" class="admin-notice admin-notice--muted" role="status">
      {{ t('upload.progress', { done: doneCount, total: items.length }) }}
    </p>

    <ul v-if="items.length > 0" class="admin-upload-list">
      <li
        v-for="(item, index) in items"
        :key="`${item.file.name}-${index}`"
        class="admin-upload-item"
        :data-status="item.status"
      >
        <span class="admin-upload-item__name">{{ item.file.name }}</span>
        <span>
          <template v-if="item.status === 'uploading'">
            {{ t('upload.item.uploading') }}
          </template>
          <template v-else-if="item.status === 'done'">
            {{ t('upload.item.done', { size: item.message ?? '' }) }}
          </template>
          <template v-else-if="item.status === 'error'">
            {{ item.message }}
          </template>
          <template v-else>{{ t('upload.item.pending') }}</template>
        </span>
      </li>
    </ul>

    <p
      v-if="doneCount > 0"
      class="admin-notice admin-notice--attention"
      role="status"
    >
      {{ t('upload.doneCount', { count: doneCount }) }}
      <strong>{{ t('upload.doneStrong') }}</strong>
      {{ t('upload.doneHint') }}
    </p>

    <p v-if="errorCount > 0" class="admin-notice" role="alert">
      {{ t('upload.errorCount', { count: errorCount }) }}
      <button class="admin-link" type="button" @click="clearFinished">
        {{ t('upload.clearFinished') }}
      </button>
    </p>
  </div>
</template>

<style scoped>
.admin-uploader {
  display: grid;
  gap: var(--gallery-space-sm);
}
</style>
