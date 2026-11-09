# Neboki Live

[![CI](https://github.com/neboki/live/actions/workflows/ci.yml/badge.svg)](https://github.com/neboki/live/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

Live translated captions that float over any call, video or webinar. A static web app: your
browser sends the audio straight to OpenAI with your own key, there is no server in between.

**[Open the app](https://neboki-live.web.app/)**

<!-- TODO: add a GIF (docs/demo.gif) once recorded -->

> **Status:** working pre-release (v1.0.0 in preparation). Feedback is welcome.

## What it does

- Streaming transcription and translation of any tab or screen that plays sound (Zoom, Teams,
  Meet, YouTube…), shown in the app or in an always-on-top window (Document Picture-in-Picture),
  as you prefer, and movable between the two at any time.
- Optional extras: original text, spoken translation, reply suggestions and a live summary.
- Glossary of names and terms that must not be translated.
- Export of the session as Markdown, and an estimate of what it cost on your OpenAI bill.
- OpenAI or Azure OpenAI, with configurable models.

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

Code lives in `src/modules/<module>/` (features) and `src/shared/` (reusable pieces).
[`docs/architecture.md`](docs/architecture.md) explains the pipeline and the modules,
[CONTRIBUTING.md](CONTRIBUTING.md) the workflow, commit format and releases, and
[`docs/adr/`](docs/adr/) the key design decisions.

## Credits

The [Geist and Geist Mono](https://vercel.com/font) fonts by Vercel are self-hosted under the
SIL Open Font License 1.1 ([license text](public/fonts/OFL.txt)).

## License

[GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a
network service, you must offer its users the source code of your version.
