# Neboki Live

[![CI](https://github.com/neboki/live/actions/workflows/ci.yml/badge.svg)](https://github.com/neboki/live/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

### Understand any conversation, in any language, live.

Translated captions for calls, videos and in-person meetings, about a second after each
sentence. No server and no account: your audio goes straight to OpenAI with your own key.

**[Open the app](https://neboki-live.web.app/)** · works on desktop and on your phone

<!-- TODO: add a GIF (docs/demo.gif) once recorded -->

> **Status:** working pre-release (v1.0.0 in preparation). Feedback is welcome.

## Where it works

- **On your computer** — Zoom, Teams, Meet, YouTube, webinars. Captions float in a window that
  stays on top of everything, even outside the browser, or stay in the app.
- **In the room** — meetings, interviews, classes, events. Put your phone or laptop on the
  table and read along; it listens through the microphone.
- **Hybrid** — the call and the room at once: the shared tab and the microphone, mixed.

## What you get

- **Follow along** — the translation, with the original text underneath if you want it, or
  read aloud (or the Interpreter mode, which translates as they speak).
- **Join in** — what you could reply and what you could ask, in your language and theirs.
- **Skip the notes** — a live summary, and the whole conversation exported as Markdown.
- **Get the names right** — a glossary of names and terms that must not be translated.
- **Keep the bill in check** — a live cost estimate and a spending limit per session.

## Why you can trust it

- Open source, no server, no analytics: audio and text go only to OpenAI.
- Your key stays in your browser, and only if you choose to remember it.
- OpenAI or Azure OpenAI (handy at work), with configurable models.
- From about **$0.24/hour** on your own OpenAI bill at the default quality.

## How to use

1. Open the [app](https://neboki-live.web.app/).
2. Paste your [OpenAI API key](https://platform.openai.com/api-keys). **Usage is billed to your
   own OpenAI account** — a dedicated key with a spending limit is a good idea.
   Using **Azure OpenAI** instead? Pick it, paste your resource endpoint and key, and set the
   model names in the settings menu to your deployment names (transcription, chat and, for
   voice, TTS deployments).
3. Choose the tab or screen to listen to and tick **Share audio**.

Keyboard: **Ctrl+Shift+Space** hides or shows the captions, **Ctrl+Shift+E** exports the session.

## Requirements and limits

|                                    | Windows                              | macOS | Linux |
| ---------------------------------- | ------------------------------------ | ----- | ----- |
| Chrome / Edge — tab audio          | ✅                                   | ✅    | ✅    |
| Chrome / Edge — whole system audio | ✅                                   | ❌    | ❌    |
| Chrome / Edge — floating window    | ✅                                   | ✅    | ✅    |
| Firefox / Safari                   | ❌ (no Document PiP / audio capture) |       |       |

The cost shown in the app is an estimate based on published prices; your OpenAI bill is the
reference.

## Privacy

- Your API key is stored only in your browser (and only if you choose to remember it).
- Audio and text are sent directly to OpenAI; there is no Neboki Live server and no analytics.
- Only the current session can be exported; no history is kept.
- Translating other people's speech may require their consent where you live — please ask them.

See [`docs/privacy.md`](docs/privacy.md) for what is sent and what stays on your device.

## Development

Requires Node.js 24 and pnpm.

```bash
pnpm install        # dependencies + git hooks
pnpm dev            # app at http://localhost:5173/
pnpm check          # format, lint, typecheck and unit tests
pnpm test:coverage  # unit tests with coverage thresholds
pnpm test:e2e       # browser tests (Playwright), including the CSP check
pnpm build          # production build in dist/
```

Or open it in **GitHub Codespaces** (Code → Codespaces → Create): the dev container installs
Node 24, pnpm, the dependencies and Claude Code. Run `pnpm dev` and open the forwarded port 5173. Before `pnpm test:e2e`, install the browser once with
`pnpm exec playwright install --with-deps chromium`.

Code lives in `src/modules/<module>/` (features) and `src/shared/` (reusable pieces).
[`docs/architecture.md`](docs/architecture.md) explains the pipeline and the modules,
[CONTRIBUTING.md](CONTRIBUTING.md) the workflow, commit format and releases, and
[`docs/adr/`](docs/adr/) the key design decisions.

### Run your own copy

`pnpm build` leaves a static site in `dist/` that any static host can serve; with your own
OpenAI key it needs no backend. Google sign-in and saved conversations are optional: copy
`.env.example` to `.env` and fill in your own Firebase project, or leave it empty to build
without accounts. If you publish your copy, read the licence and the name rules below.

## Credits

The [Geist and Geist Mono](https://vercel.com/font) fonts by Vercel are self-hosted under the
SIL Open Font License 1.1 ([license text](public/fonts/OFL.txt)).

## License

Copyright © 2026 Neboki.

The code is free software under the
[GNU Affero General Public License v3.0](LICENSE): you can use, study, change and share it. If
you distribute a modified version, or run one as a network service, you must offer its users the
source code of your version under the same licence.

**Other terms.** If the AGPL does not fit your use (for example, building it into a closed
product), write to <neboki@neboki.com> about a commercial licence.

**Name and logo.** The licence covers the code, not the brand: the names "Neboki" and "Neboki
Live" and the logo are not licensed. A modified version or a service of your own needs a
different name and logo, and must not suggest that it comes from Neboki.
