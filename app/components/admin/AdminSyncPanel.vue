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

const { t, intlLocale } = useLocale()

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
    return t('sync.pending.loading')
  }

  return props.pendingTotal > 0
    ? t('sync.pending.count', { count: props.pendingTotal })
    : t('sync.pending.clear')
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
    return t('sync.never')
  }

  return [
    t('sync.summary.added', { count: summary.added }),
    t('sync.summary.updated', { count: summary.updated }),
    t('sync.summary.skipped', { count: summary.skipped }),
    t('sync.summary.deleted', { count: summary.deleted }),
    summary.failed > 0
      ? t('sync.summary.failed', { count: summary.failed })
      : undefined
  ]
    .filter(Boolean)
    .join(' · ')
})

const failed = computed(() => (lastSummary.value?.failed ?? 0) > 0)

const progress = computed(() => props.status?.current?.progress)

const progressText = computed(() => {
  const current = progress.value

  return current
    ? syncProgressText(current.phase, current.completed, current.total, t)
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
        {{ running ? t('sync.running') : t('sync.start') }}
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
        <template v-else>{{ t('sync.inProgress') }}</template>
      </p>
    </div>

    <div v-else class="admin-sync__result">
      <p class="admin-sync__detail">
        {{
          t('sync.lastRun', {
            time: formatDateTime(status?.last?.finishedAt, intlLocale)
          })
        }}
        — {{ summaryText }}
      </p>

      <p v-if="failed" class="admin-notice admin-notice--warning" role="alert">
        <strong>{{
          t('sync.failedCount', { count: lastSummary?.failed ?? 0 })
        }}</strong>
        {{ t('sync.failedHint') }}
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
