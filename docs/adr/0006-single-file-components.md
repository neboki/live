# 0006 — Single-file components with `<script setup>`

- **Status:** accepted
- **Date:** 2026-10-24

## Context

Each component was split into four files: `Name.vue` (three `src=` lines), `Name.ts`
(`defineComponent` with `setup()`), `Name.html` and `Name.scss`. With about 40 components that
is some 155 files, most of them a few lines long. It works against the Vue tooling: props are
declared at runtime with `PropType`, every binding has to be returned from `setup()` by hand,
and editors check templates less precisely across files. It is also not what people who know
Vue expect to find when they open the repository.

## Decision

1. One file per component, `Name.vue`, with blocks in this order: `<script setup lang="ts">`,
   `<template>`, `<style scoped lang="scss">`. Tests stay next to it as `Name.spec.ts`.
2. Props and events are typed: `defineProps<{ … }>()` (with `withDefaults` only for
   non-boolean defaults) and `defineEmits<{ 'event-name': [payload] }>()`. Prop documentation
   lives on the type members.
3. Constants or types that other files need go in the module's `constants.ts` or `types.ts`,
   never as named exports from a component.
4. Stylelint checks the `<style>` blocks of `.vue` files as well as `.scss` partials
   (`stylelint-config-standard-vue/scss`).
5. No `// #region` markers: files are short enough to read without them.

## Consequences

- About 115 fewer files, and each component reads top to bottom in one place.
- Props and events are checked by the compiler in the parent's template.
- Components no longer expose their internals on the instance; a parent that needs something
  from a child through a template ref must ask for it with `defineExpose`.
