# Security Policy

## Supported versions

Only the latest release (the version deployed on https://neboki-live.web.app) receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's
[private vulnerability reporting](../../security/advisories/new) instead.

You can expect an acknowledgement within 7 days and a fix or mitigation plan within 30 days.

## How Neboki Live handles your data

- **API key** — kept in the browser's `localStorage` unless you untick "Remember on this
  device"; then it lives in memory and disappears when you close the tab. It is sent only to
  `api.openai.com` or, if you chose Azure OpenAI, only to the resource endpoint you entered
  (an Azure key never falls back to `api.openai.com`). Use **Forget key** to delete it at any
  time.
- **Audio and text** — streamed directly from your browser to OpenAI. There is no Neboki Live
  server, analytics or telemetry. See [docs/privacy.md](docs/privacy.md) for the full list.
- **No other third parties** — fonts are self-hosted, so loading the page contacts nobody but
  Firebase Hosting, which serves it.

Tip: create a dedicated OpenAI key with a spending limit for this app.

## Accepted risk: the key on the WebSocket

Browsers cannot set an `Authorization` header on a WebSocket, so the key travels another way:

| Call                               | OpenAI                                                  | Azure OpenAI              |
| ---------------------------------- | ------------------------------------------------------- | ------------------------- |
| HTTP (chat, TTS, key check)        | `Authorization: Bearer` header                          | `api-key` header          |
| Realtime WebSocket (transcription) | `Sec-WebSocket-Protocol: openai-insecure-api-key.<key>` | `api-key` query parameter |
| Realtime WebSocket (interpreter)   | same subprotocol                                        | not offered by Azure      |

The subprotocol is what OpenAI documents for browser clients. On Azure the key is in the socket
URL, which is what Azure documents; the browser may then print that URL in the console if the
connection fails, so this is a risk you accept by choosing Azure.

- Every connection is TLS (`https://` / `wss://`), so the key is not visible on the network.
- On OpenAI the key never appears in a URL. It never appears in logs or error messages: every
  message from the server is passed through `redactKey` with the key itself, and a key that a
  subprotocol can't carry is rejected before the browser could echo it.
- There is no ephemeral token, because issuing one needs a server, and Neboki Live has none
  ([ADR 0001](docs/adr/0001-static-web-app.md)). Each user brings their own key, so a leak only
  exposes that user's own account. A hosted plan would mint short-lived tokens instead
  ([ADR 0003](docs/adr/0003-pricing-and-model-tiers.md)).
- Like any key used in a browser, it is readable by code running in the page. The CSP below and
  the absence of third-party scripts limit what could run there.

## Content Security Policy

The app (`index.html`) sets the policy below.

| Directive                    | Value                                                                         | Why                                            |
| ---------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| `default-src`                | `'self'`                                                                      | Nothing from other origins by default          |
| `script-src`                 | `'self'`                                                                      | Only the app's own bundles and the worklet     |
| `style-src`                  | `'self' 'unsafe-inline'`                                                      | Vue style bindings and the floating window     |
| `font-src`                   | `'self'`                                                                      | Self-hosted Geist fonts                        |
| `connect-src`                | `'self'`, `api.openai.com` and the Azure OpenAI hosts\* (`https:` and `wss:`) | OpenAI, or your own Azure resource             |
| `media-src`                  | `'self' blob:`                                                                | The shared tab shown behind time (MediaSource) |
| `worker-src`                 | `'self'`                                                                      | No foreign workers                             |
| `img-src`                    | `'self' data:`                                                                | Icons                                          |
| `object-src` / `form-action` | `'none'`                                                                      | No plugins, no form posts                      |
| `base-uri`                   | `'self'`                                                                      | No base-tag hijacking                          |

\* `*.openai.azure.com`, `*.cognitiveservices.azure.com` and `*.services.ai.azure.com`, the
hosts Azure gives OpenAI resources; `endpoint.ts` accepts exactly these and nothing else.

`tests/e2e/csp.spec.ts` fails the build on any violation, on a different `connect-src`, or on a
request to an origin other than the page and `api.openai.com`.

A `<meta>` policy cannot set `frame-ancestors` and Firebase Hosting sends no `X-Frame-Options`, so
the page can be framed by another site. Nothing in the page acts on messages from a parent frame
and the key lives in the app origin's `localStorage`, which no other origin can read, so framing
alone gains an attacker nothing; it is noted here rather than mitigated.
