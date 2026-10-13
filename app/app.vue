<script setup lang="ts">
// Both composables are initialised site-wide, not per page: the theme and the
// language are single choices shared by the public gallery and the admin area,
// and each applies its own attribute to <html> (data-theme / lang) once it
// resolves.
//
// `<html lang>` is set on the client only, so the public gallery's server output
// is unchanged; the language is genuinely unknown until the stored choice and
// the browser language have been read.
useTheme()
useLocale()
</script>

<template>
  <div class="app-root">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
