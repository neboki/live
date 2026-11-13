# Changelog

All notable changes to this project are documented here. Entries are written by
[release-please](https://github.com/googleapis/release-please) from the
[Conventional Commits](https://www.conventionalcommits.org) on `main`, and versions follow
[Semantic Versioning](https://semver.org/).

## 1.0.0 (2026-11-13)


### Features

* a conversations page to search, name, star, download and delete them ([aedd03e](https://github.com/neboki/live/commit/aedd03ee8198f3ed18e0445ee7270a508ce034fa))
* a simpler phone home and live bar with rounded text size buttons ([53d1eb6](https://github.com/neboki/live/commit/53d1eb697d52285ddaad46f6860ed28480fb03e8))
* add a Capacitor Android shell for a future store build ([206711d](https://github.com/neboki/live/commit/206711d3c1b6547cee3cbaef05052432d11b66d4))
* add a landing page at the root and serve the app under /app/ ([9c889e9](https://github.com/neboki/live/commit/9c889e98f419b3011422509250661647b8c141be))
* add an in-app privacy and security page ([4470151](https://github.com/neboki/live/commit/44701516a4fa63a1a87e2e4100e8552f2d768b63))
* add conversation, presenting and voice-note modes to live sessions ([9a4e715](https://github.com/neboki/live/commit/9a4e715ea72e16fbb4c7bd4f25f116eab8e47059))
* add work use cases to the landing page ([#13](https://github.com/neboki/live/issues/13)) ([399f8a1](https://github.com/neboki/live/commit/399f8a1f7b827aed4557aa676b8647dea3aa313e))
* check typed model names against the account before a session starts ([f4280b2](https://github.com/neboki/live/commit/f4280b2a3dc5ec53c3bff0ee3d0006d80fb2410e))
* choose the reading voice and its ElevenLabs key on the start screen ([#17](https://github.com/neboki/live/issues/17)) ([5e14d46](https://github.com/neboki/live/commit/5e14d46b603d119fb4653d8c8b466c7c3cb5b07e))
* drop the browser voice from the voice picker ([4464fcb](https://github.com/neboki/live/commit/4464fcb1e390e4570e36ba232aa81ac21e304d19))
* drop the pitch from the start page, now on the landing ([d6ad0e8](https://github.com/neboki/live/commit/d6ad0e801d9237daa7d124e225aa7da29bf5313c))
* fit live text on phones, with text size and full screen ([51dfe31](https://github.com/neboki/live/commit/51dfe31c00b7c22832cfef6646c39f911f737d9f))
* give phones a simple home and live screens with big controls ([8eefe28](https://github.com/neboki/live/commit/8eefe28a330fde7025a3548079025d15ff20ea56))
* hold the synced picture until a late caption arrives ([23413a9](https://github.com/neboki/live/commit/23413a96866addaf80a275b1db06fb5eb78d39f2))
* keep an OpenAI voice as the default, with ElevenLabs optional ([11534db](https://github.com/neboki/live/commit/11534dbf5b21a9923349b9c6e4c0e8c43f23c741))
* keep the brand in the account and a bare full screen on the phone ([bffdc90](https://github.com/neboki/live/commit/bffdc907d8974ced4de63aa34f8fd6380869ab4b))
* keep the preferences in the account so they follow you to every device ([dff9540](https://github.com/neboki/live/commit/dff9540c3dac6d4df7fdd9ef07a09e182e632919))
* leave the synced picture off until it is turned on, and start it sooner ([cab1e5e](https://github.com/neboki/live/commit/cab1e5e416b34a2dba1a7b49b23cb1181f63fdb5))
* link the app back to the website and let the landing use the full width ([6d39b2f](https://github.com/neboki/live/commit/6d39b2fddf7909fb4a6a407661f11e4c0a9a39d2))
* list, open and delete the conversations kept in the account ([27ec57f](https://github.com/neboki/live/commit/27ec57ff3f7722df456ffb80b8d7ccc859e4eacd))
* move saved conversations from the start page to the sidebar ([71174c7](https://github.com/neboki/live/commit/71174c7e74766a91de20e2105aba3277973bbbfc))
* name conversations with AI and add an assistant to their page ([#15](https://github.com/neboki/live/issues/15)) ([8e66037](https://github.com/neboki/live/commit/8e66037295f2ec372e0f78cc7c3e7509fc7b78bc))
* play the shared tab in the app as a player with captions on it ([76f53ad](https://github.com/neboki/live/commit/76f53ad1617afaf64f198d714189dc9671e6a0d4))
* publish Neboki Live ([055797f](https://github.com/neboki/live/commit/055797f7c5d422d11b8b07a192db370a808bd762))
* put the ElevenLabs key next to the OpenAI key in Settings ([#12](https://github.com/neboki/live/issues/12)) ([df78283](https://github.com/neboki/live/commit/df78283a08264922322db18e778e5dd91596f57f))
* quiet one-row icon controls on the phone, none in full screen ([bbb1251](https://github.com/neboki/live/commit/bbb125166f5253a97379d41192e0502cb24156e5))
* read the translation with ElevenLabs voices and drop retired models ([7cee873](https://github.com/neboki/live/commit/7cee873deda84735db300a6d9be8ca4b67266f3d))
* redesign the landing page to show the app on desktop and phone ([51a2753](https://github.com/neboki/live/commit/51a27535ec74d755c5fb5afd700971aa97cdd659))
* same quick controls in the floating window, the page and the phone ([d4fa0b1](https://github.com/neboki/live/commit/d4fa0b1a68d31fffd68d0df41c3683530b180554))
* say what the app is for at the top of the start screen ([ef3cf28](https://github.com/neboki/live/commit/ef3cf281b882e3eb082e45cf67eb1722ae3e1752))
* settle the synced delay at the start and keep the voice on the picture ([19056d5](https://github.com/neboki/live/commit/19056d5b5af5fd98ca3e1462d94f76b066bdf23a))
* show real-life scenes on the landing page ([#18](https://github.com/neboki/live/issues/18)) ([4c68901](https://github.com/neboki/live/commit/4c68901ecdaf4d0e590ad494348eeac594fdf410))
* show the shared tab live in the app and change quality mid-session ([9373f7a](https://github.com/neboki/live/commit/9373f7adc33ef2b255bd4a6da6f94280a44a16b6))
* show the signed-in account at the top right, as in Google's apps ([bb38767](https://github.com/neboki/live/commit/bb3876773cb7065bb674e447f2fbc9393c61b7ac))
* split the settings page into tabs, one subject each ([dced20e](https://github.com/neboki/live/commit/dced20edbb63ca2cf5df86129e6c783e2be60765))
* start new users on medium so captions appear while people speak ([640d0d2](https://github.com/neboki/live/commit/640d0d2157cfe4e741ea3bdba053333bb724f51f))
* suggest a longer sync delay when captions keep landing late ([927b22d](https://github.com/neboki/live/commit/927b22d1a1afc01014003672cd1c7fcdc3289d75))


### Bug Fixes

* **build:** let commitlint find the commit message itself ([5b52926](https://github.com/neboki/live/commit/5b52926ca31b0d318ca82522ad812b79a24da729))
* date interpreter and transcript lines by when their words were spoken ([5560ec0](https://github.com/neboki/live/commit/5560ec0eba1ba6f6cc1502f693e8206c74e14395))
* **deps:** pin @grpc/grpc-js past GHSA-m9gg-hp2v-232j ([a6c4d7b](https://github.com/neboki/live/commit/a6c4d7b3c7360bffe331b872e54ac9e0a8f88d6a))
* keep captions flowing when a translation or a transcript gets stuck ([c0eab4e](https://github.com/neboki/live/commit/c0eab4e0248a28fd7722bc3a31987c8c6996b4c1))
* keep the phone bar on one line and mark the current page clearly ([b3f203b](https://github.com/neboki/live/commit/b3f203b92f8fc636cd3cc2f110ee29224caf1fbf))
* keep the synced picture from stopping at every late caption ([a4b635e](https://github.com/neboki/live/commit/a4b635ef7860546daa9c5b50261258c1aae90cac))
* keep the voice gallery's own text when the ElevenLabs key is missing ([#19](https://github.com/neboki/live/issues/19)) ([5262443](https://github.com/neboki/live/commit/5262443c758d05b6137d802a14f7b4db7d855e55))
* make the chosen option clear at a glance ([6db89f6](https://github.com/neboki/live/commit/6db89f62856fc2f06110f636c4dffe3e56398423))
* never leave the voice queue waiting on an output that does not play ([6c0db57](https://github.com/neboki/live/commit/6c0db57c4db9d6d43fb90936b65a21e4b6a1fe67))
* never offer the user's own language as the other person's ([190198c](https://github.com/neboki/live/commit/190198cd05893da625a59c3c4d1b300c70cff5db))
* never stop the synced picture for a caption ([#22](https://github.com/neboki/live/issues/22)) ([4817445](https://github.com/neboki/live/commit/4817445ecddf4421abecb56be90ecd7e3ae48f8e))
* race a second request when a translation is slow to start ([5eb1d0e](https://github.com/neboki/live/commit/5eb1d0ee0df1e95d197943fef9bc05f1c390a504))
* stop downloading an OpenAI voice clip as soon as it is stopped ([e9c5de8](https://github.com/neboki/live/commit/e9c5de8efbc6ccd85226927d6c34d9d09609009a))
* tell who spoke in a conversation even when the transcriber names no language ([387c127](https://github.com/neboki/live/commit/387c127e82723b15ef34409cd517bb3c64c03cc1))


### Performance Improvements

* close sentences sooner so captions follow the speech ([6e7e93c](https://github.com/neboki/live/commit/6e7e93c21280811153c817a69fd9a0582f57a3b5))
* connect the transcriber while the share dialog is open ([138e76b](https://github.com/neboki/live/commit/138e76b74aebbba8452cb29f8375ce8072fb5e83))
* write the bar size once a resize settles, not on every pointer move ([09e1cd1](https://github.com/neboki/live/commit/09e1cd151123943769334f00fbc943d142df2025))

## [Unreleased]

<!-- Written by hand before the switch to Conventional Commits. release-please adds the 1.0.0
     entry above this section; in that release PR, move these notes into it and delete this heading. -->

### Added

- Realtime transcription over the Realtime API with client-side voice activity detection, so
  sentences close on a pause. Silence between sentences is not sent, so it is not billed (a
  300 ms pre-roll keeps the first syllable); it reconnects on its own after a short drop.
- Room audio: besides a shared tab, a session can listen to the microphone (meeting rooms,
  interviews, conversations, events) or to both mixed (hybrid meetings), with a microphone
  picker and the browser's echo cancellation, noise suppression and gain control on. Without
  the floating window (phones) the captions show in the page and the screen stays on.
- Streaming translation sentence by sentence, with a glossary of names and terms to keep.
- Live summary and reply suggestions in both languages.
- Spoken translation with the browser voice or, optionally, OpenAI text-to-speech.
- Clear error messages for an invalid key, a rate limit, no credit left and lost connections,
  shown inside the caption bar with Dismiss and Restart.
- Export of the current session as Markdown (`neboki-live-YYYY-MM-DD-HHmm.md`).
- Estimated cost of the session, from token and audio usage, OpenAI voice output included.
- Configurable models for transcription, translation, summary and suggestions.
- Consent notice before starting, and a privacy page (`docs/privacy.md`).
- Architecture overview (`docs/architecture.md`).
- Social preview image, theme colour, touch icon and web manifest.
- Releases with release-please; Dependabot for GitHub Actions.
- Repository foundation: community files, commit conventions and git hooks.
- Live audio capture of a shared tab or screen: mono PCM16 at 24 kHz via an AudioWorklet, with the bar's glow following the real voice level.
- Clear messages when sharing is cancelled, no audio is shared or sharing stops.
- Caption bar ported from the prototype: glass look, words that come into focus, glow that follows the voice, spring animations.
- Floating bar above other windows (Document Picture-in-Picture, Chrome/Edge).
- Home page with live preview and API key step (format check, optional remember).
- App skeleton: Vue 3 + Vite + TypeScript, Pinia and English/Spanish UI.
- Quality tooling: ESLint, Stylelint, Prettier, vue-tsc, Vitest and Playwright.
- GitHub Actions for CI and GitHub Pages deployment.

### Changed

- Fonts are self-hosted: no request leaves for Google Fonts.
- Stricter Content Security Policy (only the page itself and `api.openai.com`), checked by an e2e
  test.
- CI pins every action to a commit SHA, audits runtime dependencies and enforces coverage.
- Manual deploys run only from `main`.
- Components are single-file `.vue` components with `<script setup>` and typed props and events
  (ADR 0006); Stylelint now checks their `<style>` blocks.
- Commits follow Conventional Commits, so release-please picks the version and writes this file.
- Development requires Node.js 24; `pnpm install` refuses older versions.
- Corners come from one `--radius-*` scale, enforced by Stylelint.
- Accessibility: e2e tests run axe (WCAG 2.2 AA) on the app in light
  and dark; small coral text and links meet 4.5:1 contrast, links inside text are underlined,
  the resize grip reports its value and the language switch names match their labels.
