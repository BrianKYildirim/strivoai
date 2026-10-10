# Quick Task 260723-2b0 — Merit Idempotency Hotfix (Tasks 5, 7, 7b) Summary

**Scope:** A standalone hotfix carving Tasks 5, 7, and 7b out of the full
`260723-2b0` Elite-rerun plan. These three fix TWO live production defects on the
merit money path that are independent of the Elite-rerun feature. Tasks 1-4, 6, 8-12
were NOT executed and remain for the feature branch.

**Branch:** `by/ak-merit-idempotency-hotfix` (forked from `staging`). No push, no
merge — as instructed.

**One-liner:** Threaded the per-attempt idempotency nonce through the resume streaming
path (closing a per-retry double-charge), pinned the `check_and_deduct_merits`
idempotency contract against live Postgres, and made the RPC refund-aware — closing a
free-replay-after-refund hole and a split-deduction 500-outage, both proven fixed
against preview.

**Commits (this branch, oldest first):**

| Task | Commit    | Message |
| ---- | --------- | ------- |
| 5    | `dc98c572` | `fix(260723-2b0): thread attemptNonce through the resume streaming path` |
| 7    | `c3e73d34` | `test(260723-2b0): pin check_and_deduct_merits idempotency against live Postgres` |
| 7b   | `b0e7ec3a` | `fix(260723-2b0): make check_and_deduct_merits refund-aware (D-7, money path)` |

Parent at fork: `75c25412 fix(resume): bound onboarding retries before refund`.

---

## Task 5 — thread `attemptNonce` through `useResumeStream`

**What changed**
- `src/hooks/useResumeStream.ts`: declared `attemptNonce?: string` on `StreamParams`
  (optional for back-compat with pre-existing `stream_params_*` payloads) and forwarded
  `params.attemptNonce` in the `analyze-resume` streaming request body.
- Added `src/hooks/__tests__/useResumeStream.nonce.test.ts` — behavioral mocked-`fetch`
  guards that read the actual posted JSON body (not source greps).

**Defect fixed:** `Upload.tsx:217` minted a fresh nonce per submit into `sessionStorage`,
but the hook never forwarded it, so `analyze-resume/index.ts:1517-1519` fell back to
`crypto.randomUUID()` server-side on every request. Every retry of the same attempt
derived a different idempotency key and charged again — the identical shape as the
CareerCompass production incident pinned in `CareerCompass.recovery.test.tsx:47-59`.

**Verification actually run:**
- `npx vitest run src/hooks/__tests__/useResumeStream.nonce.test.ts` — demonstrated RED
  first (2 of 3 cases failed on `undefined` before the fix), GREEN after (3 passed).
- `src/test/coverage/ver02-matrix.test.ts` + `src/pages/__tests__/Upload.recovery.test.tsx`
  — 11 passed.
- `npm run type-check` — clean.
- Full `npm run test` — see below.

**Deviations:** none. No lease invalidation added here (that is Task 8, out of scope).

---

## Task 7 — remote idempotency contract test against live Postgres

**What changed**
- Added `supabase/functions/_shared/__tests__/merit-idempotency.remote.test.ts` — a
  remote-lane Deno suite calling `check_and_deduct_merits` directly with a service-role
  client, fresh user + exact seeded balances per case, cascade cleanup.
- Registered it in `supabase/functions/deno.json` `test:remote`; excluded it from the
  Vitest include glob in `vitest.config.ts` (Deno-only lane).

**Cases (final state — 4):** (1) same key twice → one charge, one row, same handle;
(2) distinct keys → two charges; (3) 5× concurrent same key → one charge, one row (the
only exercise anywhere of the `unique_violation` race absorber); (4) NULL keys → NOT
deduplicated.

**Case 5 (split-deduction characterization) — executed, observed, then retired.**
As written it pinned the PRE-FIX D-7b behavior and it ran GREEN against preview,
confirming the diagnosis exactly:

> `already_deducted === true`, `transaction_id === null`, **ZERO** `merit_transactions`
> rows for the key, balances unchanged.

Zero rows is the signature of the second leg's 23505 aborting the `BEGIN…EXCEPTION`
subtransaction and discarding the first leg with it — the corrupt success-with-null that
`merit-gateway.ts:256-263` turns into `500 merit_system_error`. Because Task 7b then
fixes that defect, an assertion pinning the broken shape necessarily goes RED after 7b
lands (it did, by design). Case 5 was therefore **retired** after serving its purpose;
its file header records the observation in full, and the permanent guard for the
corrected behavior lives in `merit-refund-replay.remote.test.ts` case 4. This matches the
plan's own instruction that Task 7's pre-fix cases "assert behavior this migration must
not change" only for cases 1-4.

