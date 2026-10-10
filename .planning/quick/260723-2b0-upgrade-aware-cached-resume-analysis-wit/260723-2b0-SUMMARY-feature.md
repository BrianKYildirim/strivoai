---
quick_id: 260723-2b0
segment: feature (Tasks 1,2,3,4,6,8,9,10)
status: complete-pending-checkpoint
branch: staging
production_touched: false
---

# 260723-2b0 — Elite resume-rerun feature (automated tasks)

Continuation after a session-limit interruption. The hotfix segment (Tasks 5, 7, 7b)
already landed on `staging`; this segment finished the feature's automated tasks. Task 11
(live TEST-project run with merits enabled) and Task 12 (checkpoint) remain — operator-gated.

## Commits (staging, oldest → newest in this segment)

| Task | Commit | What |
|------|--------|------|
| 1 | `0ef4066f` | `resumes.analyzed_tier` column (CHECK `free`/`elite`) + column-level GRANT/REVOKE tamper boundary + rollback |
| 2 | `5bab64d5` | authenticated-user grant probe (remote deno) — proves forge rejection AND no 403 inverse-trap |
| 3 | `0ae17a3e` | backfill `analyzed_tier` from `analysis_results.raw_response.metadata.tier`, collapsing `pro`→`elite` |
| 4 | `b4ef07c4` | stamp `analyzed_tier` on save; restore elite-extras budget; raise ceiling 30000→34000; SC-12 snapshot + `CALL_CONFIGS` mirrors |
| 6 | `648ac73a` | tier-aware Upload cache short-circuit (adds tier predicate; does not delete the short-circuit) |
| 8 | `ee59e323` | `useEliteRerun` hook — bounded in-flight lease, cloned `resumes` row, navigation |
| 9 | `60da2920` | Results: data-tier reconciliation (`showFullResults` prefers `analyzed_tier`) + `EliteRerunCta` + unknown-tier affordance + lease cleanup |
| 10 | `1b4652fb` | wire `analyze-resume` cache/index/onboarding tests into `test:ci` |

Task 9 was uncommitted-in-progress at interruption; verified complete (type-check + the new
reconciliation test green) and committed as-is. No redesign.

## Verification (actually run, real results)

- `npm run lint` — 0 errors, 152 warnings (all pre-existing)
- `npm run type-check` — clean
- `npm run test` (vitest) — 772 passed / 0 failed (110 files)
- `npm run test:edge` (offline deno) — 1385 passed / 0 failed / 12 ignored (+13 newly wired)
- `npm run test:edge:remote` (live preview) — 22 passed / 0 failed, including:
  - `DEDUCT → REFUND → REPLAY charges AGAIN (the hole is closed)`
  - `SPLIT deduction now charges the FULL cost (D-7b defect closed)`
  - `authenticated INSERT with analyzed_tier is REJECTED (42501)` (forge vector closed)
  - file-identity INSERT/UPDATE SUCCEEDS (inverse 403 trap avoided)
- `npm run build` — clean
- `npm run test:e2e` (Playwright) — 9 passed / 2 skipped (pre-existing quarantine)
- `cd supabase/functions && deno check */index.ts` — clean (parse guard; edge tests don't parse the module)

verify:baseline green end to end.

## Migration apply state — EXPLICIT

Preview (`cimjltzovkahkqecpwgi`) — APPLIED, ledger confirmed:
- `20260723000000_resumes_analyzed_tier`
- `20260723000001_backfill_resumes_analyzed_tier`
- `20260723000002_merit_refund_aware_idempotency` (hotfix segment)

Backfill result on preview: `elite`=5, `free`=152, `null`=103 (54 analyzed-but-unrecoverable
tier + 49 unanalyzed). Partial coverage is expected (the `analysis_results` mirror can be
null); the 54 unknown rows hit the D-4 neutral non-charging affordance by design.

PRODUCTION (`zjpjapgraoxdukdvpjes`) — NOT APPLIED. All three migrations await explicit
operator approval per CLAUDE.md. Each carries rollback SQL; `20260723000002` carries the
gated R0–R4 rollback (run the R0 duplicate pre-flight first; 0 duplicate keys on preview).

## Remaining before done

- **Task 11 (blocking checkpoint):** live TEST-project run with `MERIT_SYSTEM_ENABLED=true`
  — one-charge proof, both-rows-in-history proof, tamper probe, failed-rerun refund + recharge,
  refresh-mid-failure charge, cost/latency gate (<$0.10, ~42s; fallback 4000→2500 elite-extras).
  Operator-gated; not run here.
- **Task 12:** final checkpoint/wrap.
- Production migration apply (operator approval).
- Nothing pushed to any remote.
