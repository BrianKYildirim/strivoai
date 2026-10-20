---
phase: 27-cutover-safety-net
plan: 01
subsystem: payments / stripe
tags: [stripe, webhook, cutover, safety-net, deprecation, 410, gap-closure]
provides:
  - "supabase/functions/stripe-webhook/index.ts → 410-Gone shim with handleStripeWebhook(req) export"
  - "supabase/functions/stripe-webhook/index.test.ts → 3 Deno tests covering POST/OPTIONS/GET branches"
  - "supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md → forward-pointing deprecation notice"
requires:
  - "supabase/functions/_shared/cors.ts (handleOptionsRequest)"
  - "supabase/functions/_shared/logger.ts (createLogger)"
  - "crypto.randomUUID() (Deno built-in)"
affects:
  - "scripts/run-edge-tests.ps1 (price-resolver test registration removed)"
tech-stack:
  added: []
  patterns:
    - "Blanket-reject deprecation shim — never reads body, never touches DB, logs once with crypto.randomUUID() req_id"
key-files:
  created: []
  modified:
    - "supabase/functions/stripe-webhook/index.ts (was 240 lines Phase 07 handler → 52 lines 410 shim)"
    - "supabase/functions/stripe-webhook/index.test.ts (was 522 lines fixture-driven → 38 lines, 3 Deno tests)"
    - "supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md (was 232 lines Phase 07 deploy notes → 14 lines deprecation notice)"
    - "scripts/run-edge-tests.ps1 (removed stripe-webhook/price-resolver.test.ts registration line)"
  deleted:
    - "supabase/functions/stripe-webhook/price-resolver.ts (orphan — superseded by _shared/price-resolver.ts)"
    - "supabase/functions/stripe-webhook/price-resolver.test.ts (orphan)"
decisions:
  - "Closes Phase 27 SC-1: misrouted Stripe traffic now fails loudly (410 + warn log) instead of silently 200-ignoring."
  - "Shim never reads STRIPE_WEBHOOK_SECRET, never calls req.text()/req.json(), never inserts into stripe_webhook_events (D-01, D-02)."
  - "req_id from crypto.randomUUID() returned in BOTH 410 body and warn log so operators can correlate Stripe delivery dashboard against Supabase logs (D-03, D-04, T-27-04 mitigation)."
  - "D-05(c) warn-log-capture test omitted intentionally per RESEARCH §Test Strategy — visual review covers the hard-coded warn line in this 30-line shim."
metrics:
  duration_seconds: 175
  completed_date: "2026-04-29"
  tasks_completed: 6
  files_modified: 4
  files_deleted: 2
  net_lines_changed: "-1059 (1 added, 1060 removed)"
---

# Phase 27 Plan 01: Stripe Webhook 410-Gone Shim — Summary

Replaced the legacy Phase 07 `stripe-webhook/` handler with a 30-line 410-Gone shim so misrouted Stripe traffic fails loud (HTTP 410 + structured `legacy_endpoint_hit` warn log) instead of silently 200-ignoring. The active webhook lives at `supabase/functions/stripe-webhook-handler/`.

## What Shipped

| Task | Action | Commit |
|------|--------|--------|
| 1 | Cross-import audit (read-only gate, no commit) | — |
| 2 | RED: write 3 Deno tests against the 410 contract (POST 410 / OPTIONS 200 / GET 405) | `79e6fb3` |
| 3 | GREEN: replace 240-line Phase 07 handler with 52-line shim using `handleOptionsRequest` + `createLogger` + `crypto.randomUUID()` | `cd4e582` |
| 4 | Delete orphan `stripe-webhook/price-resolver.ts` and `stripe-webhook/price-resolver.test.ts` | `008ba6f` |
| 5 | Drop deleted-file line from `scripts/run-edge-tests.ps1`; full harness passes (215 tests) | `551c933` |
| 6 | Replace 232-line Phase 07 `DEPLOY_RUNBOOK.md` with 14-line deprecation notice pointing at the active handler and `21-CUTOVER-NOTES.md` | `36a266e` |

## Cross-Import Audit (Task 1)

**Result: clean — orphan deletions safe.**

- `grep -rln "stripe-webhook/price-resolver" supabase/` excluding the directory itself: **zero external matches**. Only intra-directory references in `price-resolver.test.ts` itself (deleted in Task 4) and a documentation comment in `_shared/shop-pack-resolver.test.ts` (a comment, not an import — non-blocking).
- `grep "price-resolver" supabase/functions/stripe-webhook-handler/index.ts` → line 38 imports `resolveTier` from `../_shared/price-resolver.ts` (the shared module — different file, untouched).
- Test helpers `_shared/test-helpers/stripe-fixtures.ts` and `_shared/test-helpers/stripe-signature.ts` are referenced by `stripe-webhook-handler/index.test.ts`, `_tests/test-04-*`, `_tests/test-05-*`, `_tests/test-06-*` — preserved untouched.

