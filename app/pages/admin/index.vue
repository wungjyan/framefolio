<script setup lang="ts">
// Imported here rather than globally so the public gallery does not download the
// admin stylesheet. Vite emits it as a chunk belonging to this page.
import '../../assets/css/admin.css'

import type {
  AdminPhoto,
  AdminPhotosResponse,
  AdminStorageSourceResponse,
  AdminStorageStatusResponse,
  AdminSyncStatusResponse
} from '../../../shared/types/admin'
import { useAdminApi } from '../../composables/useAdminApi'
import { useAdminSession } from '../../composables/useAdminSession'

/**
 * Admin dashboard.
 *
 * The public gallery is untouched: this page is reached only by typing /admin,
 * and there is no link to it from the gallery. Rendering is client-only
 * (`routeRules` sets `ssr: false` for /admin/**), because everything here is
 * runtime state: session, job progress, and pending changes.
 */
useHead({
  title: '管理 · Framefolio',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }]
})

const api = useAdminApi()
const { authenticated, checking, refresh, login, logout } = useAdminSession()

const loginForm = ref<{ reset: () => void; setError: (m: string) => void }>()
const photos = ref<AdminPhoto[]>([])
const pending = ref<AdminPhotosResponse['pending']>({
  added: 0,
  changed: 0,
  pendingDelete: 0,
  total: 0
})
const syncStatus = ref<AdminSyncStatusResponse>()
const storageSource = ref<AdminStorageSourceResponse>()
const storageStatus = ref<AdminStorageStatusResponse>()
const switchingSource = ref(false)
const loading = ref(false)
const syncing = ref(false)
const deleting = ref(false)
const message = ref('')
const messageTone = ref<'muted' | 'warning'>('muted')

const deleteTarget = ref<AdminPhoto>()
const confirmOpen = computed({
  get: () => deleteTarget.value !== undefined,
  set: (value: boolean) => {
    if (!value) {
      deleteTarget.value = undefined
    }
  }
})

let pollTimer: ReturnType<typeof setTimeout> | undefined

onMounted(async () => {
  await refresh()

  if (authenticated.value) {
    await loadAll()
  }
})

onBeforeUnmount(() => {
  stopPolling()
})

async function loadAll(): Promise<void> {
  loading.value = true

  try {
    await Promise.all([loadPhotos(), loadSyncStatus(), loadStorage()])
  } finally {
    loading.value = false
  }
}

async function loadPhotos(): Promise<void> {
  const result = await api.listPhotos()
  photos.value = result.photos
  pending.value = result.pending
}

async function loadSyncStatus(): Promise<void> {
  try {
    syncStatus.value = await api.syncStatus()
  } catch {
    // Status is informational; a failure here must not blank the page.
  }
}

async function loadStorage(): Promise<void> {
  try {
    // Two calls: the switch only needs the source, while the completeness
    // report may block on object storage being reachable.
    const [source] = await Promise.all([
      api.storageSource(),
      api
        .storageStatus()
        .then(status => {
          storageStatus.value = status
        })
        .catch(() => {
          storageStatus.value = undefined
        })
    ])
    storageSource.value = source
  } catch {
    storageSource.value = undefined
  }
}

async function onSelectSource(source: 'local' | 'r2'): Promise<void> {
  if (switchingSource.value || storageSource.value?.source === source) {
    return
  }

  switchingSource.value = true

  try {
    storageSource.value = await api.setStorageSource(source)
    setMessage(
      source === 'r2'
        ? '访问源已切换为对象存储。刷新首页即可看到图片走 CDN。'
        : '访问源已切换为本地。',
      'muted'
    )
    await loadStorage()
  } catch (error: unknown) {
    setMessage(readMessage(error, '切换访问源失败。'), 'warning')
  } finally {
    switchingSource.value = false
  }
}

async function onLogin(password: string): Promise<void> {
  try {
    await login(password)
    loginForm.value?.reset()
    await loadAll()
  } catch (error: unknown) {
    loginForm.value?.setError(describeLoginError(error))
  }
}

/**
 * Map the server's status codes to Chinese messages.
 *
 * The server deliberately returns a generic message (it must not reveal whether
 * the password was wrong or the client is throttled), so the distinction is
 * made from the status code instead of by parsing the message text.
 */
function describeLoginError(error: unknown): string {
  switch (readStatusCode(error)) {
    case 429:
      return '尝试次数过多，请稍后再试。'
    case 401:
      return '口令不正确。'
    case 404:
      return '管理端未启用：服务端未配置管理口令。'
    default:
      return '登录失败，请检查网络后重试。'
  }
}

async function onLogout(): Promise<void> {
  stopPolling()
  await logout()
}

