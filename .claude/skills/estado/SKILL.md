---
name: estado
description: Short status - what is live, what is local and not published yet, and whether the last checks passed. Use for "/estado", "qué hay en producción", "qué falta por publicar".
---

# /estado — where everything is

Gather, then answer in at most 8 short lines (Spanish):

```bash
git fetch --tags origin -q
git tag -l "v*" "stable-*" --sort=-creatordate | head -3
gh run list --workflow firebase.yml -L 5 --json event,headBranch,conclusion,displayTitle,createdAt
gh run list --workflow CI --branch main -L 1 --json conclusion,headSha
git log <last-tag>..HEAD --oneline       # commits not published yet
git status --short                        # work not committed yet
```

1. **Live**: the tag of the last successful deploy (a tag push, or a `workflow_dispatch`
   run when it was a rollback).
2. **Local, not published**: commits after that tag and uncommitted files, grouped by
   feature.
3. **Checks**: the last CI result on main, if it is red.
