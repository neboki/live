---
name: publicar
description: Put the local work on the live site as a new version, after the local checks pass and an explicit yes from the user. Use when the user says "/publicar", "pásalo a producción", "publica", "sube a live".
---

# /publicar — local to production

Only the user decides this. Never run it on your own initiative.

## 1. What would go live

```bash
git fetch --tags origin -q
git status --short                                  # work not committed yet
git tag -l "v*" --sort=-v:refname | head -1         # the version that is live
git log <last-tag>..HEAD --oneline                  # commits not published yet
git diff <last-tag> --stat                          # every file that changes on live
```

Show the user, in plain words: the list of changes, the files they touch and which
**critical flow** (`CLAUDE.md`) each one could affect. If a file outside the feature being
published changed, say so before anything else.

Uncommitted work: ask which of it is part of this version. Commit only that, file by file
(never `git add -A`); the rest stays local and does not go live.

## 2. Gates (all must hold, otherwise stop and say which one failed)

Run them on exactly what will be published. If uncommitted work is left out, check from a
clean copy (`git stash -u` is not allowed here; use `git worktree add` on the commit).

```bash
pnpm check          # format, lint, types, unit tests
pnpm test:e2e       # builds and runs the critical flows in the browser
```

- Both green. Never weaken or skip a test to get there; a red test means it is not published.
- The user has tried the change in the local app, or says explicitly they skip it.

## 3. Explicit yes

The version follows the commits since the last tag: `feat` → minor, anything else → patch,
`!`/`BREAKING CHANGE` → major. Ask: "¿Publico la versión X.Y.Z en producción?" and wait for a
clear yes in this conversation. The guard hook asks again when the tag is pushed; that is
expected.

## 4. Publish

```bash
npm version X.Y.Z --no-git-tag-version
git commit -m "chore: release X.Y.Z" -- package.json
git tag vX.Y.Z
git push origin main vX.Y.Z
gh run watch $(gh run list --workflow firebase.yml -L 1 --json databaseId -q '.[0].databaseId')
gh release create vX.Y.Z --verify-tag --generate-notes
```

The tag starts the live deploy (2–3 minutes). Wait for it, then open the live site and check
the critical flows still start. Report the version and the result. If the deploy fails or
something is wrong on live, offer `/volver` right away.

CI also runs on the pushed commit as a second net; if it ends red, tell the user.
