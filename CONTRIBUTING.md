# Contributing to Neboki Live

Thanks for helping! This guide keeps the project consistent and easy to review.

## Setup

```bash
nvm use        # Node.js 24 (see .nvmrc)
pnpm install   # installs dependencies and git hooks (lefthook)
```

## Workflow

1. Open or pick an issue so work isn't duplicated.
2. Branch from `main`: `feat/short-name`, `fix/short-name`, `docs/short-name`…
3. Keep pull requests small and focused. CI must be green.
4. Pull requests are squash-merged; the PR title becomes the commit message, so it must follow the
   format below.

## Licence of your contributions

Neboki Live is published under the AGPL-3.0, and Neboki may also offer it under other terms (for
example a commercial licence or a paid hosted plan). So that this stays possible, by opening a
pull request you confirm that:

- you wrote the contribution yourself, or have the right to submit it;
- you license it to everyone under the AGPL-3.0, like the rest of the project; and
- you grant Neboki a perpetual, worldwide, non-exclusive, royalty-free, irrevocable licence to
  use, modify, distribute and sublicense your contribution under any other licence terms,
  including commercial ones.

You keep the copyright of your contribution.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org): `type(optional scope): description`

```text
feat(overlay): add glossary editor to settings menu
fix: stop speech synthesis when the bar is paused
feat!: drop support for the legacy settings format
```

| Type       | Use for                              | Release |
| ---------- | ------------------------------------ | ------- |
| `feat`     | New functionality                    | minor   |
| `fix`      | Bug fix, runtime dependency update   | patch   |
| `perf`     | Performance improvement              | patch   |
| `refactor` | Code change with no behaviour change | —       |
| `docs`     | Documentation only                   | —       |
| `style`    | Formatting, no logic change          | —       |
| `test`     | Adding or changing tests             | —       |
| `build`    | Build system, dev dependencies       | —       |
| `ci`       | CI/CD configuration                  | —       |
| `chore`    | Maintenance                          | —       |

A `!` after the type (or a `BREAKING CHANGE:` footer) marks a backwards-incompatible change and
bumps the major version. The description is imperative, lower case, with no trailing period. Use
the body to explain _why_ and reference issues in the footer: `Closes: #123`. The `commit-msg`
hook checks this for you, and CI checks the PR title.

## Releases

[release-please](https://github.com/googleapis/release-please) keeps a release PR open on `main`
(`.github/workflows/release-please.yml`). It reads the commits since the last release, picks the
version from their types (table above) and writes `CHANGELOG.md`. Merging the release PR bumps
`package.json`, tags `vX.Y.Z` and publishes the GitHub release. The first release is `1.0.0`
(`release-as` in `release-please-config.json`; remove it after that release).

PRs opened by the workflow's `GITHUB_TOKEN` don't trigger CI by themselves; close and reopen the
release PR (or push to its branch) to run the checks. The config can be checked with
`npx release-please release-pr --dry-run --token=<token> --repo-url=neboki/live`, which
needs a GitHub token and network access.

Before a release, run Lighthouse (Chrome DevTools, **Mobile**) on the deployed page; Performance,
Accessibility, Best Practices and SEO should each be **95 or more**.

## Code style

- TypeScript in strict mode — no `any`; explicit return types on exported functions.
- Vue code lives in `src/modules/<module>/`. Each component is one single-file component,
  `Name.vue`, with `<script setup lang="ts">`, `<template>` and `<style scoped lang="scss">` in
  that order; its tests sit next to it as `Name.spec.ts` ([ADR 0006](docs/adr/0006-single-file-components.md)).
- Formatting is automatic (Prettier) on commit.
- Never log API keys, audio or transcripts.

## Reporting security issues

Please don't open a public issue — see [SECURITY.md](SECURITY.md).