## Confirmation: Survived Files

| File | Status |
|------|--------|
| `supabase/functions/_shared/price-resolver.ts` | Intact (active handler depends on it) |
| `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` | Intact |
| `supabase/functions/_shared/test-helpers/stripe-signature.ts` | Intact |
| `supabase/functions/stripe-webhook-handler/index.ts` | Intact (active handler) |
| `supabase/functions/stripe-webhook-handler/index.test.ts` | Intact |

## `run-edge-tests.ps1` Registration Delta

```diff
   _shared/merit-gateway.raw.test.ts `
-  stripe-webhook/price-resolver.test.ts `
   stripe-webhook/index.test.ts `
   create-checkout-session/index.test.ts `
```

`stripe-webhook/index.test.ts` line preserved — new shim tests slot in transparently at the same path.

## Test Pass/Fail Summary

Final `scripts/run-edge-tests.ps1` run: **215 passed | 0 failed (~10s)**. Tier-validation harness skipped (requires `RUN_TIER_VALIDATION=1`).

Shim tests visible in harness output:

```
running 3 tests from ./stripe-webhook/index.test.ts
legacy webhook shim: POST returns 410 with deprecation body ... ok
legacy webhook shim: OPTIONS returns 200 ... ok
legacy webhook shim: GET returns 405 method_not_allowed ... ok
```

## Threat Model Verification

| Threat ID | Mitigation status |
|-----------|-------------------|
| T-27-01 (body-parse DoS) | Mitigated — `grep "req\\.text\\|req\\.json"` on shim returns zero matches |
| T-27-02 (secret in logs) | Mitigated — shim never references `STRIPE_WEBHOOK_SECRET`; logged fields are server-generated `req_id`, client `user-agent`, and `sig_present` boolean only |
| T-27-03 (warn flood) | Accepted — Supabase platform rate limiting at edge; one log line per request, no DB writes |
| T-27-04 (no audit trail) | Mitigated — `req_id` from `crypto.randomUUID()` returned in both 410 response body AND warn log |
| T-27-05 (unauth surface) | Accepted — `verify_jwt = false` already set in `supabase/config.toml:93`; shim has no auth surface |

## Acceptance Criteria Note (Task 3)

The plan's grep-based acceptance criterion in Task 3 says shim file must have **zero matches** for `STRIPE_WEBHOOK_SECRET\|getStripeClient\|...\|req.text\|req.json`. Strictly, the file's docstring includes two negative references in comments documenting the D-01/D-02 decisions ("No signature verify, no STRIPE_WEBHOOK_SECRET read", "no stripe_webhook_events insert"). The intent of the criterion (no executable code touches Phase 07 surface) is fully satisfied — these are documentation strings inside a `/** ... */` block, not imports or runtime references. The file content is byte-for-byte the planner-supplied `<action>` block.

## Deviations from Plan

None. Plan executed exactly as written, including the planner-marked variance from D-05(c) (warn-log capture intentionally omitted per RESEARCH §Test Strategy).

## Self-Check: PASSED

- [x] `supabase/functions/stripe-webhook/index.ts` exists, 52 lines, exports `handleStripeWebhook`
- [x] `supabase/functions/stripe-webhook/index.test.ts` exists, 3 Deno tests
- [x] `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md` exists, 14 lines, contains DEPRECATED + stripe-webhook-handler + 21-CUTOVER-NOTES.md
- [x] `supabase/functions/stripe-webhook/price-resolver.ts` does NOT exist (deleted)
- [x] `supabase/functions/stripe-webhook/price-resolver.test.ts` does NOT exist (deleted)
- [x] `supabase/functions/_shared/price-resolver.ts` still exists
- [x] `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` still exists
- [x] `supabase/functions/_shared/test-helpers/stripe-signature.ts` still exists
- [x] Commit `79e6fb3` (test RED) found in git log
- [x] Commit `cd4e582` (feat GREEN) found in git log
- [x] Commit `008ba6f` (chore deletes) found in git log
- [x] Commit `551c933` (chore harness) found in git log
- [x] Commit `36a266e` (docs runbook) found in git log
- [x] Full edge-test harness passes (215/215)

## TDD Gate Compliance

- RED commit `79e6fb3` (`test(27-01): ...`) — failing tests committed before implementation
- GREEN commit `cd4e582` (`feat(27-01): ...`) — implementation committed after RED
- No REFACTOR commit needed (52-line shim already at minimum surface area)
