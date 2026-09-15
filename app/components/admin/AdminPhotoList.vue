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
    还没有照片。上传照片或把文件放进 data/originals/ 后点击「立即同步」。
  </div>

  <table v-else class="admin-table">
    <thead>
      <tr>
        <th scope="col">预览</th>
        <th scope="col">文件名</th>
        <th scope="col">尺寸</th>
        <th scope="col">大小</th>
        <th scope="col">状态</th>
        <th scope="col">操作</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="photo in photos" :key="photo.id">
        <td data-label="预览">
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

        <td class="admin-table__name" data-label="文件名">
          {{ photo.filename }}
        </td>

        <td data-label="尺寸">
          <template v-if="photo.width > 0">
            {{ photo.width }} × {{ photo.height }}
          </template>
          <template v-else>—</template>
        </td>

        <td data-label="大小">{{ formatBytes(photo.source.size) }}</td>

        <td data-label="状态">
          <span :class="badgeClass(photo)">{{
            photoStateLabel(photo.state)
          }}</span>
        </td>

        <td data-label="操作">
          <button
            class="admin-button admin-button--secondary admin-button--small"
            type="button"
            :disabled="busy || !canDelete(photo)"
            :title="
              canDelete(photo)
                ? '移入回收站（需同步后才会从网站移除）'
                : '该照片已在待删除状态'
            "
            @click="emit('delete', photo)"
          >
            删除
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
