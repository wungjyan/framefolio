<script setup lang="ts">
import type { AdminSyncStatusResponse } from '../../../shared/types/admin'
import { formatDateTime } from '../../utils/admin-format'

/**
 * Sync panel: the one place that publishes changes.
 *
 * It is deliberately prominent, because nothing the user does (upload, delete)
 * reaches the public gallery until this button is pressed. The last outcome is
 * always shown so the effect of the previous run is visible.
 */
const props = defineProps<{
  status: AdminSyncStatusResponse | undefined
  pendingTotal: number
  busy: boolean
}>()

const emit = defineEmits<{
  sync: []
}>()

const running = computed(() => props.status?.running === true)

const progressPercent = computed(() => {
  const progress = props.status?.current?.progress

  if (!progress || progress.total <= 0) {
    return undefined
  }

  return Math.min(100, Math.round((progress.completed / progress.total) * 100))
})

const lastSummary = computed(() => props.status?.last?.summary)

const summaryText = computed(() => {
  const summary = lastSummary.value

  if (!summary) {
    return '尚未同步过'
  }

  return [
    `新增 ${summary.added}`,
    `更新 ${summary.updated}`,
    `跳过 ${summary.skipped}`,
    `删除 ${summary.deleted}`,
    summary.failed > 0 ? `失败 ${summary.failed}` : undefined
  ]
    .filter(Boolean)
    .join(' · ')
})

const failed = computed(() => (lastSummary.value?.failed ?? 0) > 0)
</script>

<template>
  <section class="admin-sync">
    <div class="admin-sync__row">
      <button
        class="admin-button"
        type="button"
        :disabled="busy || running"
        @click="emit('sync')"
      >
        {{ running ? '同步中…' : '立即同步' }}
      </button>

      <span v-if="pendingTotal > 0" class="admin-sync__pending">
        待同步 {{ pendingTotal }} 项
      </span>
      <span v-else class="admin-sync__pending admin-sync__pending--clear">
        网站已是最新
      </span>
    </div>

    <div v-if="running" class="admin-sync__progress">
      <div class="admin-progress">
        <div
          class="admin-progress__bar"
          :style="{ width: `${progressPercent ?? 0}%` }"
        />
      </div>
      <p class="admin-sync__detail" role="status">
        {{ status?.current?.progress?.phase ?? 'running' }}
        <template v-if="status?.current?.progress">
          （{{ status.current.progress.completed }} /
          {{ status.current.progress.total }}）
        </template>
      </p>
    </div>

    <div v-else class="admin-sync__result">
      <p class="admin-sync__detail">
        上次同步：{{ formatDateTime(status?.last?.finishedAt) }} —
        {{ summaryText }}
      </p>

      <p v-if="failed" class="admin-notice admin-notice--warning" role="alert">
        <strong>{{ lastSummary?.failed }} 张处理失败。</strong>
        失败的照片保留上一版展示，修复原图后再同步一次即可。
        <template v-if="status?.last?.errors?.length">
          <br />
          {{ status.last.errors[0]?.filename }}：{{
            status.last.errors[0]?.message
          }}
        </template>
      </p>

      <p v-else-if="status?.last?.message" class="admin-notice" role="alert">
        {{ status.last.message }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.admin-sync {
  display: grid;
  gap: var(--gallery-space-sm);
  padding: var(--gallery-space-md);
  border: 1px solid var(--gallery-surface-active);
}

.admin-sync__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gallery-space-sm);
  align-items: center;
}

.admin-sync__pending {
  font-size: 0.8125rem;
}

.admin-sync__pending--clear {
  color: var(--gallery-muted);
}

.admin-sync__progress {
  display: grid;
  gap: var(--gallery-space-xs);
}

.admin-sync__detail {
  margin: 0;
  font-size: 0.75rem;
  color: var(--gallery-muted);
}
</style>
