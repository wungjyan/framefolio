<script setup lang="ts">
import type {
  AdminStorageSourceResponse,
  AdminStorageStatusResponse
} from '../../../shared/types/admin'

/**
 * Storage panel: shows the active source and lets the operator switch it.
 *
 * The switch only changes which URL is assembled at read time — it does not move
 * or re-process any files — so it is immediate and safe to toggle. Completeness
 * counts are shown so that switching to object storage is an informed decision
 * rather than a guess.
 */
const props = defineProps<{
  source: AdminStorageSourceResponse | undefined
  status: AdminStorageStatusResponse | undefined
  busy: boolean
}>()

const emit = defineEmits<{
  select: [source: 'local' | 'r2']
}>()

const canUseRemote = computed(() => props.source?.configured === true)

const completeness = computed(() => {
  const status = props.status

  // Only meaningful with a real listing. Without one the counts are absent, and
  // defaulting the missing count to zero would render "100% complete" for a
  // bucket that was never inspected.
  if (!status || status.connected !== true || status.expectedObjects === 0) {
    return undefined
  }

  return Math.round(
    ((status.expectedObjects - (status.missingObjects ?? 0)) /
      status.expectedObjects) *
      100
  )
})

/**
 * Whether to warn that the gallery may still look fine while R2 is missing
 * files.
 *
 * The condition is specifically "the index publishes this photo to the CDN, but
 * the object is gone" — because only then does URL resolution keep returning a
 * CDN address, leaving a cached copy as the sole reason the image still shows.
 *
 * Two tempting but wrong conditions:
 *   * "any missing object" — a photo whose upload never succeeded has no remote
 *     state, so its URL falls back to `/media` and it renders from local files.
 *     Nothing is cached; warning there is simply false.
 *   * "in local mode" — images come from this server, so the situation cannot
 *     arise at all.
 */
const showCachedWarning = computed(() => {
  const status = props.status

  return (
    status?.source === 'r2' &&
    status.connected === true &&
    (status.photosPublishedButMissing ?? 0) > 0
  )
})
</script>

<template>
  <div class="admin-storage">
    <div class="admin-storage__options" role="radiogroup" aria-label="访问源">
      <label class="admin-storage__option">
        <input
          type="radio"
          name="storage-source"
          value="local"
          :checked="source?.source === 'local'"
          :disabled="busy"
          @change="emit('select', 'local')"
        />
        <span>
          本地
          <small>图片由本机 /media 路由提供</small>
        </span>
      </label>

      <label class="admin-storage__option" :data-disabled="!canUseRemote">
        <input
          type="radio"
          name="storage-source"
          value="r2"
          :checked="source?.source === 'r2'"
          :disabled="busy || !canUseRemote"
          @change="emit('select', 'r2')"
        />
        <span>
          对象存储（CDN）
          <small v-if="!canUseRemote">
            未配置，请先设置 FRAMEFOLIO_S3_* 环境变量
          </small>
          <small v-else-if="source?.publicBaseUrl">
            基址：{{ source.publicBaseUrl }}
          </small>
        </span>
      </label>
    </div>

    <p v-if="status" class="admin-storage__detail">
      <template v-if="status.source === 'r2' && !status.configured">
        <strong>已选择对象存储，但配置不完整，当前实际仍使用本地。</strong>
      </template>

      <template v-else-if="status.source === 'r2' && !status.connected">
        无法读取对象存储，暂时无法确认 R2 中的可用情况。
      </template>

      <template v-else-if="status.source === 'r2'">
        R2 中可用 {{ status.photosWithRemote }} / {{ status.totalPhotos }} 张。
        <template v-if="completeness !== undefined">
          派生图完整度 {{ completeness }}%。
        </template>
        <template v-if="(status.missingObjects ?? 0) > 0">
          缺失 {{ status.missingObjects }} 个对象，点「立即同步」会补传。
        </template>
        <template v-if="(status.orphanedObjects ?? 0) > 0">
          另有 {{ status.orphanedObjects }} 个无引用对象，下次同步会自动清理。
        </template>
      </template>

      <template v-else>
        当前使用本地存储。切换到对象存储不需要重新处理图片。
      </template>
    </p>

    <!--
      The state that confuses everyone: the bucket is empty, yet the gallery
      still renders. It renders because the browser and the CDN are still
      serving a cached copy, not because the files are still published. Without
      this note, "0 available" reads as a bug rather than as an early warning.
    -->
    <p
      v-if="showCachedWarning"
      class="admin-notice admin-notice--warning"
      role="status"
    >
      <strong>照片墙现在可能仍能正常显示，但那是缓存。</strong>
      其中 {{ status?.photosPublishedButMissing }} 张照片仍指向 CDN， 但文件在
      R2 中已不存在；浏览器和 CDN 返回的是此前缓存的副本。
      缓存过期后（派生图缓存一年）这些图片会变成裂图，点「立即同步」可立即补回。
    </p>

    <p
      v-if="status && !status.connected && status.configured"
      class="admin-notice admin-notice--warning"
    >
      无法连接对象存储：{{ status.message }}
    </p>
  </div>
</template>

<style scoped>
.admin-storage {
  display: grid;
  gap: var(--gallery-space-sm);
}

.admin-storage__options {
  display: grid;
  gap: var(--gallery-space-xs);
}

.admin-storage__option {
  display: flex;
  gap: var(--gallery-space-sm);
  align-items: flex-start;
  min-height: 2.75rem;
  font-size: 0.875rem;
}

.admin-storage__option[data-disabled='true'] {
  color: var(--gallery-muted);
}

.admin-storage__option small {
  display: block;
  margin-top: 0.125rem;
  font-size: 0.75rem;
  color: var(--gallery-muted);
}

.admin-storage__detail {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--gallery-muted);
}
</style>
