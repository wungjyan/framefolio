<script setup lang="ts">
/**
 * Admin login form.
 *
 * Shown instead of the dashboard until the session is valid. The error message
 * is deliberately generic: the server does not reveal whether a password was
 * wrong or the account is throttled, and neither does this form.
 */
const emit = defineEmits<{
  submit: [password: string]
}>()

const password = ref('')
const error = ref('')
const submitting = ref(false)

function reset(): void {
  password.value = ''
  error.value = ''
  submitting.value = false
}

/** Called by the parent when a login attempt fails. */
function setError(message: string): void {
  error.value = message
  submitting.value = false
}

function onSubmit(): void {
  if (submitting.value) {
    return
  }

  if (password.value.length === 0) {
    error.value = '请输入管理口令。'
    return
  }

  submitting.value = true
  error.value = ''
  emit('submit', password.value)
}

defineExpose({ reset, setError })
</script>

<template>
  <form class="admin-login" @submit.prevent="onSubmit">
    <h1 class="admin-login__title">FRAMEFOLIO 管理</h1>

    <div class="admin-field">
      <label class="admin-field__label" for="admin-password">管理口令</label>
      <input
        id="admin-password"
        v-model="password"
        class="admin-input"
        type="password"
        name="password"
        autocomplete="current-password"
        :aria-invalid="error.length > 0"
        aria-describedby="admin-login-error"
      />
    </div>

    <p
      id="admin-login-error"
      class="admin-login__error"
      role="alert"
      aria-live="polite"
    >
      {{ error }}
    </p>

    <button class="admin-button" type="submit" :disabled="submitting">
      {{ submitting ? '登录中…' : '登录' }}
    </button>
  </form>
</template>

<style scoped>
.admin-login {
  display: grid;
  gap: var(--gallery-space-md);
  width: min(100%, 22rem);
  margin: 0 auto;
  padding-top: 15vh;
}

.admin-login__title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.admin-login__error {
  min-height: 1.25rem;
  margin: 0;
  font-size: 0.8125rem;
  color: var(--gallery-ink);
}
</style>
