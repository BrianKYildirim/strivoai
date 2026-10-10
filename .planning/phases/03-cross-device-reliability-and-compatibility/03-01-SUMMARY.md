---
phase: 03-cross-device-reliability-and-compatibility
plan: 01
subsystem: database
tags: [postgres, supabase, migration, rls, diagnostics, telemetry, privacy]

# Dependency graph
requires: []
provides:
  - "public.client_error_diagnostics table (26 columns) on Preview AND Production"
  - "Four query indexes: ced_created_at_idx, ced_cell_idx, ced_category_idx, ced_version_idx"
  - "RLS enabled + deny-all policy for authenticated; zero anon/authenticated grants on table and sequence"
  - "Service-role-only ingest path, round-trip proven on both Preview and Production"
  - "supabase/migrations/rollback/20260728000000_client_error_diagnostics.rollback.sql (clean DROP TABLE)"
affects: [03-04 diagnostics ingest edge function, 03-06 client emit, 03-19 validation report, XLOG-01, XLOG-02, D-25]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "New public table locked down with explicit REVOKE ALL FROM anon, authenticated on BOTH table and bigserial sequence (REVOKE FROM public is insufficient in this project)"
    - "Migration-embedded DO $$ verification block that raises if RLS is off or policy count is 0 — the migration fails rather than silently shipping an open table"
    - "Privacy enforced structurally: the schema offers no column capable of holding a document, filename, stack, raw error message or raw IP"
    - "Grant verification via pg_class.relacl + aclexplode(), NOT information_schema.role_table_grants"

key-files:
  created:
    - supabase/migrations/20260728000000_client_error_diagnostics.sql
    - supabase/migrations/rollback/20260728000000_client_error_diagnostics.rollback.sql
  modified: []

key-decisions:
  - "D-12 honoured by separation, not extension: a brand-new table rather than columns bolted onto Phase 02's ai_call_telemetry — different actor (browser vs server), different lifecycle, different retention. Phase 02 artifacts are byte-identical to HEAD."
  - "D-13 enforced by schema shape rather than by convention: no message/stack/filename/detail/ip column exists, so a future contributor cannot quietly break the never-PII guarantee. user_agent is the single bounded high-cardinality string; ip_hash is the only IP-derived column."
  - "No FOREIGN KEY on user_id or run_id — a diagnostics row must survive deletion of the thing it describes and must never block a user deletion (mirrors ai_call_telemetry)."
  - "D-11 fire-and-forget supported: only four NOT NULL columns (app_version, surface, lifecycle_stage, error_category), all always client-supplied — proven empirically by inserting with every device field withheld."
  - "Retention left as a documented operator-run DELETE, deliberately NOT automated — mirrors the ai_call_telemetry precedent."
  - "information_schema.role_table_grants was rejected as the grant-verification source after it returned zero rows for EVERY grantee (including a false 'service_role has no grants'); pg_class.relacl via aclexplode() is authoritative."

patterns-established:
  - "Preview-first schema rollout: Claude applies + proves on Preview, the operator applies Production, Claude verifies Production read-only"
  - "Access posture is proven empirically (SET ROLE anon/authenticated -> expect insufficient_privilege) in addition to structurally (relrowsecurity, pg_policies, relacl)"

requirements-completed: [XLOG-01, XLOG-02]

# Metrics
duration: ~45min
completed: 2026-07-28
---

# Phase 03 Plan 01: Client Error Diagnostics Table Summary

**A privacy-safe, service-role-only `public.client_error_diagnostics` landing table (26 columns, 4 indexes, RLS + deny-all policy, zero anon/authenticated grants) live on Preview and Production, structurally incapable of storing a document, filename, stack, raw error message or raw IP — the observation apparatus every later Phase 03 plan is validated against.**

## Performance

- **Duration:** ~45 min (including the blocking operator checkpoint)
- **Tasks:** 3 of 3
- **Files created:** 2 (172 lines of SQL total)
- **Files modified:** 0

## Accomplishments

- Authored a replay-safe forward migration (149 lines) plus a paired 23-line rollback, with the lockdown posture asserted inside the migration itself via a `DO $$` block that raises if RLS is off or no policy exists.
- Applied and fully verified the table on Preview, including empirical deny proofs under the real `anon` and `authenticated` roles.
- Operator applied to Production; Claude verified all four required values read-only and confirmed the migration history.
- Established that `information_schema.role_table_grants` is unusable for grant verification on this project and documented the authoritative alternative.

