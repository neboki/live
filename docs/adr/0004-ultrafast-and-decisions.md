# 0004 — Ultrafast mode for translation, Decisions API for triggers

- **Status:** proposed
- **Date:** 2026-10-20
- **Related:** [0002](0002-openai-single-provider.md) (provider), [0003](0003-pricing-and-model-tiers.md) (tier costs, including Fast mode)

## Context

Caption latency is the main quality factor: a translation that arrives after the speaker has moved
on is useless. [0002](0002-openai-single-provider.md) uses streaming Chat Completions for
translation, summary and suggestions, and waits for a pause in speech before translating.

OpenAI now offers two features that address this:

- **Ultrafast mode** — the fastest service tier of the Responses API, for `gpt-6.1-sol` and
  `gpt-6-astra`. Best used over a persistent WebSocket. Higher price and separate rate limits.
- **Decisions API** (public beta) — `POST /v1/decisions` returns probabilities, choices or scores
  for questions about text or images. About 10x faster than the Responses API, $0.10 per 1M input
  tokens, no output cost. Only `gpt-6-luna` for now.

## Decision

1. **Translation** moves from Chat Completions to the Responses API, behind `LlmProvider`.
   - One WebSocket per session; each sentence is a `response.create` that chains
     `previous_response_id`, so the glossary and context are not resent.
   - `service_tier: "ultrafast"` with `gpt-6.1-sol` is an opt-in **Fast mode** setting, off by
     default, because the user pays with their own key.
2. **Decisions API** decides _when_ to call the LLM, never _what_ it says:
   - _Sentence complete?_ (predicate) — translate a partial transcript before the pause.
   - _Question addressed to the listener?_ (predicate) — show reply suggestions only then.
   - _Topic changed?_ (predicate) — refresh the summary only then.
   - Every trigger falls back to the current pause/timer behaviour if the call fails or is refused.
   - Thresholds are tuned against labelled samples from the demo scenarios before shipping.

## Measured on 2026-10-20

Measured with a real key, over a few runs each, so treat the numbers as rough.

- **Browser auth over WebSocket: not possible.** `wss://api.openai.com/v1/responses` accepts an
  `Authorization` header but rejects the `openai-insecure-api-key.<key>` subprotocol that
  Realtime accepts (the handshake fails with no 101 response). Fast mode therefore uses HTTP
  (`service_tier: "ultrafast"` on `POST /v1/responses`), which works from the browser: CORS allows
  any origin with `authorization` and `content-type`. The WebSocket needs a backend.
- **Ultrafast gain over HTTP is small.** One translated sentence, full response time:

  | Model                      | Default   | Ultrafast |
  | -------------------------- | --------- | --------- |
  | `gpt-6-luna` (effort none) | 1.6–2.8 s | —         |
  | `gpt-6.1-sol` (effort low) | 1.8–2.5 s | 1.5–1.7 s |
  | `gpt-6-astra` (effort low) | 1.4–1.8 s | 1.2–1.4 s |

- **`gpt-6.1-sol` and `gpt-6-astra` reject `reasoning_effort: "none"`**; `low` is the minimum and
  used no reasoning tokens in the tests.
- **CORS for `/v1/decisions` works** (any origin, `authorization`, `content-type`). Body:
  `{ model, input, questions: [{ type: "predicate", name, instructions }] }`; the answer is
  `answers[].probability`. About 290 ms with a warm connection (1.4–2 s cold), ~320 input
  tokens for two predicates.
- First thresholds: "Is this a complete sentence?" gave 0.96 for a full question and 0.40 for
  "So what do you think about the", so a threshold around 0.8 looks reasonable before tuning.
- Decisions API is in beta: its model and contract can still change.

## Consequences

- ✅ Lower caption latency: earlier translation trigger plus a faster tier for those who want it.
- ✅ Fewer LLM calls for suggestions and summary, which lowers the user's bill.
- ❌ Three OpenAI APIs (Realtime, Responses, Decisions) instead of two.
- ❌ Fast mode costs more; the setting must say so.
- ❌ Depends on a beta API; the fallbacks keep the app working without it.
