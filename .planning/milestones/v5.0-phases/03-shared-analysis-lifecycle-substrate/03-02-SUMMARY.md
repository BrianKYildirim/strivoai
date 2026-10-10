---
phase: 03-shared-analysis-lifecycle-substrate
plan: 02
subsystem: payments
tags: [idempotency, merit, sha-256, crypto-subtle, deno, deduplication, deriveIdempotencyKey]

# Dependency graph
requires:
  - phase: 02-security-audit-remediation
    provides: "02-05 Fix 1 — withMerits forwards ctx.idempotencyKey ?? null to the 4-arg check_and_deduct_merits RPC (the seam this plan derives INTO)"
provides:
  - "deriveIdempotencyKey(parts): Promise<string> — server-side canonical SHA-256 intent hash (D-02) in _shared/idempotency-key.ts"
  - "IdempotencyKeyParts contract: { userId, feature, tier, inputIdentity, attemptNonce }"
  - "Gated-remote proof that a DERIVED key threaded through withMerits deducts exactly once end-to-end (LIFE-05, Pitfall 1 closed)"
affects: [04-feature-migration-recruiting-lens-linkedin, 05-feature-migration-resume-onboarding, 06-feature-migration-career-compass]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-derived idempotency key (never client-trusted, D-02) via crypto.subtle SHA-256 over sorted-key JSON (A1)"
    - "inputIdentity is an opaque caller-supplied string — derivation reads no DB/save state, so a save-mutated field cannot leak into the key (Pitfall 8 / D-06)"

key-files:
  created:
    - "supabase/functions/_shared/idempotency-key.ts"
    - "supabase/functions/_shared/idempotency-key.test.ts"
  modified:
    - "supabase/functions/_shared/merit-gateway.idempotency-forward.test.ts"
    - "supabase/functions/deno.json"

key-decisions:
  - "A1 locked: SHA-256 via crypto.subtle over a sorted-key JSON serialization of the 5 intent parts → lowercase hex (64 chars). Sorting keys makes equality order-independent."
  - "idempotency-key.ts is self-contained pure-crypto (no reuse of cache-fingerprint.sha256Hex) to keep the derivation contract decoupled from the cache-key contract."
  - "IdempotencyKeyParts.tier typed as string (not the 'free'|'pro'|'elite' union) so the derivation stays a generic contract; callers pass their own tier."

patterns-established:
  - "Derive-into-wired-seam: Phase 3 derives + threads the key; it does NOT re-plumb merit-gateway.ts (unchanged this plan)."
  - "attemptNonce controls new-run vs replay: same nonce → same key (accidental resubmit → already_deducted); fresh nonce → new key (deliberate new run)."

requirements-completed: [LIFE-05]

# Metrics
duration: 5min
completed: 2026-07-02
---

# Phase 3 Plan 02: Edge Idempotency-Key Derivation Summary

**`deriveIdempotencyKey` — a server-side canonical SHA-256 intent hash (sorted-key JSON of user+feature+tier+inputIdentity+attemptNonce) that threads into the already-wired `withMerits` forward so a repeated intent deducts exactly once (LIFE-05).**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-02T12:57:15Z
- **Completed:** 2026-07-02T13:00:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- New pure-crypto module `_shared/idempotency-key.ts` exporting `IdempotencyKeyParts` + `deriveIdempotencyKey` — `crypto.subtle` SHA-256 over a sorted-key canonical serialization → lowercase 64-char hex (A1).
- 10 unit tests proving determinism, order-independence, attempt-nonce sensitivity, per-field sensitivity, and the opaque-inputIdentity / no-save-state guarantee (Pitfall 8 / D-06).
- Extended the gated-remote idempotency-forward twin with a LIFE-05 test: a DERIVED key threaded through `withMerits` twice (same re-derived key) yields exactly one feature-deduct row + one balance deduction end-to-end (Pitfall 1 closed).
- Both new tests registered in `deno.json` `test:ci` so they enter `verify:baseline`; the runtime one-deduction assertion is gated-remote (SKIPs offline).

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing test for deriveIdempotencyKey** - `3f8c2385` (test)
2. **Task 1 (GREEN): deriveIdempotencyKey implementation** - `c59db6bb` (feat)
3. **Task 2: derived-key one-deduction extension + test:ci registration** - `26eace2c` (test)

_TDD Task 1 = RED (`3f8c2385`) → GREEN (`c59db6bb`); no refactor commit needed (implementation was clean)._

## Files Created/Modified
- `supabase/functions/_shared/idempotency-key.ts` - `deriveIdempotencyKey` + `IdempotencyKeyParts`; canonical sorted-key SHA-256 hex derivation, server-derived-only + opaque-inputIdentity doc contract.
- `supabase/functions/_shared/idempotency-key.test.ts` - 10 unit tests for the derivation contract.
- `supabase/functions/_shared/merit-gateway.idempotency-forward.test.ts` - added the LIFE-05 gated-remote test proving a DERIVED repeated key deducts once end-to-end.
- `supabase/functions/deno.json` - registered `_shared/idempotency-key.test.ts` in `test:ci`.

## Decisions Made
- **Hash/serialization (A1):** SHA-256 via `crypto.subtle.digest` over `JSON.stringify` of the 5 parts with sorted keys → lowercase hex. Sorted keys guarantee order-independence; hex output matches the codebase convention (`cache-fingerprint.sha256Hex`).
- **IdempotencyKeyParts shape:** `{ userId, feature, tier, inputIdentity, attemptNonce }` — all strings; `tier` kept as `string` (not the tier union) so the module stays a generic contract.
- **Self-contained crypto:** did NOT reuse `cache-fingerprint.sha256Hex` — the idempotency-key derivation is a distinct contract and staying decoupled avoids cross-coupling two independent hash surfaces.
- **merit-gateway.ts unchanged:** the forward was wired in 02-05; this plan only derives + threads the key. `git diff --name-only` confirms no gateway modification.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. RED failed as expected (module-not-found), GREEN passed all 10 unit tests first try, the extended twin passed offline with both gated tests SKIPping cleanly.

## Gated-Remote One-Deduction Result
Offline: all 16 tests in the idempotency-forward file pass; both gated-remote tests (the raw-key twin and the new derived-key LIFE-05 test) SKIP cleanly with the `DENO_TEST_SUPABASE_REMOTE` unset log. The live one-deduction assertion (derived key → exactly one `feature-deduct` row, balance = STARTING_BALANCE − TEST_COST) is proven when the operator runs with `DENO_TEST_SUPABASE_REMOTE=1` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` against staging — same fixture/harness as the proven 02-05 twin.

## User Setup Required
None - no external service configuration required. (Live gated-remote verification is an optional operator run against staging, not a setup requirement.)

## Next Phase Readiness
- The idempotency-key derivation contract is ready for Phases 4/5/6 to consume: each feature supplies its own stable `inputIdentity` (content-hash / latest-input id) and a fresh-on-new-run `attemptNonce`, then sets `ctx.idempotencyKey = await deriveIdempotencyKey(...)`.
- No blockers. The substrate defines the CONTRACT + shape only; per-feature `inputIdentity` wiring is downstream (Ph4/5/6).

## Self-Check: PASSED

All 4 files verified present; all 3 task commits (`3f8c2385`, `c59db6bb`, `26eace2c`) verified in git history.

---
*Phase: 03-shared-analysis-lifecycle-substrate*
*Completed: 2026-07-02*
