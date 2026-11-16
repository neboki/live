# Architecture

Neboki Live is a static Vue 3 + Vite + TypeScript app served from Firebase Hosting
(https://neboki-live.web.app). There is no backend: the browser talks to OpenAI directly with the user's key
(see [ADR 0001](adr/0001-static-web-app.md) and [ADR 0002](adr/0002-openai-single-provider.md)).

## Pipeline

```text
getDisplayMedia (shared tab / screen audio)
  └─ AudioWorklet (pcmCapture.worklet.ts): mono PCM16 at 24 kHz, voice level for the glow
       └─ energyVad: client-side voice activity detection, commits a sentence on a pause
            └─ realtimeStt: Realtime API (wss, transcription intent), partial + final text,
               │            reconnect with backoff and a bounded audio buffer
               └─ livePipeline: one translation per final sentence, plus summary and suggestions
                    └─ openAiLlm: Chat Completions with SSE streaming (glossary + previous lines)
                         └─ overlay store (Pinia) ─ CaptionBar, in the live page or teleported
                                                    into a Document Picture-in-Picture window
                         └─ session record ─ export (.md) and cost estimate
                         └─ voice output (OpenAI Realtime voice by default, ElevenLabs or browser speechSynthesis; streamed as
                                          PCM into pcmPlayer), optional
                         └─ video sync (delayedPlayback): the shared tab shown in the page a few
                                          seconds behind, in step with the captions, optional
```

1. **Capture** — `src/shared/audio/audioCapture.ts` asks for `getDisplayMedia({ audio: true })`,
   keeps only the audio track and feeds it to the worklet. Cancelling, sharing no audio or ending
   the share become typed errors with a clear message. A shared tab's picture is kept (disabled)
   for the sync option: `src/modules/live/watchers/videoSync.ts` then plays the tab in the page
   through `src/shared/media/delayedPlayback.ts` a fixed number of seconds behind, known beforehand on "auto" and never stopped for a caption,
   and shows the captions (and reads the voice) the picture has reached ([ADR 0008](adr/0008-video-sync.md)).
2. **Worklet** — `pcmCapture.worklet.ts` runs on the audio thread, downmixes and resamples to
   24 kHz PCM16 (the rate the Realtime API accepts) and posts chunks plus the RMS level.
3. **VAD and silence gate** — `energyVad.ts` decides when a sentence ends and commits it on a pause.
   `silenceGate.ts` keeps silence off the wire: while no sentence is open nothing is sent, only a
   300 ms pre-roll is held and sent before the first speech so no syllable is clipped; the sentence
   tail (up to the 500 ms close) is sent. Billed audio is about speech time plus that pre-roll and tail.
4. **Transcription** — `src/shared/providers/openai/realtime/realtimeStt.ts` streams the audio over a
   WebSocket. Partial text appears while people speak; the final text triggers translation.
5. **Pipeline** — `src/modules/live/pipeline/` turns final sentences into translation, summary
   and suggestion requests, routes errors (notice vs. fatal alert) and reports token usage.
6. **LLM** — `openAiLlm.ts` uses streaming Chat Completions (`sse.ts`); prompts in `prompts.ts`
   mark transcript, previous lines and glossary as untrusted data.
7. **UI** — the overlay store drives the caption bar. It shows in the live page or, when the user
   chose so, in an always-on-top window: `src/shared/pip/useDocumentPip.ts` opens it and copies
   the page styles (and so the self-hosted fonts) there, and the bar's own buttons move it from
   one place to the other ([ADR 0009](adr/0009-caption-placement.md)).

## Module layout

```text
src/
├─ main.ts                 entry of the web app (index.html)
├─ modules/                features (Vue code lives only here; single-file components)
│  ├─ core/                bootstrap (plugins, error handlers), App shell (start / live / session)
│  ├─ onboarding/          app start screen: language, API key, audio source, placement
│  ├─ live/                live page, useLiveSession store, pipeline/, watchers/ (away,
│  │                       tab silence, video sync)
│  ├─ overlay/             caption bar, settings menu, glossary, shortcuts, overlay store
│  ├─ session/             session record, exports (Markdown, subtitles), pricing and cost
│  └─ settings/            settings page and store: API key, models, voice, languages
└─ shared/                 reusable, UI-free pieces
   ├─ audio/               capture, worklet, PCM helpers, energy VAD
   ├─ providers/           SttProvider / LlmProvider types and the OpenAI implementation
   ├─ speech/              voice output (OpenAI Realtime, ElevenLabs and browser)
   ├─ media/               delayed playback of the shared tab (video sync)
   ├─ pip/                 Document Picture-in-Picture
   ├─ device/              install prompt, screen wake lock
   ├─ errors/              AppError hierarchy and logError
   ├─ i18n/                vue-i18n setup, en and es locales
   ├─ storage/             safeStorage (localStorage that never throws)
   ├─ brand/, theme/       colour brand and light / dark theme
   ├─ links/               external links used in the UI
   └─ styles/              design tokens, fonts, motion
```

Inside a module, folders keep one role each: `components/` (one folder per component, its
`.vue` and `.spec.ts` side by side), `composables/` (`useX` functions for components),
`store/` (Pinia stores only), `utils/` (pure functions) and, in `live/`, `pipeline/` and
`watchers/`.

Every module exposes its public API in an `index.ts`. Code in another module imports from
there (`import { useSettingsStore } from '@/modules/settings'`), never from a file inside it;
ESLint enforces this (`no-restricted-imports` in `eslint.config.js`). Tests may reach inside a
module to mock or set it up. In `src/shared/`, folders with an `index.ts` (`audio`, `device`,
`errors`, `i18n`, `links`) are imported through it.

## Where to change what

| I want to…                                   | Look in                                                     |
| -------------------------------------------- | ----------------------------------------------------------- |
| Change how captions look or behave           | `src/modules/overlay/components/CaptionBar/`                |
| Add an option to the bar's settings menu     | `src/modules/overlay/components/SettingsMenu/`              |
| Change the start screen                      | `src/modules/onboarding/components/OnboardingView/`         |
| Add a setting that is saved                  | `src/modules/settings/store/useSettingsStore.ts`            |
| Add a translation language                   | `src/modules/settings/languages.ts`                         |
| Translate the UI or fix a text               | `src/shared/i18n/locales/en.json` and `es.json`             |
| Change prompts sent to the model             | `src/shared/providers/openai/llm/prompts.ts`                |
| Change default models                        | `src/shared/providers/openai/config.ts`                     |
| Update prices for the cost estimate          | `src/modules/session/pricing.ts`                            |
| Change what happens when a sentence is final | `src/modules/live/pipeline/`                                |
| Start / stop logic of a conversation         | `src/modules/live/store/useLiveSession.ts`                  |
| Change exports (Markdown, subtitles)         | `src/modules/session/utils/toMarkdown.ts`, `toSubtitles.ts` |
| Audio capture or voice detection             | `src/shared/audio/`                                         |
| Allow a new host in the CSP                  | `index.html` (and `tests/e2e/csp.spec.ts`)                  |

## Extension points

- **Providers** — `src/shared/providers/types.ts` defines `SttProvider` (start a session with
  callbacks for partial/final text, status and usage) and `LlmProvider` (translate, summarise,
  suggest; each takes an `AbortSignal` and reports `Usage`). A new vendor implements these and is
  wired in the live pipeline; the UI does not change.
- **Voice** — `src/shared/speech/types.ts` defines `TtsProvider`; OpenAI Realtime (default), ElevenLabs and browser engines exist ([ADR 0010](adr/0010-elevenlabs-voice.md)).
- **Models** — model IDs default to `MODELS` in `providers/openai/config.ts` and can be changed in
  the settings menu. Prices for the cost estimate live in `src/modules/session/pricing.ts`
  ([ADR 0003](adr/0003-pricing-and-model-tiers.md)).

## Errors

`src/shared/errors/AppError.ts` defines `AppError` with an HTTP-like `status` and a
`userMessageKey` (an i18n key; users never see technical details). Subclasses:
`ValidationError` (400), `UnauthorizedError` (401, invalid key), `ForbiddenError` (403),
`NotFoundError` (404), `ConflictError` (409), `BusinessError` (422) and its
`UnsupportedFeatureError`, `RateLimitError` (429, rate limit or no credit) and
`ExternalServiceError` (502). `logError(context, err)` logs with context and returns an
`AppError`; aborted requests (`isAbortError`) are never reported. Recoverable problems (a rate
limit) show a notice and the session goes on; fatal ones stop it with an alert inside the bar.

## Security

The app sets a Content Security Policy in `index.html`:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self';
connect-src 'self' https://api.openai.com wss://api.openai.com <Azure OpenAI hosts, https and wss> https://api.elevenlabs.io;
media-src 'self' blob:;
worker-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'
```

The Azure hosts are `*.openai.azure.com`, `*.cognitiveservices.azure.com` and
`*.services.ai.azure.com`, the same list `endpoint.ts` accepts as a resource endpoint.
`'unsafe-inline'` for styles is needed by Vue's style bindings and by the PiP window, which gets
the styles as inline `<style>` copies. `blob:` media is the MediaSource URL of the video-sync player
(`delayedPlayback.ts`, [ADR 0008](adr/0008-video-sync.md)); the voice no longer needs it, it
goes through Web Audio ([ADR 0007](adr/0007-voice-latency.md)). `'self'` in
`connect-src` also covers Vite's HMR WebSocket in development. `tests/e2e/csp.spec.ts` fails on
any violation or any request to another origin. Key handling is described in
[SECURITY.md](../SECURITY.md).
