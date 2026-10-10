# Quick Task 260713-2ay — Runtime Verification (post-deploy investigation)

**Date:** 2026-07-13
**Trigger:** User reported the live test STILL required a second Analyze click after deploying.
**Verdict:** The fix is CORRECT and PROVEN at runtime against a real Anthropic call.
The failure was a **rollout gap**, not a code defect.

---

## 1. What the user actually tested

The clicks hit **production** (`zjpjapgraoxdukdvpjes`), which had **not** received the fix.

Production `merit_transactions` for the reported test:

| time (UTC) | event | idempotency_key |
|---|---|---|
| 21:44:04 | deduct −3 (click 1) | **NULL** |
| 21:44:54 | **refund +3** — **50.4s** later | NULL |
| 21:45:06 | deduct −3 (click 2) | NULL |
| 21:45:52 | grade row created | — |

**50.4s** is the old `free.core = 50_000` timeout wall, and a `NULL` idempotency key is a
definitive fingerprint of the pre-fix function (the new code always sets one when the client
supplies a nonce). Production was running old code. The bug reproduced exactly as before.

## 2. Deployment state at time of the report

| Surface | Source of truth | Had the fix? |
|---|---|---|
| Supabase edge — preview/staging (`cimjlt…`) | manual `deploy.ps1 -Env staging` | **YES** (v196 — verified by grepping the *deployed* bytes: `LINKEDIN_TOTAL_DEADLINE_MS`, `deadlineAt`, `ai-retry`, `isRetryableAiStatus`, `idempotencyKey` present; `timeoutMs: 60000` and the old retry guard absent) |
| Vercel frontend — Preview | `preview` branch | **YES** (staging merged to preview via PR #582) |
| Supabase edge — **production** (`zjpja…`) | manual `deploy.ps1 -Env production` | **NO** — never run |
| Vercel frontend — **Production** | `main` branch | **NO** — `main` was 5h stale (pre-fix) |

`scripts/deploy.ps1` only runs `supabase functions deploy`. **It does not deploy the frontend.**
`vercel.json`'s `ignoreCommand` builds **only** the `main` and `preview` branches — the `staging`
branch is never built by Vercel at all.

## 3. ⚠️ Staging is STRUCTURALLY INCAPABLE of validating this fix

Preview edge config, recovered from the (hashed) secret list:

| flag | staging | production |
|---|---|---|
| `AI_TEST_MODE` | **`true`** | unset |
| `MERIT_SYSTEM_ENABLED` | **`false`** | `true` |

Consequences, both independently fatal to a staging test of this bug:

1. **`AI_TEST_MODE=true`** makes `invokeAnthropicText` return a canned fixture at
   `_shared/anthropic.ts:571-573`, **before any network call**. There is no real model call, so
   there is no 50s timeout, no `AbortError`, no `408` — **the entire code path this fix touches
   never executes on staging.**
2. **`MERIT_SYSTEM_ENABLED=false`** routes staging down the **legacy** branch
   (`grade-linkedin/index.ts:682+`), so `withMerits`, the idempotency key and the cache
   precheck never run there either.

**A green staging test proves nothing about this class of bug.** This is a systemic gap and is a
large part of why the defect reached production undetected. Recorded as **LIN-DEF-05**.

*Evidence:* a first probe against staging returned `rawScore: 62` and the string *"solid technical
breadth and a quantified internship"* — for a submitted profile of a 15-year Staff Engineer with no
internship. That is verbatim the hardcoded mock at `_shared/anthropic.ts:259-260`.

## 4. Real-model runtime proof (the actual verification)

With the user's explicit approval, preview was **temporarily** set to production-equivalent config
(`AI_TEST_MODE=false`, `MERIT_SYSTEM_ENABLED=true`), `grade-linkedin` redeployed to force a fresh
isolate (both flags are read at module scope / cold-start cached), then **one single request** was
issued — the exact payload the page sends on one Analyze click. Both flags were **restored
immediately afterwards and the restore was verified**.

### Click 1 — one request, real Claude call

```
POST /functions/v1/grade-linkedin   { profileData: {...}, attemptNonce }

HTTP status : 200
duration    : 43.6s
overallScore: 92          (a real grade — not the 62 mock)
```

Ledger:

| time (UTC) | event |
|---|---|
| 22:09:38 | `feature-deduct` −3, **idempotency_key = e30afe32a7…** (set — D2 fix live) |
| 22:10:15 | **grade row created**, score 92 |
| 22:10:17 | cache write |
| — | **no refund** |

**43.6s against the old 50s wall** — this is the smoking gun for the root cause. The workload
genuinely lands a hair under the old timeout, which is exactly why it was a coin flip. Under the
new 90s per-call budget it has real headroom.

### Click 2 — replay of the IDENTICAL attemptNonce (double-charge probe)

```
HTTP status : 200
duration    : 4.2s        (vs 43.6s -> short-circuited, NO new model call)
score       : 92          (identical)
```

Final state after **two** requests:

| metric | value |
|---|---|
| grade rows | **1** |
| merit deducts | **1** |
| merits charged | **3** (exactly once) |
| refunds | **0** |
| cache hits | 2 |

### Acceptance test — all 7 criteria PASS on the real path

| # | Criterion | Result |
|---|---|---|
| 1 | Upload a valid profile | ✅ |
| 2 | Click Analyze once | ✅ one request |
| 3 | Analysis completes and opens | ✅ HTTP 200, grade returned + persisted |
| 4 | No server-error toast | ✅ no error, no refund |
| 5 | Merits charged exactly once | ✅ 1 deduct, 3 merits |
| 6 | Only one analysis run created | ✅ 1 grade row |
| 7 | No second click required | ✅ |

## 5. ⚠️ ROLLOUT ORDER IS LOAD-BEARING

**Do NOT deploy the edge functions to production on their own.**

The new server budget is **165s**. The frontend currently live in production still aborts at
**120s** with no recovery logic. That combination is **worse than the current bug**:

> client abandons at 120s -> server completes at ~140s -> merit charged, grade saved, cache
> written -> user sees a **false** "your Merits were refunded" error and **never sees the grade**.

The frontend change is **safe against the old backend** (a longer client budget simply waits; the
old server still fails honestly at 50s and refunds, and the recovery check finds no grade and
surfaces an honest error). So the safe order is **frontend first, backend second** — or both
together.

### Required rollout

1. Merge `preview` -> `main` (PR). Vercel Production rebuilds -> 180s client budget + landed-grade
   recovery + honest refund copy.
2. Then, on the Windows box: `.\scripts\deploy.ps1 -Env production`
3. Verify against production's own ledger: one deduct with a **non-NULL** idempotency key, one
   grade row, **zero** refunds, and no ~50s deduct→refund pair.

## 6. Deferred / follow-ups

- **LIN-DEF-05 (new, important)** — staging cannot exercise real AI paths (`AI_TEST_MODE=true`) and
  runs a different merit branch (`MERIT_SYSTEM_ENABLED=false`) than production. Any bug in AI
  timeout/retry/merit handling is **invisible** to staging. Decide deliberately whether staging
  should mirror production config (costs real Anthropic spend) or whether a separate
  real-model smoke lane is added before production deploys.
- **Probe residue** — two synthetic users remain on the **preview** project
  (`3da33d0a-…`, `1b77858a-…`) with one grade row + merit rows each. The Supabase auth admin
  DELETE returns 500 (cascade issue — the reason `admin-delete-user` exists as a function) and the
  preview MCP SQL endpoint is read-only. Harmless test data on a test project; clean up via the
  `admin-delete-user` function if desired.
