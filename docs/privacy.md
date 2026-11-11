# Privacy

The app shows this to its users at `/privacy` (the Privacy & security page, `src/modules/privacy`).
Keep both in step when a data flow changes.

Neboki Live is a static web page. There is **no Neboki Live server for your data, no analytics and
no telemetry**; signing in is optional. Everything below happens between your browser and OpenAI,
using your own API key (the free demo, when a build offers it, is the one exception: see the page).

## What is sent to OpenAI

Only while a live session is running, and only to `api.openai.com` — or, if you chose Azure OpenAI,
only to the Azure resource endpoint you entered (same requests under `/openai/v1/`, key in the
`api-key` header or, for the WebSocket, the `api-key` query parameter):

| What                                                                          | Where                                                                     | When                                                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio of the tab, screen or microphone you choose (mono PCM16, 24 kHz)        | Realtime API, over an encrypted WebSocket (`wss://`)                      | While someone speaks, plus about 0.3 s before and 0.5 s after each sentence; silence between sentences stays on your device and is not sent |
| Glossary terms and meeting hints (topic, languages), as transcription hints   | Realtime API                                                              | When the session starts                                                                                                                     |
| Interpreter mode: all the audio, silence included                             | Realtime translations API (OpenAI only)                                   | For the whole session                                                                                                                       |
| Each transcribed sentence, your glossary and the previous few lines (context) | Chat Completions (`https://`)                                             | For every sentence to translate                                                                                                             |
| The recent transcript                                                         | Chat Completions                                                          | Only if the summary or reply suggestions are on                                                                                             |
| The translated text                                                           | ElevenLabs text-to-speech (`api.elevenlabs.io`, with your ElevenLabs key) | Only if you pick an ElevenLabs voice                                                                                                        |
| Your API key                                                                  | Every request above (WebSocket subprotocol or `Authorization` header)     | Always, it identifies your account                                                                                                          |

With the default browser voice, speech is produced by your operating system and nothing extra is
sent. How OpenAI stores and uses API data is described in its
[API data usage policy](https://openai.com/policies/api-data-usage-policies) and
[data controls](https://platform.openai.com/docs/guides/your-data). Usage is billed to your own
OpenAI account. With Azure OpenAI, data handling and billing follow your Azure subscription and
Microsoft's terms for Azure OpenAI.

## What stays in your browser

Saved in `localStorage` under the `neboki-live:` prefix, on this device only:

- **Your API key** (`openai-key`), unless you untick **Remember on this device** (on by default,
  `remember-key`). Then it lives in memory and is gone when you close the tab. **Forget key**
  deletes it at any time.
- Where the models run and, for Azure, the resource endpoint (`provider`, `azure-endpoint`).
- Caption bar preferences (`overlay-prefs`): options switched on, placement, size, opacity,
  theme, video sync and the glossary of names and terms.
- Model, quality and voice settings (`models`, `tts`), the target language (`target-language`)
  and the spending limit (`spend-limit`).
- What a session listens to and which microphone (`audio-source`, `mic-device`: the browser's
  device id, not its name).
- The meeting hints you typed: topic and languages spoken (`meeting`). The topic is free text,
  so write there only what you would keep on this device.
- The interface language and the colour scheme (`locale`, `theme`).

Nothing else is stored. Transcripts, translations and audio are kept in memory for the current
session only, and nothing leaves the device except what the table above lists.

## Export

**Export** downloads the _current_ session as a Markdown file generated in your browser. There is
no session history: once you start a new session or close the tab, the previous one is gone unless
you exported it. (This is a deliberate scope decision; a stored history may come later as an
opt-in.)

## Consent

Neboki Live transcribes and translates what other people say. Recording or processing someone
else's voice may require their consent where you or they live, and some workplaces forbid sending
meeting content to third parties. **Tell the people in the call and ask for their consent before
you start.** You are responsible for how you use the app.

## Third parties

None besides OpenAI (or your Azure OpenAI resource). Fonts are self-hosted and the page's
[Content Security Policy](../SECURITY.md#content-security-policy) only allows connections to the
page itself, to `api.openai.com` and to Azure OpenAI hosts (`*.openai.azure.com`,
`*.cognitiveservices.azure.com`, `*.services.ai.azure.com`).

## Questions

Write to neboki@neboki.com, or report security problems privately as described in
[SECURITY.md](../SECURITY.md).
