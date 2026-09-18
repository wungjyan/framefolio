<script setup lang="ts">
/**
 * Version of the image that is running, shown in the admin header.
 *
 * The value comes from `version.txt`, which the Release Please pull request
 * writes; `shared/node/app-version.ts` reads it while the bundle is built. That
 * timing is the point: the number and the code are then taken from the same
 * commit, so a running container cannot report a version it was not built from.
 *
 * The value arrives as a prop rather than from `useRuntimeConfig` so this
 * component has no Nuxt auto-imports to stub and can be mounted directly in a
 * test.
 */
defineProps<{
  /** Released version, for example `1.1.0`. Never empty; the build fails without it. */
  version: string
}>()
</script>

<template>
  <span class="admin-version" :title="`当前运行的镜像版本：${version}`">
    v{{ version }}
  </span>
</template>
