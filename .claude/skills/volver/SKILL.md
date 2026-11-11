---
name: volver
description: Roll the live site back to an earlier version in a few minutes. Use when the user says "/volver", "vuelve a la versión anterior", "rollback", or production is broken.
---

# /volver — roll production back

## 1. Choose the version

```bash
git fetch --tags origin
git tag -l "v*" "stable-*" --sort=-creatordate | head -10
gh run list --workflow firebase.yml --event workflow_dispatch -L 5 --json displayTitle,conclusion,createdAt
```

Show the user the recent versions and which one is live now. Default suggestion: the version
before the current one. Ask which one, and wait for the answer.

## 2. Deploy it

```bash
gh workflow run firebase.yml --ref main -f tag=<tag>
gh run watch $(gh run list --workflow firebase.yml -L 1 --json databaseId -q '.[0].databaseId')
```

The guard hook asks for confirmation. Takes 2–3 minutes. Then open the live site and check
it loads. Report the result.

## 3. After

Rolling back changes only the live site; main and beta keep the faulty change. Offer a `/dev`
to fix it (a revert PR, `git revert <sha>`, is the fastest) and a test that would have caught it.
