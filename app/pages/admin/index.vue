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
import { storageSourceSwitchMessage } from '../../utils/admin-format'

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
const { authenticated, checking, disabled, refresh, login, logout } =
  useAdminSession()

/**
 * Version of the image this page was built from.
 *
 * Injected at build time from `version.txt`, so a running container always
 * reports the version it was actually built from rather than whatever the
 * repository says now. Useful for answering "is the NAS running the latest
 * release?" without shelling into it.
 */
const { appVersion } = useRuntimeConfig().public

const loginForm = ref<{ reset: () => void; setError: (m: string) => void }>()
const photos = ref<AdminPhoto[]>([])
/**
 * Pending change counts, or undefined until the first load answers.
 *
 * Seeding this with zeros made the page announce "no pending changes" before it
 * had read anything, so a slow load looked like a confident answer.
 */
const pending = ref<AdminPhotosResponse['pending'] | undefined>(undefined)
const indexIncompatible = ref(false)
const syncStatus = ref<AdminSyncStatusResponse>()
const storageSource = ref<AdminStorageSourceResponse>()
const storageStatus = ref<AdminStorageStatusResponse>()
const switchingSource = ref(false)
const loading = ref(false)
const syncing = ref(false)
const deleting = ref(false)
const message = ref('')
/**
 * Notice tone.
 *
 * `attention` marks the "this has not taken effect yet" notices, which are the
 * most important thing on the page and were previously indistinguishable from
 * routine status text. It is deliberately separate from `warning`, which is
 * reserved for things that actually went wrong.
 */
const messageTone = ref<'muted' | 'warning' | 'attention'>('muted')

const deleteTarget = ref<AdminPhoto>()
const confirmOpen = computed({
  get: () => deleteTarget.value !== undefined,
  set: (value: boolean) => {
    if (!value) {
      deleteTarget.value = undefined
    }
  }
})

/** How often the ledger is checked while a sync runs. */
const SYNC_POLL_INTERVAL_MS = 1000
/** Give up watching a run after this many consecutive status failures. */
const MAX_POLL_FAILURES = 5

let pollTimer: ReturnType<typeof setTimeout> | undefined
let resolveSyncWatch: (() => void) | undefined
let syncWatch: Promise<void> | undefined

