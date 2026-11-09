# Changelog

All notable changes to this project are documented here. Entries are written by
[release-please](https://github.com/googleapis/release-please) from the
[Conventional Commits](https://www.conventionalcommits.org) on `main`, and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

<!-- Written by hand before the switch to Conventional Commits. release-please adds the 1.0.0
     entry above this section; in that release PR, move these notes into it and delete this heading. -->

### Added

- Realtime transcription over the Realtime API with client-side voice activity detection, so
  sentences close on a pause. Silence between sentences is not sent, so it is not billed (a
  300 ms pre-roll keeps the first syllable); it reconnects on its own after a short drop.
- Room audio: besides a shared tab, a session can listen to the microphone (meeting rooms,
  interviews, conversations, events) or to both mixed (hybrid meetings), with a microphone
  picker and the browser's echo cancellation, noise suppression and gain control on. Without
  the floating window (phones) the captions show in the page and the screen stays on.
- Streaming translation sentence by sentence, with a glossary of names and terms to keep.
- Live summary and reply suggestions in both languages.
- Spoken translation with the browser voice or, optionally, OpenAI text-to-speech.
- Clear error messages for an invalid key, a rate limit, no credit left and lost connections,
  shown inside the caption bar with Dismiss and Restart.
- Export of the current session as Markdown (`neboki-live-YYYY-MM-DD-HHmm.md`).
- Estimated cost of the session, from token and audio usage, OpenAI voice output included.
- Configurable models for transcription, translation, summary and suggestions.
- Consent notice before starting, and a privacy page (`docs/privacy.md`).
- Architecture overview (`docs/architecture.md`).
- Social preview image, theme colour, touch icon and web manifest.
- Releases with release-please; Dependabot for GitHub Actions.
- Repository foundation: community files, commit conventions and git hooks.
- Live audio capture of a shared tab or screen: mono PCM16 at 24 kHz via an AudioWorklet, with the bar's glow following the real voice level.
- Clear messages when sharing is cancelled, no audio is shared or sharing stops.
- Caption bar ported from the prototype: glass look, words that come into focus, glow that follows the voice, spring animations.
- Floating bar above other windows (Document Picture-in-Picture, Chrome/Edge).
- Home page with live preview and API key step (format check, optional remember).
- App skeleton: Vue 3 + Vite + TypeScript, Pinia and English/Spanish UI.
- Quality tooling: ESLint, Stylelint, Prettier, vue-tsc, Vitest and Playwright.
- GitHub Actions for CI and GitHub Pages deployment.

### Changed

- Fonts are self-hosted: no request leaves for Google Fonts.
- Stricter Content Security Policy (only the page itself and `api.openai.com`), checked by an e2e
  test.
- CI pins every action to a commit SHA, audits runtime dependencies and enforces coverage.
- Manual deploys run only from `main`.
- Components are single-file `.vue` components with `<script setup>` and typed props and events
  (ADR 0006); Stylelint now checks their `<style>` blocks.
- Commits follow Conventional Commits, so release-please picks the version and writes this file.
- Development requires Node.js 24; `pnpm install` refuses older versions.
- Corners come from one `--radius-*` scale, enforced by Stylelint.
- Accessibility: e2e tests run axe (WCAG 2.2 AA) on the app in light
  and dark; small coral text and links meet 4.5:1 contrast, links inside text are underlined,
  the resize grip reports its value and the language switch names match their labels.