**Refund/replay pre-fix observation (run by hand per the plan, not committed as an
assertion).** A temporary probe against preview confirmed BUG 1 live before Task 7b:

```
deduct(K)        -> transaction_id T,         balance 30 -> 27
refund_merits(T) -> success,                  balance 27 -> 30
deduct(K) AGAIN  -> already_deducted:true, T, balance 30 -> 30   # FREE RUN
```

The ledger showed the deduction leg and refund leg sharing `metadata.deduction_id`,
which also validated the migration's backfill correlation key. Probe deleted after use.

**Verification actually run:** `npm run test:edge:remote` against preview — all 5 original
cases passed, repeated cleanly (see repeatability note below).

**Deviations:** Case 5 retired after Task 7b (documented above) — a planned consequence
of running 7 before 7b, handled exactly as the plan's ordering note anticipated.

---

## Task 7b — refund-aware `check_and_deduct_merits` migration (D-7, money path)

**What changed**
- Added `supabase/migrations/20260723000002_merit_refund_aware_idempotency.sql`:
  - **Section 1** backfills `metadata.refunded_at` onto historical `feature-deduct` rows
    that already have a matching `refund` row (idempotent; guarded on `refunded_at IS
    NULL`).
  - **Section 2** replaces the index: `UNIQUE (idempotency_key, balance_type) WHERE
    source='feature-deduct' AND idempotency_key IS NOT NULL AND metadata->>'refunded_at'
    IS NULL`, create-then-drop in one transaction (never an unprotected window).
  - **Section 3** `refund_merits` — verbatim body + ONE added `UPDATE` that stamps
    `refunded_at` on the reversed legs. Guard, balance restore, return shape unchanged.
  - **Section 4** 4-arg `check_and_deduct_merits` — verbatim body; both lookup sites gain
    `AND metadata->>'refunded_at' IS NULL` + `ORDER BY created_at DESC`. The
    `unique_violation` arm additionally falls back to an unfiltered lookup and `RAISE`s
    rather than ever returning a null handle (closes the new race window the filter
    creates).
  - **Section 5** `DO $$` verification block (index predicate carries both `refunded_at`
    and `balance_type`; old index gone; 4-arg fn present + `SECURITY DEFINER` + references
    `refunded_at`; `refund_merits` stamps).
  - Header carries the full **gated rollback** procedure: R0 mandatory duplicate
    pre-flight, the two operator paths (safe partial vs full), create-then-drop R2/R3
    ordering, and the named accepted rollback debt.
- Added `supabase/functions/_shared/__tests__/merit-refund-replay.remote.test.ts` — 5
  cases, both directions, with a shared `assertNeverSuccessWithNullHandle` guard applied
  to every RPC response.
- Registered in `deno.json` `test:remote`; excluded from the Vitest glob.

**Blast-radius check (plan-mandated):** ran
`rg -n "idempotency_key|merit_transactions_idempotency" --glob '!*.md' supabase/ src/ scripts/`.
Nothing queries the OLD index by name. The two gated remote tests that assume "exactly one
`feature-deduct` row per key" (`merit-idempotency.test.ts`, `merit-gateway.idempotency-forward.test.ts`)
are both `DENO_TEST_SUPABASE_REMOTE` opt-in and skip in CI, and their assumption still
holds for the no-refund case they exercise. `analysis_jobs.idempotency_key` and
`create_or_recover_analysis_run` are a SEPARATE index/namespace and untouched.
`src/hooks/useIdempotencyKey.ts` is vestigial (unchanged).

**Migration DEPLOYMENT STATUS — explicit:**
- **PREVIEW (`cimjltzovkahkqecpwgi`): APPLIED.** Applied via the Supabase Management API
  `database/query` endpoint (the CLI was linked to preview but had a second unrelated
  pending migration; scoping to this file only was safer than `migration up`). Verified
  post-apply: the new `(idempotency_key, balance_type) … WHERE … refunded_at IS NULL`
  index exists, the old `merit_transactions_idempotency_key_unique` is gone, both RPCs
  reference `refunded_at`, and **78** historical rows were backfilled. Re-applied once —
  0 additional rows backfilled (idempotent). The migration ledger row
  (`supabase_migrations.schema_migrations` `20260723000002`) was stamped so a future
  `migration up` is consistent.
