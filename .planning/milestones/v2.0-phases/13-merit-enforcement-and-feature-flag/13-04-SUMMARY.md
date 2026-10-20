---
phase: 13-merit-enforcement-and-feature-flag
plan: 04
subsystem: api
tags: [merit-system, observability, metrics, alerts, migration, phase-13, wave-3]

requires:
  - phase: 13-merit-enforcement-and-feature-flag (plan 03)
    provides: D-06 feature flag branch in all AI handlers
  - phase: 13-merit-enforcement-and-feature-flag (plan 01)
    provides: Wave 0 test stubs for admin-merit-metrics and check-merit-alerts

provides:
  - 4 Postgres views for merit system observability (v_merits_in_circulation, v_feature_consumption_daily, v_shop_purchases_daily, v_conversion_funnel)
  - alert_state debounce table with RLS enabled (service role only)
  - get_ai_failure_rate_1h and get_shop_failure_rate_1h helper RPCs
  - admin-merit-metrics edge function with dual admin gate (NFR-10)
  - check-merit-alerts edge function with 3 evaluators, debounce, non-fatal errors (NFR-11)
  - Per-env cron template at supabase/ops/phase-13-cron-setup.sql
  - 12 passing Deno tests across 2 test files

affects: [13-05-PLAN, phase-20, phase-21]

tech-stack:
  added: []
  patterns:
    - "createHandler(deps) factory pattern for dependency injection in edge function tests"
    - "alert_state upsert BEFORE email dispatch (Pitfall 7 ordering)"
    - "Non-fatal DB error handling: return 200 so pg_cron does not backlog"
    - "Dual admin gate: ADMIN_EMAILS env fast path + user_roles DB fallback"

key-files:
  created:
    - supabase/migrations/20260416000000_merit_enforcement_observability.sql
    - supabase/ops/phase-13-cron-setup.sql
    - supabase/functions/admin-merit-metrics/index.ts
    - supabase/functions/check-merit-alerts/index.ts
  modified:
    - supabase/functions/admin-merit-metrics/index.test.ts
    - supabase/functions/check-merit-alerts/index.test.ts
    - supabase/functions/deno.lock

key-decisions:
  - "merit_transactions uses `id` (not `transaction_id`), `amount` (not `amount_impulses`), `balance_type`/`source` (not `status` with deducted/refunded) -- adapted all views accordingly"
  - "v_shop_purchases_daily uses merit_shop_purchases table (not `shop_purchases`) with price_cents/pack_size/status columns"
  - "v_conversion_funnel is a PROVISIONAL stub returning zero rows (merit_exhaustion_events table does not exist)"
  - "get_shop_failure_rate_1h uses merit_shop_purchases.status column (no separate shop_purchases_failed table)"
  - "Used serve() pattern instead of handleRequest() because admin-merit-metrics is a read-only GET endpoint with no request body, and handleRequest requires Zod schema + JSON body parsing"
  - "Schema pushed to both local and remote Supabase instances successfully"

patterns-established:
  - "createHandler(deps) factory for DI-testable edge functions"
  - "Per-env cron registration via supabase/ops/ SQL templates (not in migrations)"

requirements-completed: [NFR-10, NFR-11]

duration: 7min
completed: 2026-04-16
---

# Phase 13 Plan 04: Observability Migration, Admin Metrics, and Alert System Summary

**4 Postgres views + alert_state table + 2 RPCs in migration, admin-merit-metrics with dual admin gate (NFR-10), check-merit-alerts with 3 evaluators + debounce + non-fatal DB errors (NFR-11), 12 green Deno tests across 2 test files**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-16T13:18:17Z
- **Completed:** 2026-04-16T13:25:04Z
- **Tasks:** 5/5
- **Files created:** 4
- **Files modified:** 3

## Accomplishments

- Created forward-only migration with 4 aggregation views, alert_state debounce table (RLS, no policies), and 2 helper RPCs
- Pushed schema successfully to both local and remote Supabase instances
- Shipped admin-merit-metrics edge function with dual admin gate (ADMIN_EMAILS env + user_roles fallback)
- Shipped check-merit-alerts edge function with 3 alert evaluators, 60-minute debounce, non-fatal DB error handling
- Converted 5 Wave 0 ignored test stubs into 12 executable passing tests
- Created per-env cron template at supabase/ops/phase-13-cron-setup.sql
- Full test suite passes: 149 passed, 0 failed

