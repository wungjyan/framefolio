<script setup lang="ts">
import type { AdminSyncStatusResponse } from '../../../shared/types/admin'
import { formatDateTime, syncProgressText } from '../../utils/admin-format'

/**
 * Sync panel: the one place that publishes changes.
 *
 * It is deliberately prominent, because nothing the user does (upload, delete)
 * reaches the public gallery until this button is pressed. The last outcome is
 * always shown so the effect of the previous run is visible.
 */
const props = defineProps<{
  status: AdminSyncStatusResponse | undefined
  /**
   * Pending change count, or `undefined` while it is still unknown.
   *
   * Optional on purpose: before the first load there is no answer, and claiming
   * "up to date" then is a guess. Making "unknown" representable forces the
   * template to handle it instead of defaulting to the reassuring message.
   */
  pendingTotal: number | undefined
  busy: boolean
}>()

const emit = defineEmits<{
  sync: []
}>()

const running = computed(() => props.status?.running === true)

/**
 * The line beside the button, or undefined when nothing should be shown.
 *
 * Three conditions, each fixing a way a single `pendingTotal === 0` check
 * misled:
 *
 *   * the count must be known — otherwise a fresh page load announced "up to
 *     date" before it had read anything;
 *   * a run must not be in flight — "up to date" beside a running progress bar
 *     is a direct contradiction, and the count itself is stale mid-run (it is
 *     whatever it was before the run started), so the live progress bar is the
 *     only thing worth showing;
 *   * only a genuine zero earns the "nothing to do" wording.
 *
 * The wording is about the local change set, because that is all this checks: it
 * compares `originals/` against the index and never contacts object storage, so
 * it cannot speak for what the public site is actually serving.
 */
const pendingLabel = computed<string | undefined>(() => {
  if (running.value) {
    return undefined
  }

  if (props.pendingTotal === undefined) {
    return '正在读取本地变更…'
  }

  return props.pendingTotal > 0
    ? `待同步 ${props.pendingTotal} 项`
    : '本地无待同步变更'
})

const pendingIsClear = computed(
  () => !running.value && props.pendingTotal === 0
)

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

const progress = computed(() => props.status?.current?.progress)

const progressText = computed(() => {
  const current = progress.value

  return current
    ? syncProgressText(current.phase, current.completed, current.total)
    : undefined
})
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

      <!--
        Nothing is shown while a run is in flight: the outcome is not known yet,
        and the progress bar below already reports what is happening.
      -->
      <span
        v-if="pendingLabel"
        class="admin-sync__pending"
        :class="{ 'admin-sync__pending--clear': pendingIsClear }"
      >
        {{ pendingLabel }}
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
        <template v-if="progress">
          {{ progressText }}
        </template>
        <template v-else>同步中</template>
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
