# Neboki Live — rules for Claude

## How code reaches users (mandatory)

```
/dev  → own worktree + branch → tests → PR (preview pr-N) → green CI → merge → beta
/publicar → release PR → user's explicit yes → version tag → live
/volver   → an earlier tag back on live
/estado   → what is where
```

- `main` is protected: changes only arrive through PRs with a green CI. Pushing to main,
  force pushes, `gh pr merge --admin` and `firebase deploy` are blocked by
  `.claude/hooks/guard.mjs`. Do not work around the guard; if it is wrong, fix it in a PR.
- Several Claude sessions share `d:\03 TEST\live`. Never edit code there: use a worktree
  under `.worktrees/` (skill `/dev`).
- Only the user decides what goes live, and only through `/publicar` or `/volver`.
- `stable-2026-11-11` is the live version from before this process (commit 640d0d2).

## Critical flows (must keep working)

Any change that touches one of these needs an e2e test for it and a look in the real app
before merging, and its PR says which flow it touches:

1. Listen with the microphone: captions appear while the person speaks.
2. Share a tab (call, YouTube): captions, and the tab's picture in the page, without stutter.
3. Floating window and full screen with the quick controls.
4. Phone layout: home, Listen button, live bar.
5. Translated voice (OpenAI default, ElevenLabs optional) does not block captions.
6. Google sign-in, saved preferences and the conversations page.

Rules for tests: a fixed bug gets a test that fails without the fix. Never weaken or delete
a test of a critical flow to get a green CI; ask the user first.

## Conventions

Conventional Commits in English (`feat:`, `fix:`, …), checked by commitlint. Node 24.
`pnpm check` before every PR.
