# 09-03 SUMMARY — DB perf-class migrations (PERF-02)

**Plan:** 09-03 · **Wave:** 1 · **autonomous:** false (operator applied prod) · **Status:** COMPLETE
**Date:** 2026-06-25 · **Driver:** orchestrator drove preview (operator option "I drive preview, you apply prod")

## What shipped

Three forward+verification+rollback migrations (mirroring the Phase-8 `20260608000008` template), applied + verified on preview `cimjltzovkahkqecpwgi`, then **operator-applied to prod `zjpjapgraoxdukdvpjes`** and re-verified read-only. **Zero app-code change** (`git diff -- src supabase/functions` empty for this plan).

| Migration | Class | Forward | Advisor delta (preview = prod) |
|-----------|-------|---------|--------------------------------|
| `20260608000012_perf_dedup_permissive_policies.sql` | `multiple_permissive_policies` | DROP 6 exact-duplicate permissive policies (improvement_checklist ×4 cmds, resumes INSERT, user_roles SELECT-redundant-with-ALL); identical-qual survivors kept | 42 → 6 |
| `20260608000013_perf_auth_rls_initplan_wrap.sql` | `auth_rls_initplan` | DO-block `ALTER POLICY` wrapping `auth.uid()` → `(select auth.uid())` on 56 policies (cmd/roles/permissive preserved) | 62 → 0 |
| `20260608000014_perf_unindexed_fk_indexes.sql` | `unindexed_foreign_keys` | 8 additive `CREATE INDEX IF NOT EXISTS` covering indexes | 8 → 0 |

## How it was proven zero-observable

- **Catalog fact (preview):** 71 public policies; exactly 62 used `auth.uid()`, 0 used `auth.role()`/`jwt()`/`email()`/`current_setting()`, 0 already wrapped → uniform `auth.uid()` rewrite.
- **In-DB verification:** each migration's `DO`-block asserts the exact end-state or aborts+rolls back. (One abort caught a verification-regex bug — Postgres renders the wrapped form as `( SELECT auth.uid() AS uid)`; fixed to a rendering-robust `select\s+auth.uid()` match and re-applied clean.)
- **Empirical SELECT-as-role (preview `resumes`, 78 rows):** owning `authenticated` user saw their 40 own rows; non-owner saw 0 — owner-scoping identical post-wrap.
- **Prod read-only re-verify:** catalog parity IDENTICAL to preview (0 bare auth.uid(), 6 dupes gone, 8 indexes present, upgrade_requests deferred pair intact, 65 total policies); prod `get_advisors(performance)` = auth_rls_initplan 0 / unindexed_fk 0 / multiple_permissive 6. Claude wrote NOTHING to prod.

## Deferred (RESIDUAL-REGISTER)

- `upgrade_requests` SELECT OR-merge (admin OR owner — DIFFERENT quals, needs DROP+CREATE): 6 advisor rows; conservative defer per Phase-8 D-03.
- `unused_index` ×41 (D-11: low-traffic ≠ disuse; the 8 new additive FK indexes are also "unused-until-scanned").
- `public_bucket_allows_listing` (storage config), `rls_policy_always_true` ×2 (service-role by design / gated Paddle), `table_bloat` `net._http_response` (extension-owned).

## Key files

- `supabase/migrations/20260608000012..14_*.sql` (forward + DO-block verification + commented rollback)
- `.planning/audit/RUNTIME-RELIABILITY.md` — preview + prod before/after evidence
- `.planning/audit/RESIDUAL-REGISTER.md` — Phase-9 dispositions + deferrals

## Deviations

- **Migration count/shape:** authored as 3 discrete files (dedup → wrap → FK) instead of "up to 3"; auth_rls used a deterministic DO-block `ALTER POLICY` (not 62 hand-written statements) for safety/idempotency — equivalent end-state, catalog-driven.
- **multiple_permissive scope:** only the provable EXACT-DUPLICATE subset taken (36 of 42); the OR-merge subset (6) deferred — within the plan's "ONLY where provably OR-equivalent; defer ambiguous" rule.
- **Apply mechanism:** preview applied via `supabasepreview` MCP by the orchestrator (executor subagents lack MCP); prod applied by the operator. Same preview→operator-prod gate as Phase 8.

## Verification

- Preview advisor deltas + SELECT-as-role: PASS. Prod read-only parity: PASS. `verify:baseline`: see Wave-1 close-out (DDL-only; no app-code change).
- `git diff -- src supabase/functions` for this plan: EMPTY. Secret-VALUE grep over touched docs/migrations: 0.
