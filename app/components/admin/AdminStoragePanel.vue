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

const { t } = useLocale()

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
    <div
      class="admin-storage__options"
      role="radiogroup"
      :aria-label="t('storage.group')"
    >
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
          {{ t('storage.local.label') }}
          <small>{{ t('storage.local.hint') }}</small>
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
          {{ t('storage.remote.label') }}
          <small v-if="!canUseRemote">
            {{ t('storage.remote.unconfigured') }}
          </small>
          <small v-else-if="source?.publicBaseUrl">
            {{ t('storage.remote.baseUrl', { url: source.publicBaseUrl }) }}
          </small>
        </span>
      </label>
    </div>

    <p v-if="status" class="admin-storage__detail">
      <template v-if="status.source === 'r2' && !status.configured">
        <strong>{{ t('storage.status.unconfigured') }}</strong>
      </template>

      <template v-else-if="status.source === 'r2' && !status.connected">
        {{ t('storage.status.unreadable') }}
      </template>

      <template v-else-if="status.source === 'r2'">
        {{
          t('storage.status.available', {
            available: status.photosWithRemote,
            total: status.totalPhotos
          })
        }}
        <template v-if="completeness !== undefined">
          {{ t('storage.status.completeness', { percent: completeness }) }}
        </template>
        <template v-if="(status.missingObjects ?? 0) > 0">
          {{
            t('storage.status.missing', { count: status.missingObjects ?? 0 })
          }}
        </template>
        <template v-if="(status.orphanedObjects ?? 0) > 0">
          {{
            t('storage.status.orphaned', { count: status.orphanedObjects ?? 0 })
          }}
        </template>
      </template>

      <template v-else>
        {{ t('storage.status.local') }}
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
      <strong>{{ t('storage.cached.headline') }}</strong>
      {{
        t('storage.cached.body', {
          count: status?.photosPublishedButMissing ?? 0
        })
      }}
    </p>

    <!--
      Shown only for a *configured* bucket we could not reach, so the label wraps
      the provider's raw error text. The "not configured" case has no raw error
      and is already covered by the detail line above, which is why it is not
      repeated here.
    -->
    <p
      v-if="status && !status.connected && status.configured"
      class="admin-notice admin-notice--warning"
    >
      {{ t('storage.connectionError', { message: status.message ?? '' }) }}
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
