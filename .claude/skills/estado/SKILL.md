---
name: estado
description: Short status of the release path - what is live, what is on beta waiting to go live, open PRs and their checks. Use for "/estado", "qué hay en producción", "qué falta por publicar".
---

# /estado — where everything is

Gather, then answer in at most 8 short lines (Spanish):

```bash
git fetch --tags origin -q
git tag -l "v*" "stable-*" --sort=-creatordate | head -3
gh run list --workflow firebase.yml -L 10 --json event,conclusion,displayTitle,createdAt,headSha
gh pr list --json number,title,headRefName,statusCheckRollup,url
git log origin/main --oneline -1
git log main --not origin/main --oneline     # local commits that are not in a PR yet
git worktree list
```

1. **Live**: the version tag of the last successful `workflow_dispatch` deploy.
2. **Beta**: the last main commit deployed, and how many changes it has beyond live
   (the release PR body lists them).
3. **Open PRs**: number, title, checks green/red/running.
4. **Loose work**: unpushed commits on local main or stale worktrees, with the `/dev`
   step that fixes them.