- **PRODUCTION (`zjpjapgraoxdukdvpjes`): NOT APPLIED.** This is a money-path change and
  CLAUDE.md requires explicit operator approval for production migrations. Left for the
  operator. The gated rollback (R0 first) is in the migration header.

**Verification actually run:**
- `npm run test:edge:remote` against preview — **17 passed / 0 failed** on a clean run
  (5 history-persistence + 4 Task 7 + 5 Task 7b + 3 preflight), and repeated cleanly
  multiple times. Task 7's cases 1-4 stay green after the migration (behavior it must not
  change); Task 7b's 5 cases prove: no-refund replay still charges once; deduct→refund→
  replay charges AGAIN (two rows, one retired one live); concurrent same-key still
  collapses; split deduction now charges the FULL cost with both legs committed; refund
  still idempotent.
- Rollback R0 pre-flight (`SELECT idempotency_key, count(*) … HAVING count(*) > 1`) run
  against preview: currently **0** keys with multiple live rows.

**Deviation — Rule 3 (blocking issue), fixture hardening.** During repeatability runs the
remote lane intermittently failed with
`dns error: failed to lookup address information` on the fixture's admin-API `fetch` —
a LOCAL network/DNS hiccup, not a test or migration defect (the lane's own
`preview project is REACHABLE` preflight failed in the same runs, and 10+ other runs
passed 17/17). No product code involved. To keep a genuine future balance-seed surprise
from masquerading as a mid-test assertion, both remote suites now read the seeded balance
back at provision time and throw loudly if it did not take. This is a test-robustness
change only.

---

## Cross-task verification (final, actually run)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Lint | `npm run lint` | 0 errors, 152 warnings (all pre-existing; none in touched files) |
| Types | `npm run type-check` | clean |
| Frontend unit | `npm run test` (vitest) | 745 passed / 0 failed (107 files) |
| Offline edge | `npm run test:edge` | 1372 passed / 0 failed / 12 ignored |
| Remote edge | `npm run test:edge:remote` | 17 passed / 0 failed (clean run; repeatable) |

`npm run test:edge:remote` intermittently shows transient local-DNS `fetch` failures
independent of these changes; every network-clean run is 17/17. Flagged so the operator
is not surprised by an occasional red that is environmental.

---

## Constraint compliance

- Nothing under `.planning/` committed; `.gitignore` untouched; this summary written but
  NOT committed.
- No `MERIT_SYSTEM_ENABLED` string introduced into `analyze-resume/index.ts` (that file
  was not modified at all).
- Migration ships with rollback SQL as a gated R0-R4 procedure; production NOT applied.
- Task 7 case 5's zero-row pre-fix observation treated as the confirming diagnosis, not a
  broken harness (then retired once 7b fixed the defect, per the plan's ordering note).
- Each task committed atomically with a Conventional Commits message + Claude
  `Co-Authored-By` trailer.
- ROADMAP.md not touched. No feature tasks (analyzed_tier column, elite-extras, CTA,
  lease hook) built.

## Deferred / left for the operator
- **Apply `20260723000002` to production** after review (money-path; explicit approval
  required). Run R0 pre-flight first if a rollback is ever needed.
- Tasks 1-4, 6, 8-12 of the Elite-rerun feature remain unexecuted (out of scope by
  design).

## Self-Check: PASSED
- `src/hooks/useResumeStream.ts` — present, modified (commit dc98c572).
- `src/hooks/__tests__/useResumeStream.nonce.test.ts` — present (dc98c572).
- `supabase/functions/_shared/__tests__/merit-idempotency.remote.test.ts` — present (c3e73d34, updated b0e7ec3a).
- `supabase/functions/_shared/__tests__/merit-refund-replay.remote.test.ts` — present (b0e7ec3a).
- `supabase/migrations/20260723000002_merit_refund_aware_idempotency.sql` — present (b0e7ec3a).
- Commits `dc98c572`, `c3e73d34`, `b0e7ec3a` all present in `git log` on `by/ak-merit-idempotency-hotfix`.
- Preview migration end-state verified live (index replaced, old index absent, 78 rows backfilled, RPCs refund-aware).
