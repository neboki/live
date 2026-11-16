# Neboki Live — rules for Claude

## How code reaches users (mandatory)

```
work locally in this folder → tests → the user tries it on :5173
/publicar → local checks green → user's explicit yes → version tag → live
/volver   → an earlier tag back on live
/estado   → what is live and what is only local
```

- There are two places only: this folder and the live site. No branches, pull requests,
  worktrees or beta for normal work.
- Only the user decides what goes live, and only through `/publicar` or `/volver`. Never
  push a version tag, run the deploy workflow or `firebase deploy` on your own;
  `.claude/hooks/guard.mjs` blocks or asks for these. Do not work around the guard.
- Commit when a change is done and checked. Commits stay local until `/publicar`.
- `stable-2026-11-11` is the live version from before the release process (commit 640d0d2).

## A change touches only its own feature (the most important rule)

Adding or changing one feature must not change any other.

- Before writing code, say in 2–4 lines: the goal, how to check it works, and which files
  you expect to touch.
- Touch only the files of that feature. If the change needs shared code (`src/shared/`,
  `useLiveSession`, providers, `functions/src/handler.ts`, build or deploy config), stop and
  tell the user which other features use it before editing it.
- No drive-by fixes, renames, reformatting or dependency updates in the same change. Note
  them and offer them as a separate change.
- New behaviour that changes how a critical flow feels starts off by default or behind a
  setting.
- When done, list every file touched (`git status --short`) and explain any that was not in
  the plan.
- Several Claude sessions may share this folder: commit only your own files, never
  `git add -A`, `git checkout`, `git stash` or rewrite a file another session is changing.

## Critical flows (must keep working)

Any change that touches one of these needs an e2e test for it and a look in the real app
before it is published:

1. Listen with the microphone: captions appear while the person speaks.
2. Share a tab (call, YouTube): captions, and the tab's picture in the page, without stutter.
3. Floating window and full screen with the quick controls.
4. Phone layout: home, Listen button, live bar.
5. Translated voice (OpenAI default, ElevenLabs optional) does not block captions.
6. Google sign-in, saved preferences and the conversations page.

Rules for tests: a fixed bug gets a test that fails without the fix. Never weaken or delete
a test of a critical flow to get a green check; ask the user first. `pnpm check` after every
change; `pnpm test:e2e` too when it touches audio, capture, captions, sync or the phone
layout.

## Conventions

Conventional Commits in English (`feat:`, `fix:`, …), checked by commitlint. Node 24.
