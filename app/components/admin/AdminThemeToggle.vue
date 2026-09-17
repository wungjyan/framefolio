<script setup lang="ts">
/**
 * Theme toggle for the admin header.
 *
 * The public gallery's toggle lives inside `GalleryHeader.vue`, which belongs to
 * the gallery and must stay untouched. This is therefore a separate control
 * rather than a shared component — but it calls the same `useTheme` composable,
 * so both surfaces read and write one stored choice and stay in step whichever
 * one is used.
 *
 * The icon shows the theme that is *currently* applied, matching the gallery's
 * control, and the label spells out what a click will do.
 */
const { theme, toggleTheme } = useTheme()

const currentThemeName = computed(() =>
  theme.value === 'dark' ? '深色主题' : '浅色主题'
)
const targetThemeName = computed(() =>
  theme.value === 'dark' ? '浅色主题' : '深色主题'
)
</script>

<template>
  <button
    type="button"
    class="admin-link admin-theme-toggle"
    :aria-label="`当前为${currentThemeName}，切换到${targetThemeName}`"
    :title="`当前：${currentThemeName}（切换到${targetThemeName}）`"
    @click="toggleTheme"
  >
    <svg
      class="admin-theme-toggle__icon admin-theme-toggle__icon--dark"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 3a6.8 6.8 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
    <svg
      class="admin-theme-toggle__icon admin-theme-toggle__icon--light"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
      />
    </svg>
  </button>
</template>
