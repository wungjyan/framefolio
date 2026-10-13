<script setup lang="ts">
import type { AdminPhoto } from '../../../shared/types/admin'
import { formatBytes, photoStateLabel } from '../../utils/admin-format'

/**
 * Photo list.
 *
 * Renders a table on wide screens and card rows below 48rem (the CSS handles
 * the switch). The `data-label` attributes supply the row labels that the
 * mobile layout shows, so the same markup serves both.
 */
const props = defineProps<{
  photos: AdminPhoto[]
  busy: boolean
}>()

const emit = defineEmits<{
  delete: [photo: AdminPhoto]
}>()

const { t } = useLocale()

function badgeClass(photo: AdminPhoto): string {
  return photo.state === 'unchanged'
    ? 'admin-badge'
    : 'admin-badge admin-badge--pending'
}

function canDelete(photo: AdminPhoto): boolean {
  // Photos already awaiting deletion have no original on disk to move.
  return photo.state !== 'pending-delete'
}

function thumbnailUrl(photo: AdminPhoto): string | undefined {
  return photo.storage.thumbnail
    ? `/media/${photo.storage.thumbnail}`
    : undefined
}

const hasPhotos = computed(() => props.photos.length > 0)
</script>

<template>
  <div v-if="!hasPhotos" class="admin-empty">
    {{ t('photos.empty') }}
  </div>

  <table v-else class="admin-table">
    <thead>
      <tr>
        <th scope="col">{{ t('photos.column.preview') }}</th>
        <th scope="col">{{ t('photos.column.filename') }}</th>
        <th scope="col">{{ t('photos.column.dimensions') }}</th>
        <th scope="col">{{ t('photos.column.size') }}</th>
        <th scope="col">{{ t('photos.column.state') }}</th>
        <th scope="col">{{ t('photos.column.actions') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="photo in photos" :key="photo.id">
        <td :data-label="t('photos.column.preview')">
          <img
            v-if="thumbnailUrl(photo)"
            class="admin-table__thumb"
            :src="thumbnailUrl(photo)"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <span v-else class="admin-table__thumb" aria-hidden="true" />
        </td>

        <td class="admin-table__name" :data-label="t('photos.column.filename')">
          {{ photo.filename }}
        </td>

        <td :data-label="t('photos.column.dimensions')">
          <template v-if="photo.width > 0">
            {{ photo.width }} × {{ photo.height }}
          </template>
          <template v-else>—</template>
        </td>

        <td :data-label="t('photos.column.size')">
          {{ formatBytes(photo.source.size) }}
        </td>

        <td :data-label="t('photos.column.state')">
          <span :class="badgeClass(photo)">{{
            photoStateLabel(photo.state, t)
          }}</span>
        </td>

        <td :data-label="t('photos.column.actions')">
          <button
            class="admin-button admin-button--secondary admin-button--small"
            type="button"
            :disabled="busy || !canDelete(photo)"
            :title="
              canDelete(photo)
                ? t('photos.delete.title')
                : t('photos.delete.disabledTitle')
            "
            @click="emit('delete', photo)"
          >
            {{ t('common.delete') }}
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
