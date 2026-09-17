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
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown }
    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      return candidate.message
    }
  }

  return '上传失败'
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
      <span>选择照片，或拖拽文件到这里</span>
      <span>支持 JPG / PNG / WebP / TIFF</span>
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
      正在上传…（{{ doneCount }} / {{ items.length }}）
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
          <template v-if="item.status === 'uploading'">上传中…</template>
          <template v-else-if="item.status === 'done'">
            已上传 {{ item.message }}
          </template>
          <template v-else-if="item.status === 'error'">
            {{ item.message }}
          </template>
          <template v-else>等待中</template>
        </span>
      </li>
    </ul>

    <p
      v-if="doneCount > 0"
      class="admin-notice admin-notice--attention"
      role="status"
    >
      已上传
      {{ doneCount }}
      张。<strong>这些照片尚未出现在网站上</strong>，请点击「立即同步」后才会展示。
    </p>

    <p v-if="errorCount > 0" class="admin-notice" role="alert">
      {{ errorCount }} 张上传失败。
      <button class="admin-link" type="button" @click="clearFinished">
        清除已完成的记录
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
