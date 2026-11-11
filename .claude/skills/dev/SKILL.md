---
name: dev
description: Start or continue a change on the safe path - isolated worktree and branch, test first, PR with green CI and a preview URL, then merge to beta. Use for any code change in this repo ("/dev <tarea>", "arregla", "añade", "cambia"), and to bring commits made on local main into a PR.
---

# /dev — a change, from idea to beta

Every code change goes through these steps. Users never see it until `/publicar`.

## 1. Agree what "done" means

Before touching code, write in 2–4 lines: the goal, how to check it works, and which
**critical flows** (see `CLAUDE.md`) it could break. If the request is unclear, ask now.

## 2. Isolated worktree (never edit the shared tree)

Other sessions work in `d:\03 TEST\live` at the same time. Work in your own worktree:

```bash
git fetch origin
git worktree add -b <type>/<short-slug> ".worktrees/<short-slug>" origin/main
cd ".worktrees/<short-slug>" && pnpm install --frozen-lockfile --prefer-offline
```

`<type>` is a Conventional Commit type (feat, fix, perf, refactor, test, docs, chore, ci).
Never junction `node_modules`. Use Node 24 (`fnm exec --using 24 ...`) for tests and push.

**Commits already on local `main` that are not pushed** (pushes to main are blocked):
`git push origin <sha>:refs/heads/<type>/<slug>` sends them as a branch; then go to step 5.

## 3. Test first, then the change

- A bug: first a test that fails because of the bug, then the fix.
- A feature: tests for the agreed checks. Anything touching a critical flow needs an e2e
  in `tests/e2e/`, not only a unit test with fakes.
- New behaviour that changes how a critical flow feels starts **off by default** or behind
  a setting, so it can be turned off without a release.
- One functional change per branch. Unrelated fixes get their own `/dev`.

## 4. Check locally

```bash
pnpm check          # format, lint, types, unit tests (~1 min)
```

If the change touches audio, capture, captions, sync or the phone layout, also run
`pnpm test:e2e` and look at the app (skill `run`) with screenshots. Do not report "done"
on a red check.

## 5. PR and CI

```bash
git push -u origin <branch>
gh pr create --fill --base main     # title = Conventional Commit, body: goal + how it was checked
gh pr checks --watch
```

When CI is green, give the user the **preview URL** (Firebase comments it on the PR, channel
`pr-N`) and what to try there. If CI fails, fix it on the same branch; never skip checks.

## 6. Merge to beta (when the user says so)

```bash
gh pr merge <n> --squash --delete-branch
```

This updates **beta**, not live. Then clean up the worktree (`git worktree remove
".worktrees/<slug>"`) and tell the user the beta URL is updating. Going live is `/publicar`.

## Never

`git push` to main, `--force`, `gh pr merge --admin`, `firebase deploy`, editing a test only
to make it pass, or deleting a critical-flow test. The guard hook blocks most of these;
the rest is on you.
