<script setup lang="ts">
import { otherGalleryLocale } from '../../utils/locale'

/**
 * Language toggle for the admin header.
 *
 * Built like `AdminThemeToggle`: a separate component from the gallery's
 * controls, but sharing the same `useLocale` composable, so the header and the
 * public gallery read and write one stored choice.
 *
 * The label is written in the *target* language ("English" / "简体中文") rather
 * than the current one, because the label is the action, not the state — the
 * same rule the theme toggle follows.
 */
const { locale, toggleLocale, t } = useLocale()

const currentLocaleName = computed(() => t(`locale.${locale.value}`))
const targetLocaleName = computed(() =>
  t(`locale.${otherGalleryLocale(locale.value)}`)
)
</script>

<template>
  <button
    type="button"
    class="admin-link admin-locale-toggle"
    :aria-label="
      t('locale.aria', {
        current: currentLocaleName,
        target: targetLocaleName
      })
    "
    :title="
      t('locale.title', {
        current: currentLocaleName,
        target: targetLocaleName
      })
    "
    @click="toggleLocale"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
    </svg>
  </button>
</template>
