---
name: publicar
description: Put the local work on the live site as a new version. Claude runs it on its own after every finished, committed change, without asking, once the checks that fit the change pass. Also when the user says "/publicar", "pásalo a producción", "publica", "sube a live".
---

# /publicar — local to production

The user decided (2026-11-21) that every finished change goes live directly, with no
confirmation. Run this on your own as soon as a change is done and committed. Do not ask
"¿publico?"; just publish and report.

## 1. What would go live

```bash
git fetch --tags origin -q
git status --short                                  # work not committed yet
git tag -l "v*" --sort=-v:refname | head -1         # the version that is live
git log <last-tag>..HEAD --oneline                  # commits not published yet
git diff <last-tag> --stat                          # every file that changes on live
```

Publish only your own committed work. Uncommitted files from another session stay local
(never `git add -A`). If `main` has commits you did not make and do not understand, say so
in the report.

Open `claude/...` pull requests from the cloud are not merged automatically; mention them.

## 2. Checks — sized to the change

Pick by what the change touches (`git diff <last-tag> --stat`):

| Change                                                                                                                                                              | Checks                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Text, styles, docs, copy only                                                                                                                                       | `pnpm check`                   |
| Logic in one feature, no critical flow                                                                                                                              | `pnpm check`                   |
| Audio, capture, captions, sync, phone layout, voice, sign-in, prefs, shared code (`src/shared/`, `useLiveSession`, providers, `functions/`), build or deploy config | `pnpm check` + `pnpm test:e2e` |

When in doubt, run both. A red check means it is not published: fix it or report it. Never
weaken or skip a test to get green.

## 3. Publish

The version follows the commits since the last tag: `feat` → minor, anything else → patch,
`!`/`BREAKING CHANGE` → major.

```bash
npm version X.Y.Z --no-git-tag-version
git commit -m "chore: release X.Y.Z" -- package.json
git tag vX.Y.Z
git push origin main vX.Y.Z
gh run watch --exit-status $(gh run list --workflow firebase.yml -L 1 --json databaseId -q '.[0].databaseId')
gh release create vX.Y.Z --verify-tag --generate-notes
```

The tag starts the live deploy (2–3 minutes). After the deploy, its `check-live` job opens the
published site in a browser and checks it starts and shows captions (`pnpm test:live`,
OpenAI faked); `gh run watch --exit-status` waits for both. Report in a few lines: version,
what changed, which checks ran, result. If the deploy or `check-live` fails, run `/volver` to
the previous version right away and say so.

CI also runs on the pushed commit as a second net; if it ends red, tell the user.