## Schema Details

### merit_transactions Column Mapping (Plan Assumption vs Reality)

| Plan Assumed | Actual Column | Notes |
|-------------|---------------|-------|
| `transaction_id` | `id` | UUID primary key |
| `amount_impulses` | `amount` | Signed integer (negative for deductions) |
| `status` ('deducted'/'refunded') | `balance_type` + `source` | `source='feature-deduct'` for deductions, `balance_type='refund'` for refunds |

### Views Created

| View | Source Table | Status |
|------|-------------|--------|
| v_merits_in_circulation | merit_transactions + profiles | Live |
| v_feature_consumption_daily | merit_transactions | Live |
| v_shop_purchases_daily | merit_shop_purchases | Live |
| v_conversion_funnel | (stub - merit_exhaustion_events absent) | PROVISIONAL |

### PROVISIONAL Objects

- **v_conversion_funnel**: Stub view returning zero rows. merit_exhaustion_events table does not exist. A future phase will replace this stub with real data.
- **get_shop_failure_rate_1h**: Uses merit_shop_purchases.status='failed' counting. No separate shop_purchases_failed table exists.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration + cron template** - `c77e80a` (feat)
2. **Task 2: Schema push** - No commit (infrastructure task, verified success)
3. **Task 3: admin-merit-metrics + tests** - `4c7cf0a` (feat)
4. **Task 4: check-merit-alerts + tests** - `5dd5fb8` (feat)
5. **Task 5: Full suite verification + deno.lock** - `5deb887` (chore)

## Test File Summary

| File | Tests | Status |
|------|-------|--------|
| admin-merit-metrics/index.test.ts | 5 | All green |
| check-merit-alerts/index.test.ts | 7 | All green |
| **Total** | **12** | **12 passed, 0 failed** |

## Files Created/Modified

- `supabase/migrations/20260416000000_merit_enforcement_observability.sql` - 4 views, alert_state table, 2 RPCs, analytics index
- `supabase/ops/phase-13-cron-setup.sql` - Per-env cron template for check-merit-alerts (paste into SQL editor)
- `supabase/functions/admin-merit-metrics/index.ts` - Admin-only metrics endpoint with dual admin gate
- `supabase/functions/admin-merit-metrics/index.test.ts` - 5 tests: auth, non-admin 403, env-admin 200, role-admin 200, view-error 500
- `supabase/functions/check-merit-alerts/index.ts` - Cron-triggered alert evaluator with 3 conditions + debounce
- `supabase/functions/check-merit-alerts/index.test.ts` - 7 tests: auth, fire, threshold, boundary, debounce, DB error, email failure
- `supabase/functions/deno.lock` - Updated with new std library hashes

## Decisions Made

- **Schema adaptation**: merit_transactions uses `id` (not `transaction_id`), `amount` (not `amount_impulses`), `balance_type`/`source` instead of a `status` column. All views adapted accordingly.
- **v_conversion_funnel stub**: No merit_exhaustion_events table exists. Shipped as zero-row stub so admin endpoint works. Future phase will wire real data.
- **serve() instead of handleRequest()**: The actual `handleRequest` function requires a Zod schema and JSON body parsing. admin-merit-metrics is a read-only endpoint with no body, so `serve()` pattern (matching keep-warm) is more appropriate.
- **get_shop_failure_rate_1h simplified**: No `shop_purchases_failed` table exists. Used merit_shop_purchases.status='failed' counting instead of the plan's dynamic SQL approach.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted views to actual merit_transactions schema**
- **Found during:** Task 1
- **Issue:** Plan assumed merit_transactions had `transaction_id`, `amount_impulses`, and `status` columns. Actual schema uses `id`, `amount`, `balance_type`/`source`.
- **Fix:** Rewrote all 4 views and both RPCs to match the real Phase 10/11 schema.
- **Files modified:** supabase/migrations/20260416000000_merit_enforcement_observability.sql