async function onSync(): Promise<void> {
  if (syncing.value) {
    return
  }

  syncing.value = true
  setMessage('正在同步…', 'muted')
  startPolling()

  try {
    const result = await api.startSync()

    if (result.status === 'failed') {
      setMessage('同步完成，但部分照片处理失败。', 'warning')
    } else {
      setMessage('同步完成。', 'muted')
    }

    await loadAll()
  } catch (error: unknown) {
    const statusCode = readStatusCode(error)

    if (statusCode === 409) {
      setMessage('已有同步任务在运行，请等待其完成。', 'warning')
    } else {
      setMessage(readMessage(error, '同步失败。'), 'warning')
    }
  } finally {
    stopPolling()
    syncing.value = false
    await loadSyncStatus()
  }
}

function startPolling(): void {
  stopPolling()
  // Progress is polled rather than streamed: SSE support varies across the
  // reverse proxies and tunnels this app runs behind.
  pollTimer = setInterval(() => {
    void loadSyncStatus()
  }, 1000)
}

function stopPolling(): void {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}

function requestDelete(photo: AdminPhoto): void {
  deleteTarget.value = photo
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value

  if (!target) {
    return
  }

  deleting.value = true

  try {
    await api.deletePhoto(target.filename)
    deleteTarget.value = undefined
    // The photo is still published: say so, so the delay is not forgotten.
    setMessage(
      `已将「${target.filename}」移入回收站。它仍显示在网站上，点击「立即同步」后才会移除。`,
      'warning'
    )
    await loadPhotos()
  } catch (error: unknown) {
    setMessage(readMessage(error, '删除失败。'), 'warning')
  } finally {
    deleting.value = false
  }
}

async function onUploaded(): Promise<void> {
  setMessage(
    '照片已上传，但尚未显示在网站上。点击「立即同步」后即可展示。',
    'warning'
  )
  await loadPhotos()
}

function setMessage(text: string, tone: 'muted' | 'warning'): void {
  message.value = text
  messageTone.value = tone
}

function readStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { statusCode?: unknown }
    return Number(candidate.statusCode ?? 0)
  }

  return 0
}

function readMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown }
    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      return candidate.message
    }
  }

  return fallback
}
</script>

<template>
  <div class="admin-shell">
    <template v-if="checking">
      <p class="admin-empty" role="status">正在检查登录状态…</p>
    </template>

    <AdminLogin v-else-if="!authenticated" ref="loginForm" @submit="onLogin" />

    <template v-else>
      <header class="admin-header">
        <h1 class="admin-header__title">FRAMEFOLIO 管理</h1>
        <div class="admin-header__actions">
          <a class="admin-link" href="/">查看网站</a>
          <button class="admin-link" type="button" @click="onLogout">
            退出登录
          </button>
        </div>
      </header>

      <p
        v-if="message"
        class="admin-notice"
        :class="
          messageTone === 'warning'
            ? 'admin-notice--warning'
            : 'admin-notice--muted'
        "
        role="status"
        aria-live="polite"
      >
        {{ message }}
      </p>

      <section class="admin-section" aria-labelledby="admin-sync-heading">
        <h2 id="admin-sync-heading" class="admin-section__title">同步</h2>
        <AdminSyncPanel
          :status="syncStatus"
          :pending-total="pending.total"
          :busy="loading"
          @sync="onSync"
        />
        <p class="admin-notice admin-notice--muted">
          上传和删除都不会立即生效。网站上的内容只在你按下「立即同步」后才会改变。
        </p>
      </section>

      <section class="admin-section" aria-labelledby="admin-upload-heading">
        <h2 id="admin-upload-heading" class="admin-section__title">上传照片</h2>
        <AdminUploader @uploaded="onUploaded" />
      </section>

      <section class="admin-section" aria-labelledby="admin-storage-heading">
        <h2 id="admin-storage-heading" class="admin-section__title">访问源</h2>
        <AdminStoragePanel
          :source="storageSource"
          :status="storageStatus"
          :busy="switchingSource"
          @select="onSelectSource"
        />
      </section>

      <section class="admin-section" aria-labelledby="admin-photos-heading">
        <h2 id="admin-photos-heading" class="admin-section__title">
          照片（{{ photos.length }}）
        </h2>
        <AdminPhotoList
          :photos="photos"
          :busy="loading || deleting || syncing"
          @delete="requestDelete"
        />
      </section>

      <AdminConfirmDialog
        v-model:open="confirmOpen"
        :filename="deleteTarget?.filename ?? ''"
        :busy="deleting"
        @confirm="confirmDelete"
        @cancel="deleteTarget = undefined"
      />
    </template>
  </div>
</template>