## Task Commits

1. **Task 1: Author the migration and paired rollback** — `435834ee` (feat)
2. **Task 2: Apply to Preview and prove the access posture** — no repo files changed (Preview database only)
3. **Task 3: Operator applies to Production** — no repo files changed (blocking human-action checkpoint)

## Files Created/Modified

- `supabase/migrations/20260728000000_client_error_diagnostics.sql` (149 lines, new) — creates `public.client_error_diagnostics`, four `ced_*` indexes, table comment, `ENABLE ROW LEVEL SECURITY`, a duplicate_object-safe deny-all policy for `authenticated`, explicit `REVOKE ALL ... FROM anon, authenticated` on the table AND the `client_error_diagnostics_id_seq` sequence, a `DO $$` verification block, and the operator-run retention comment.
- `supabase/migrations/rollback/20260728000000_client_error_diagnostics.rollback.sql` (23 lines, new) — `DROP TABLE IF EXISTS public.client_error_diagnostics;` which takes the indexes, policy and sequence with it.

## Task 1 — Acceptance Evidence

All eight acceptance criteria passed:

- Both files exist at the exact planned paths.
- Exactly one `REVOKE ALL ON public.client_error_diagnostics FROM anon, authenticated`, plus the matching sequence revoke.
- Exactly one `ENABLE ROW LEVEL SECURITY`.
- Zero free-text PII columns — no `message`, `stack`, `filename`, `detail` or `ip`.
- Zero `FOREIGN KEY` / `REFERENCES`.
- All four index names present: `ced_created_at_idx`, `ced_cell_idx`, `ced_category_idx`, `ced_version_idx`.
- Rollback contains `DROP TABLE IF EXISTS public.client_error_diagnostics`.
- **D-12 check:** `git status --porcelain` on `20260721000000_ai_call_telemetry.sql`, its rollback, and `supabase/functions/_shared/ai-telemetry.ts` printed nothing — Phase 02's artifacts are byte-identical to HEAD.

## Task 2 — Preview Verification Evidence

Project: **`cimjltzovkahkqecpwgi` / strivoaipreview**. Applied via Supabase MCP.

| Check | Result |
| --- | --- |
| `pg_class.relrowsecurity` | `true` |
| `pg_policies` count | `1` — "Service role only - no anon/authenticated access" |
| `anon` / `authenticated` grants | **absent from `pg_class.relacl`** on both table and sequence (zero grants) |
| `service_role` grants | full privileges on table and sequence — the 03-04 ingest path is reachable |
| Security advisors | 21 before → 21 after, **delta 0**, none naming `client_error_diagnostics` |
| Service-role round-trip | insert `id=3` → readback `rows=1` → delete → table `rows=0` |
| Structure | 26 columns, 0 PII-capable columns, 0 foreign keys, 4 `ced_*` indexes |

**D-11 fire-and-forget proof:** an insert supplying ONLY the four NOT NULL columns (`app_version`, `surface`, `lifecycle_stage`, `error_category`), with every device field withheld, succeeded. A client that cannot determine its browser/OS/viewport can still emit.

**Deny proof under real roles:**
- `SET ROLE authenticated` → `SELECT` and `INSERT` both raised `insufficient_privilege`.
- `SET ROLE anon` → `SELECT` raised `insufficient_privilege`.

### Methodology note — `information_schema` is NOT a reliable grant check here

The plan's Task-2 acceptance criterion named `information_schema.role_table_grants`. **It is not a trustworthy source for this check and the next person to verify this table should not use it.** `role_table_grants` only exposes grants visible to the *current* role; against this project it returned **zero rows for every grantee** — producing both a false "service_role has no grants" reading and, more dangerously, a **false-pass** "anon/authenticated have no grants" that would have looked identical on a wide-open table.

All grant evidence recorded above (Preview and Production) instead comes from `pg_class.relacl` expanded via `aclexplode()`, which is authoritative and role-independent. Plan 03-19 should cite the `relacl` evidence, not the `information_schema` criterion as literally worded.

## Task 3 — Production Verification Evidence

Project: **`zjpjapgraoxdukdvpjes` / strivoainet**.

