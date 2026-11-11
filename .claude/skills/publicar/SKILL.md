---
name: publicar
description: Put what is on beta on the live site as a new version, after checks and an explicit yes from the user. Use when the user says "/publicar", "pásalo a producción", "publica", "sube a live".
---

# /publicar — beta to production

Only the user decides this. Never run it on your own initiative.

## 1. What would go live

```bash
gh pr list --search "head:release-please--" --json number,title,url
gh pr view <n> --json body -q .body        # the changelog release-please wrote
gh run list --workflow CI --branch main -L 1 --json conclusion,headSha
```

If there is no release PR, nothing new is on main since the last version: say so and stop.

Show the user, in plain words: the version number, the list of changes, and the **beta URL**
to try first. Point out any change that touches a critical flow (`CLAUDE.md`).

## 2. Gates (all must hold, otherwise stop and say which one failed)

- CI on the latest main commit is `success`.
- The release PR's own checks are green. A PR opened by release-please starts no CI, so
  start it as the user: `gh pr close <n> && gh pr reopen <n>`, then `gh pr checks <n> --watch`.
- The user has tried beta, or says explicitly they skip it.

## 3. Explicit yes

Ask: "¿Publico la versión X.Y.Z en producción?" and wait for a clear yes in this conversation.
The guard hook asks again when you merge; that is expected.

## 4. Publish

```bash
gh pr merge <n> --squash
gh run watch $(gh run list --workflow firebase.yml -L 1 --json databaseId -q '.[0].databaseId')
```

Merging tags the version and the Release workflow starts the live deploy. Wait for it, then
open the live site and check the critical flows still start. Report the version and the
result. If the deploy fails or something is wrong on live, offer `/volver` right away.

After the first release (1.0.0), remove `"release-as": "1.0.0"` from
`release-please-config.json` through a `/dev` PR, or every release stays 1.0.0.