**2. [Rule 1 - Bug] Used merit_shop_purchases instead of shop_purchases**
- **Found during:** Task 1
- **Issue:** Plan assumed a `shop_purchases` table with `currency` and `impulses_granted` columns. Actual table is `merit_shop_purchases` with `price_cents`, `pack_size`, `status`.
- **Fix:** v_shop_purchases_daily uses correct table and columns.
- **Files modified:** supabase/migrations/20260416000000_merit_enforcement_observability.sql

**3. [Rule 1 - Bug] Stub v_conversion_funnel (missing dependency table)**
- **Found during:** Task 1
- **Issue:** Plan's v_conversion_funnel references merit_exhaustion_events which does not exist.
- **Fix:** Created zero-row stub view per plan's documented fallback pattern.
- **Files modified:** supabase/migrations/20260416000000_merit_enforcement_observability.sql

**4. [Rule 1 - Bug] Simplified get_shop_failure_rate_1h**
- **Found during:** Task 1
- **Issue:** Plan used dynamic SQL checking for shop_purchases_failed table existence. No such table exists.
- **Fix:** Used merit_shop_purchases.status column directly (already has 'failed' as a valid status).
- **Files modified:** supabase/migrations/20260416000000_merit_enforcement_observability.sql

**5. [Rule 3 - Blocking] Used serve() pattern instead of handleRequest()**
- **Found during:** Task 3
- **Issue:** Plan's implementation shape showed handleRequest({ authMode, handler }) but actual handleRequest requires (req, { authMode, schema, handler }) with mandatory Zod body parsing.
- **Fix:** Used serve() + requireAuth pattern matching keep-warm and send-strivo-email edge functions.
- **Files modified:** supabase/functions/admin-merit-metrics/index.ts

## Cron Registration Status

- **supabase/ops/phase-13-cron-setup.sql**: Paste-ready SQL template. Requires `<PROJECT_REF>` and `<INTERNAL_JOB_SECRET>` substitution before running in each env's SQL editor.
- **Not yet executed** in staging or production. Deploy check-merit-alerts edge function first, then run the SQL.

## Threat Model Coverage

| Threat ID | Disposition | Implementation | Test |
|-----------|-------------|----------------|------|
| T-13-AUTH1 | mitigate | Dual admin gate (ADMIN_EMAILS + user_roles) | Tests 2, 3, 4 |
| T-13-AUTH2 | mitigate | requireAuth('user') before admin check | Test 1 |
| T-13-AL1 | mitigate | 60-min debounce via alert_state | Tests 3, 4 (debounce hit) |
| T-13-AL2 | mitigate | Upsert BEFORE email dispatch | Tests 2, 6 |
| T-13-AL3 | mitigate | last_value jsonb stores trigger snapshot | Structural (in tryFireAlert) |
| T-13-AL4 | mitigate | Non-fatal DB errors, returns 200 | Test 5 |
| T-13-ADM1 | accept | Tier-aggregated only, no per-user rows | Structural |
| T-13-ADM2 | mitigate | RLS enabled, no policies | In migration |
| T-13-MIG1 | mitigate | All DDL idempotent | In migration |
| T-13-MIG2 | accept | v_conversion_funnel is PROVISIONAL stub | Documented |
| T-13-CRON1 | mitigate | authMode 'internal' + INTERNAL_JOB_SECRET | Test 1 (check-merit-alerts) |

## Known Stubs

- **v_conversion_funnel**: PROVISIONAL stub view returning zero rows. Will be replaced when merit_exhaustion_events table ships in a future phase.

## Issues Encountered

None.

## User Setup Required

- Run `supabase/ops/phase-13-cron-setup.sql` in each environment's SQL editor after deploying check-merit-alerts edge function.

## Next Phase Readiness

- Wave 4 (plan 05) can start: all observability infrastructure is live
- Phase 20 can reference admin-merit-metrics endpoint for dashboard
- Phase 21 cutover has full alerting infrastructure ready

## Self-Check: PASSED

- All 4 created files verified on disk
- All 3 modified files verified on disk
- All 4 task commits (c77e80a, 4c7cf0a, 5dd5fb8, 5deb887) verified in git log
- Full test suite: 149 passed, 0 failed

---
*Phase: 13-merit-enforcement-and-feature-flag*
*Completed: 2026-04-16*
