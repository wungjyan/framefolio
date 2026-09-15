<script setup lang="ts">
/**
 * Delete confirmation.
 *
 * Uses the native `<dialog>` element with `showModal()`, matching the pattern
 * already used by PhotoViewer. That gives focus trapping, Escape-to-close, and
 * inert background content for free, so no dependency is needed.
 *
 * The wording states explicitly that the photo remains visible on the site
 * until a sync runs — that delay is the easiest part of this model to forget.
 */
const props = defineProps<{
  open: boolean
  filename: string
  busy: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const dialog = ref<HTMLDialogElement>()
const confirmButton = ref<HTMLButtonElement>()

watch(
  () => props.open,
  async isOpen => {
    const element = dialog.value

    if (!element) {
      return
    }

    if (isOpen && !element.open) {
      element.showModal()
      await nextTick()
      confirmButton.value?.focus()
    } else if (!isOpen && element.open) {
      element.close()
    }
  }
)

onMounted(() => {
  if (props.open && dialog.value && !dialog.value.open) {
    dialog.value.showModal()
  }
})

/** Escape fires `cancel`; treat it as a dismissal, not a confirmation. */
function onCancel(event: Event): void {
  event.preventDefault()
  emit('cancel')
}
</script>

<template>
  <dialog ref="dialog" class="admin-dialog" @cancel="onCancel">
    <form method="dialog" class="admin-dialog__body" @submit.prevent>
      <h2 class="admin-dialog__title">删除照片</h2>

      <p class="admin-dialog__text">
        将 <strong>{{ filename }}</strong> 移入回收站？
      </p>

      <p class="admin-dialog__note">
        原图会移入 <code>data/.trash/</code>，可以恢复。
        <strong>照片在同步之前仍会显示在网站上</strong>，
        点击「立即同步」后才会真正移除。
      </p>

      <div class="admin-dialog__actions">
        <button
          class="admin-button admin-button--secondary"
          type="button"
          :disabled="busy"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          ref="confirmButton"
          class="admin-button admin-button--danger"
          type="button"
          :disabled="busy"
          @click="emit('confirm')"
        >
          {{ busy ? '删除中…' : '移入回收站' }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.admin-dialog {
  width: min(100% - 2rem, 26rem);
  padding: 0;
  color: var(--gallery-ink);
  background: var(--gallery-canvas);
  border: 1px solid var(--gallery-surface-active);
  border-radius: 0;
}

.admin-dialog::backdrop {
  background: rgb(0 0 0 / 55%);
}

.admin-dialog__body {
  display: grid;
  gap: var(--gallery-space-sm);
  padding: var(--gallery-space-md);
}

.admin-dialog__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.admin-dialog__text,
.admin-dialog__note {
  margin: 0;
  font-size: 0.8125rem;
}

.admin-dialog__note {
  color: var(--gallery-muted);
}

.admin-dialog__actions {
  display: flex;
  gap: var(--gallery-space-sm);
  justify-content: flex-end;
  margin-top: var(--gallery-space-xs);
}
</style>
