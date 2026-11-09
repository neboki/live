# 0001 — Static web app instead of a desktop app

- **Status:** accepted
- **Date:** 2026-10-20

## Context

Neboki Live must be usable in seconds by anyone who finds it on GitHub. A desktop app (Tauri or
Electron) needs installers, code signing on Windows and macOS, and platform-specific audio capture.

## Decision

Build a static Vue 3 + Vite + TypeScript app deployed to GitHub Pages:

- Audio comes from `getDisplayMedia({ audio: true })` (a shared tab or screen).
- The caption bar floats above other apps through the Document Picture-in-Picture API.
- There is no backend: the browser talks directly to the AI provider with the user's own key.

## Consequences

- ✅ Zero install, zero hosting cost, one URL to share.
- ✅ Simple repository and CI.
- ❌ Chromium desktop browsers only.
- ❌ Whole-system audio only on Windows; tab audio elsewhere.
- ❌ No click-through or OS-wide shortcut. If needed later, wrap the same app in Tauri.
