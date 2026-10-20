# AI-provider mocking strategy

High-volume load tests **must not** call Anthropic (cost + rate limits + the request
explicitly requires mocked responses for volume). Strivo already has a first-class,
in-process mock — use it rather than a network shim.

## Primary: built-in `AI_TEST_MODE` (recommended)

`supabase/functions/_shared/anthropic.ts` short-circuits every model call when the
target env has `AI_TEST_MODE=true`, returning deterministic per-feature fixtures
(`fixtureKey`: `analyze_resume`, `grade_linkedin`, `ocr`, …). This is the SAME path the
edge tests and E2E use, so it exercises the full lifecycle (merge, persistence, merit
gate, realtime) at near-zero latency and **zero provider cost**.

- **Preview already runs `AI_TEST_MODE`** — nothing to configure for mocked volume there.
- On a throwaway project, set it explicitly:
  `supabase secrets set AI_TEST_MODE=true --project-ref <ref>`

### Fault injection (for workload 12 — provider timeout / rate-limit / overload)

Also backend-native, no real calls, no code change:

| Secret | Effect |
|---|---|
| `AI_FORCE_FAILURE=true` (with `AI_TEST_MODE=true`) | every model call returns `529` (overloaded) |
| `MERIT_TEST_FORCE_REFUNDABLE_ERROR=<status\|true>` (staging) | injects a configurable refundable error |

Set the flag, run `scenarios/12-provider-fault-injection.js`, then **revert the secret**.

```
supabase secrets set AI_TEST_MODE=true AI_FORCE_FAILURE=true --project-ref <ref>
# ... run workload 12 ...
supabase secrets unset AI_FORCE_FAILURE --project-ref <ref>
```

## Secondary: small, capped REAL-provider verification

To anchor the mocked assumptions to reality, run a **tiny** real sample (workload 10,
`MODE=real`) with `AI_TEST_MODE=false` on a throwaway project:

- Hard cap: **$5** (`CAPS.maxRealProviderSpendUsd`). `assertRealSpendUnderCap()` blocks a
  stage whose projected spend exceeds it.
- Keep concurrency at the low rungs (1, 5, 10). Never run the 250/500/1000 rungs against
  the real provider.
- Respect provider rate limits — the per-function limiter (`free 5 / pro 15 / elite 30`
  per hour) and the pooled `ai-analyses-all` 60/hr cap will 429 first anyway.

## Why not a standalone mock server?

A separate HTTP mock would require repointing the edge functions' Anthropic base URL (a
deploy-time change) and would NOT exercise the real fixture-shaped responses the mergers
expect. `AI_TEST_MODE` is strictly better for this codebase. A standalone mock is only
worth building if you need to simulate provider behaviors the built-in injectors don't
cover (e.g. partial streams) — out of scope for this measurement task.