onMounted(async () => {
  await refresh()

  if (authenticated.value) {
    await loadAll()

    // A run may already be in flight: the page was reloaded, or another tab
    // started it. Follow it so progress keeps moving instead of freezing at
    // the state captured during mount.
    if (syncStatus.value?.running === true) {
      await followRunningSync()
    }
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
  // Set after an upgrade from an older index format: everything reads as
  // pending, and the user needs to know why.
  indexIncompatible.value = result.indexIncompatible === true
}

async function loadSyncStatus(): Promise<boolean> {
  try {
    syncStatus.value = await api.syncStatus()
    return true
  } catch {
    // Status is informational; a failure here must not blank the page. The
    // caller decides whether a run is still being watched, so report failure
    // rather than leaving the previous (possibly `running`) value in place.
    return false
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
    setMessage(storageSourceSwitchMessage(source), 'muted')
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

  try {
    // The POST only starts the run and returns in milliseconds; it does not
    // carry the result. The outcome is read from the ledger by the polling
    // below, because a request that waited for the whole sync is what made
    // reverse proxies (nginx, frp) answer 504 on a slow first import.
    await api.startSync()
    await followRunningSync()
  } catch (error: unknown) {
    const statusCode = readStatusCode(error)

    if (statusCode === 409) {
      // Another run is already in flight (another tab, or the CLI). Follow
      // that one rather than reporting a failure.
      setMessage('已有同步任务在运行，正在等待其完成…', 'warning')
      await followRunningSync()
    } else {
      setMessage(readMessage(error, '同步失败。'), 'warning')
    }
  } finally {
    stopPolling()
    syncing.value = false
    // No refresh here: `pollSyncStatus` already reloaded the photos, pending
    // counts, and storage state the moment the run was observed to finish, and
    // it does so for every caller — including a reload that never ran `onSync`.
  }
}

/**
 * Watch the ledger until no run is in flight.
 *
 * Resolution is driven by `running` becoming false, never by the start
 * request, so the caller can await the true end of the run without holding an
 * HTTP request open.
 *
 * Idempotent: a second caller (a button press while another tab's run is
 * already being followed, or the 409 path) joins the existing watch instead of
 * replacing its resolver, which would leave the first caller awaiting forever.
 */
function followRunningSync(): Promise<void> {
  if (syncWatch !== undefined) {
    return syncWatch
  }

  syncWatch = new Promise<void>(resolve => {
    resolveSyncWatch = resolve
  })

  pollFailures = 0
  startPolling()
  // Poll once immediately: an incremental run finishes in well under the
  // interval, and waiting a full second to report it would feel sluggish.
  void pollSyncStatus()

  return syncWatch
}

/** Consecutive status failures while watching a run. */
let pollFailures = 0

async function pollSyncStatus(): Promise<void> {
  const ok = await loadSyncStatus()

  if (!ok) {
    pollFailures += 1

    // A connection dropped by the tunnel mid-run would otherwise leave the UI
    // saying "同步中…" forever, since a stale `running` value is never cleared.
    // Give up after a few tries and say so; the run itself is unaffected and
    // the ledger still holds the outcome.
    if (pollFailures >= MAX_POLL_FAILURES) {
      setMessage(
        '无法获取同步进度：与管理端的连接中断。任务可能仍在后台进行，请稍后刷新页面查看结果。',
        'warning'
      )
      stopPolling()
    }
    return
  }

  pollFailures = 0

  if (syncStatus.value?.running === true) {
    return
  }

  reportSyncOutcome()
  // Stop the interval before refreshing, so a tick cannot start a second
  // overlapping poll while the refresh is in flight.
  stopPolling()
  // A finished run changes the photo list, the pending counts, and (with object
  // storage) the remote-copy completeness. Without this the panel would
  // announce "新增 24" while still listing "待同步 24 项" — which is exactly
  // what happens when the page is reloaded mid-run, since `onSync` is not the
  // caller that observed the end of the run.
  await loadAll().catch(() => {})
}

/**
 * Report the finished run from the ledger.
 *
 * `last` is the record the server finalised, which is the only place the
 * summary and errors exist now that the start request returns early.
 */
function reportSyncOutcome(): void {
  const last = syncStatus.value?.last

  if (last?.status === 'failed') {
    setMessage('同步完成，但存在失败项，详见下方同步面板。', 'warning')
    return
  }

  setMessage('同步完成。', 'muted')
}

function startPolling(): void {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer)
  }

  // Progress is polled rather than streamed: SSE support varies across the
  // reverse proxies and tunnels this app runs behind.
  pollTimer = setInterval(() => {
    void pollSyncStatus()
  }, SYNC_POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }

  // Release anything still awaiting the run (unmount, logout, a finished run,
  // or a dropped connection) so no promise is left pending, and so the next
  // run starts a fresh watch.
  const resolve = resolveSyncWatch
  resolveSyncWatch = undefined
  syncWatch = undefined
  resolve?.()
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
    // Attention, not warning: nothing is wrong, the change just is not live yet.
    setMessage(
      `已将「${target.filename}」移入回收站。它仍显示在网站上，点击「立即同步」后才会移除。`,
      'attention'
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
    'attention'
  )
  await loadPhotos()
}

function setMessage(
  text: string,
  tone: 'muted' | 'warning' | 'attention'
): void {
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

    <section v-else-if="disabled" class="admin-disabled" role="alert">
      <h1 class="admin-login__title">FRAMEFOLIO 管理</h1>
      <p class="admin-disabled__headline">管理端未启用</p>
      <p class="admin-disabled__text">
        服务端没有配置管理口令，因此所有 <code>/api/admin/*</code> 接口都返回
        404。
      </p>
      <p class="admin-disabled__text">
        设置环境变量 <code>FRAMEFOLIO_ADMIN_PASSWORD</code> 后重启即可启用：
      </p>
      <pre class="admin-disabled__code"><code># .env（与 compose 文件同目录）
FRAMEFOLIO_ADMIN_PASSWORD=换成你自己的强口令</code></pre>
      <p class="admin-disabled__text">本地开发时直接在命令前加上变量即可：</p>
      <pre
        class="admin-disabled__code"
      ><code>FRAMEFOLIO_ADMIN_PASSWORD=你的口令 pnpm dev</code></pre>
      <p class="admin-disabled__hint">公开画廊不受影响，始终可以正常访问。</p>
    </section>

    <AdminLogin v-else-if="!authenticated" ref="loginForm" @submit="onLogin" />

    <template v-else>
      <header class="admin-header">
        <h1 class="admin-header__title">FRAMEFOLIO 管理</h1>
        <div class="admin-header__actions">
          <AdminVersionBadge :version="appVersion" />
          <AdminThemeToggle />
          <a class="admin-link" href="/">查看网站</a>
          <button class="admin-link" type="button" @click="onLogout">
            退出登录
          </button>
        </div>
      </header>

      <p
        v-if="message"
        class="admin-notice"
        :class="`admin-notice--${messageTone}`"
        role="status"
        aria-live="polite"
      >
        {{ message }}
      </p>

      <p
        v-if="indexIncompatible"
        class="admin-notice admin-notice--warning"
        role="alert"
      >
        <strong>索引需要重建。</strong>
        现有 <code>data/photos.json</code> 是旧格式，当前版本读不了，
        因此所有照片都显示为「待新增」。点下面的「立即同步」重建索引即可；
        <strong>未点同步之前，公开画廊会显示错误状态</strong
        >。首次同步会重新生成全部缩略图，之后都是增量。
      </p>

      <section class="admin-section" aria-labelledby="admin-sync-heading">
        <h2 id="admin-sync-heading" class="admin-section__title">同步</h2>
        <AdminSyncPanel
          :status="syncStatus"
          :pending-total="pending?.total"
          :busy="loading"
          @sync="onSync"
        />
        <p class="admin-notice admin-notice--attention">
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