The **OPERATOR** applied the migration from their Mac using `npx supabase db push --linked`; the final `--dry-run` returned "Remote database is up to date." **Claude performed no production write at any point except the explicitly authorized verification round-trip below.**

The four required production values:

| Required value | Result |
| --- | --- |
| `relrowsecurity` | `true` |
| `pg_policies` count | `1` — "Service role only - no anon/authenticated access" |
| `anon` / `authenticated` grants | **zero** (absent from `pg_class.relacl`, table and sequence) |
| Service-role round-trip | insert `id=1` → readback `rows=1` → delete → table `rows=0` |

Additional production confirmations:

- Structure: 26 columns, 0 PII columns, 0 foreign keys, 4 `ced_*` indexes.
- Security advisors: 21 total, none naming `client_error_diagnostics`.
- Deny proof: `SET ROLE authenticated` → `SELECT` and `INSERT` both `insufficient_privilege`; `SET ROLE anon` → `SELECT` `insufficient_privilege`.
- Migration history confirms BOTH `20260727120000 restore_client_writes_resumes_career_targets` AND `20260728000000 client_error_diagnostics`.

## Decisions Made

See `key-decisions` in the frontmatter. The two that carry beyond this plan:

1. **Separation over extension (D-12).** A new table, not new columns on `ai_call_telemetry`. Phase 02 is in flight under separate ownership; editing its migration would have corrupted a concurrent workstream.
2. **Structural privacy over policy privacy (D-13).** XLOG-02's guarantee is enforced by the absence of any column that could hold user content — a schema-level backstop that survives contributors who have not read the requirement.

## Deviations from Plan

None — plan executed as written. The only substantive departure is a verification *method* change, not a scope change: the Task-2 criterion's `information_schema.role_table_grants` query was found to be unreliable (see the methodology note above) and was replaced by the authoritative `pg_class.relacl` / `aclexplode()` check, which proves the same property more strongly. The criterion's intent — zero anon/authenticated grants — is satisfied and additionally backed by empirical `SET ROLE` deny proofs that the plan did not require.

## Issues Encountered

**`information_schema.role_table_grants` returned zero rows for every grantee.** Initially indistinguishable from a pass. Resolved by cross-checking with `pg_class.relacl`, which showed `service_role` *did* hold grants — exposing the `information_schema` reading as a visibility artifact rather than ground truth. Recorded above so the same trap is not re-entered.

## Known Residuals

Documented deliberately; neither is being fixed in this plan.

1. **Preview recorded a different migration version.** Preview logged this migration as `20260727145547` (Supabase MCP assigns its own version stamp), not `20260728000000`. A later `supabase db push` against Preview will therefore re-apply it. This is harmless — the migration is replay-safe end to end (`IF NOT EXISTS` throughout, `duplicate_object` swallowed in the policy block, revokes idempotent) — but it should not surprise anyone reading the Preview migration history. **Production recorded the correct `20260728000000`.**
2. **Production sequence starts at 2.** `client_error_diagnostics_id_seq` on Production is permanently at 1 because of the authorized verification insert, so the first real diagnostic row will be `id=2`. The table itself is empty. No functional impact — `id` is a surrogate key with no external meaning.

## User Setup Required

None — no external service configuration required. The Production apply was the operator action and it is complete.

## Next Phase Readiness

- **Ready:** `public.client_error_diagnostics` exists on Preview and Production with a proven service-role write path. Plan **03-04** (diagnostics ingest edge function) can build against it immediately; the `ip_hash` column awaits the date-salted truncated hash that 03-04 owns.
- **Ready:** `ced_cell_idx` on `(browser, os, device_type, created_at DESC)` makes the D-25 question — which browser/OS/device cells fail at which lifecycle stage — directly answerable, which is what plan **03-19** validates against.
- **Deferred by design:** per-session emit caps and rate limiting live in plans **03-04/03-06**; retention is an operator-run `DELETE`, documented in the migration and intentionally not automated.
- **Untouched, as required:** `supabase/config.toml`, `scripts/deploy.ps1` and `supabase/functions/deno.json` belong to plan 03-04 and were not modified here.
- **No blockers.**

---
*Phase: 03-cross-device-reliability-and-compatibility*
*Completed: 2026-07-28*
