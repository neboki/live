# 0003 — Quality tiers and what they cost

- **Status:** proposed
- **Date:** 2026-10-20

## Context

Each user runs Neboki Live with their own OpenAI key, so every session is billed to their own
OpenAI account.

Quality matters, but the best tier costs about 13 times more per hour than the cheapest. A
single fixed set of models is either too expensive for long meetings or too weak for important
ones, so users choose the quality per meeting.

Prices are from the [OpenAI pricing page](https://developers.openai.com/api/docs/pricing) and
each model's page, checked on 2026-10-20. They are the same as in
`src/modules/session/pricing.ts`:

| Model                    | Input / 1M | Cached / 1M | Output / 1M | Audio / min |
| ------------------------ | ---------- | ----------- | ----------- | ----------- |
| `gpt-4o-mini-transcribe` | $1.25      | —           | $5          | ~$0.003     |
| `gpt-live-transcribe`    | —          | —           | —           | $0.017      |
| `gpt-6-luna`             | $0.10      | $0.01       | $0.50       | —           |
| `gpt-6.1-sol`            | $2         | $0.10       | $10         | —           |
| `gpt-6-astra` (not used) | $10        | $1          | $50         | —           |
| `gpt-4o-mini-tts`        | $0.60      | —           | $12         | unconfirmed |

These are Standard rates. Fast mode costs 2× (Ultrafast 6×), Batch/Flex 50 %, regional
processing adds 10 %, and above 272K input tokens input doubles and output is 1.5×.

## Decision

### Quality tiers

The app shows them as **Low cost**, **Medium** and **Premium**; low cost is the default.

| Tier     | Speech-to-text           | Translation   | Summary / suggestions | Cost per hour\* |
| -------- | ------------------------ | ------------- | --------------------- | --------------- |
| Low cost | `gpt-4o-mini-transcribe` | `gpt-6-luna`  | `gpt-6-luna`          | ~$0.17          |
| Medium   | `gpt-live-transcribe`    | `gpt-6-luna`  | `gpt-6-luna`          | ~$0.79          |
| Premium  | `gpt-live-transcribe`    | `gpt-6.1-sol` | `gpt-6.1-sol`         | ~$2.15          |

`gpt-6-astra` is not used: at about $6.95 per hour (Standard) it costs five times sol, and no
test has shown that the quality is worth it.

\* One hour of meeting with people speaking 65 % of the time (39 min; 60–70 % moves every figure
by about ±8 %), at 150 words per minute and about 15 words per sentence, so 390 sentences:

- **Speech-to-text.** Silence between sentences is not sent, so billed audio is the speech time
  plus a 0.3 s pre-roll and the 0.5 s closing pause of each sentence: 39 + 5.2 ≈ 44 min.
  `gpt-live-transcribe`: 44 × $0.017 ≈ $0.75. `gpt-4o-mini-transcribe` is billed in tokens; at
  OpenAI's own estimate of $0.003/min it is ≈ $0.13.
- **Text models.** One translation call per sentence (~350 input tokens), a summary every 4
  sentences (~600) and suggestions after the ~10 % of sentences that are questions (~600):
  about 220K input tokens per hour. Output is about 29K tokens with `gpt-6-luna` (reasoning off)
  and about 95K with `gpt-6.1-sol`, which runs at reasoning effort `low`.
  No cache hits are counted: the fixed prompt prefix is shorter than OpenAI's caching minimum.
  That gives luna ≈ $0.04 and sol ≈ $1.40, at Standard rates (the app does not ask for Fast mode).

The app's tier picker shows these figures. Voice output (`gpt-4o-mini-tts`) is optional
and adds about $0.45 per hour, but that figure uses a $0.015/min rate that OpenAI does not
publish (unconfirmed); the browser's free `speechSynthesis` is the default.

`gpt-realtime-translate` ($0.034/min) is not used. The only published comparison we found ranks
its translation fidelity lowest, though that comparison comes from a competing vendor.

## Consequences

- ✅ Users choose between price and quality, so one app covers students and companies.
- ❌ Cost figures depend on OpenAI prices, so they must be reviewed when those prices change.

## To validate before launch

1. ~~Whether `gpt-4o-mini-transcribe` works in the Realtime API.~~ Checked on 2026-10-20 with
   6.5 s of speech: it works and is accurate, and the final text arrives 1.1 s after the audio
   ends (`gpt-live-transcribe`: 0.7 s). But it sends no partial text while people speak; the
   first text appears only after the sentence is committed. Basic keeps it, and its captions
   appear sentence by sentence instead of word by word. It is billed in tokens (64 audio tokens
   for 6.5 s); `gpt-live-transcribe` is billed by duration. OpenAI's model page lists it as
   not supported for transcription sessions, although that check worked. It is also deprecated
   and shuts down on 2027-02-26, so Basic needs a new model before then: `gpt-transcribe`
   ($0.0045/min, Low cost ≈ $0.24/h, no partial text either) or `gpt-live-transcribe` (the same
   as Medium, ≈ $0.79/h).
2. Whether Premium, with `gpt-6.1-sol` at Standard rates, keeps captions in step with the
   speaker. Measured translation latency is in [0004](0004-ultrafast-and-decisions.md): Fast mode
   saves only about 0.2–0.5 s per sentence over HTTP.
3. The real cost of a one-hour meeting in each tier, taken from the OpenAI bill.
4. A blind test of `gpt-6-luna` against `gpt-6.1-sol` on real meetings to check that Premium is
   worth more than twice the cost of Medium.
5. Still unconfirmed: the token counts per call above (measure them from a real meeting), the
   $0.015/min voice-output rate, and whether prompt caching ever applies. `gpt-4o-mini-tts` is
   also deprecated (its snapshots shut down on 2027-01-06; the replacement is
   `gpt-realtime-2.1-mini`, which uses a different API).

## Update (2026-11-03): what shipped

The code (`providers/openai/config.ts`, `session/pricing.ts`) differs from the table above:

- **Low cost** uses `gpt-transcribe` (≈ $0.24/h), not `gpt-4o-mini-transcribe`, which OpenAI
  deprecated (shut-down 2027-02-26). The latter stays in the price table for custom settings;
  its per-minute price applies only when the API reports no tokens.
- An **Interpreter** tier was added on `gpt-realtime-translate` (≈ $2.34/h, the whole hour is
  billed since it hears the silences too), so the "not used" above no longer holds. See
  [ADR 0005](0005-openai-audio-guide.md).
- Prices and the per-hour figures are as of 2026-10-20; the cost shown in the app is an estimate
  and reads "not available" when a model in use has no known price.
