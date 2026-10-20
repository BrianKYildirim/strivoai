---
phase: 24-pricing-merit-economy-and-top-up-packs-update-update-merits-
plan: 07
subsystem: audit-quality-gate
tags: [audit, closure, regression-guard, sc-13, checkpoint, human-approved]
closure_status: approved
checkpoint_resolution: "human-approved 2026-04-22 — Delta #1 accepted as non-blocking; phase cleared for /gsd-verify-work 24"
requirements:
  - AUDIT-01
  - MIG-03
  - NFR-09
dependency_graph:
  requires: ["24-01", "24-02", "24-03", "24-04", "24-05", "24-06"]
  provides:
    - ".planning/phases/24-.../24-AUDIT.md (SC-13 reconciliation artefact; 13 ✅ covered rows + 1 Open Delta)"
    - "supabase/functions/_tests/grandfather-subscriber-stability.test.ts (D-20 / MIG-03 regression guard; 4 Deno tests)"
    - "src/config/__tests__/req-coverage.test.ts (CI guard: Phase 24 REQ-ID registry ↔ plan frontmatter drift)"
    - ".planning/REQUIREMENTS.md §Phase 24 (13 new REQ-IDs: TOPUP-01..05, BUDGET-01..03, BRAND-01..02, ECON-01..02, AUDIT-01)"
    - ".planning/phases/24-.../24-VALIDATION.md (28-row per-task verification map; nyquist_compliant=true; approval=ready)"
  affects:
    - "Phase 24 closure checklist for /gsd-verify-work"
tech_stack:
  added: []
  patterns:
    - "SC-13 reconciliation artefact: table-per-feature × table-per-tier cell-by-cell comparison (shipped vs spec) with explicit Open Deltas register"
    - "Price-ID-agnostic grandfathering regression (4 Deno tests asserting SELECT projections never include stripe_price_id)"
    - "REQ-ID coverage CI guard: parse REQUIREMENTS.md section + plan frontmatter, assert no drift + no orphan registrations"
key_files:
  created:
    - .planning/phases/24-pricing-merit-economy-and-top-up-packs-update-update-merits-/24-AUDIT.md
    - supabase/functions/_tests/grandfather-subscriber-stability.test.ts
    - src/config/__tests__/req-coverage.test.ts
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/phases/24-pricing-merit-economy-and-top-up-packs-update-update-merits-/24-VALIDATION.md
decisions:
  - "SC-13 reconciliation uses pricing-config.ts (build-time SC-12 truth) as the 'shipped' column for the 5 feature × 3 tier × 3 table cells (15 per feature = 75 cells total); all Δ=0."
  - "Plan 03 Tasks 3-4 deferral (runtime enforcement of getMaxOutput in 5 feature handlers) escalated honestly as Open Delta #1 rather than silently recorded as Δ=0 — the TS source of truth is correct but the handlers still ship the Phase 15 CALL_CONFIGS literals. Remediation tracked for a micro-plan."
  - "D-20 grandfathering regression guard placed in supabase/functions/_tests/ (cross-function test directory) rather than reset-subscription-merits/ to signal it asserts a cross-function contract (reset pipeline is price-ID agnostic)."
  - "REQ-coverage test uses an explicit prior-phase allowlist (MER-14, SHOP-01..04/09..11, BACK-08..11, NFR-06..09, SUB-02/04, UX-01/04/08, MIG-03) so orphan or unregistered REQ-IDs in plan frontmatter fail CI."
  - "Task 5 checkpoint is returned as 'human-verify' with gate=blocking — the executor explicitly does NOT self-approve Phase 24 closure."
metrics:
  duration: "~45 minutes"
  completed: "2026-04-22"
  tasks: 4
  files_created: 3
  files_modified: 2
---

# Phase 24 Plan 07: Audit, REQ Registration, Validation Backfill, and Regression Guard — SUMMARY

**One-liner:** Phase 24 quality-gate plan — produced SC-13 reconciliation artefact, registered 13 new REQ-IDs in `.planning/REQUIREMENTS.md`, backfilled a 28-row per-task verification map in `24-VALIDATION.md`, locked in a 4-test D-20 grandfathering regression guard, and returned the closure checkpoint without self-approval.

## Scope

This is the final plan of Phase 24 — the closing audit, not a feature. Four automated tasks and one blocking checkpoint:

- **Task 1** produced `24-AUDIT.md` (SC-13 reconciliation artefact).
- **Task 2** added a Deno regression guard proving `reset-subscription-merits` is price-ID-agnostic (D-20 / MIG-03 / NFR-09).
- **Task 3** registered the 13 Phase 24 REQ-IDs in the project-wide ledger and added a CI guard that fails if plan frontmatter references drift.
- **Task 4** filled out `24-VALIDATION.md` with a 28-row per-task verification map and flipped `nyquist_compliant: true`, `status: ready`, `approval: ready for /gsd-verify-work`.
- **Task 5** human-approved on 2026-04-22 — Delta #1 (Plan 03 Tasks 3-4 runtime-enforcement rewire) explicitly accepted as non-blocking for phase closure; remediation tracked for a separate micro-plan. Phase 24 is cleared for `/gsd-verify-work 24`.

## Deliverables

### 1. `24-AUDIT.md` (uncommitted — under `.planning/`)

SC-13 reconciliation artefact. Sections:
- 5 feature reconciliation tables (resume, career, linkedin, recruiting, interview) × 3 token tables (output / input-tokens / input-chars). All 75 cells Δ=0 against `src/config/pricing-config.ts` (the SC-12 source of truth per D-19).
- Tier-sum reconciliation: Free 11 500 / Pro 52 000 / Elite 72 000 — all ✅.
- Merit cost reconciliation (MERIT_COST_PER_FEATURE) — all match, reference commits `d86df00` + `7bfbffe`.
- PACK_CATALOG reconciliation (pack_25 sole `isBestValue`).
- D-20 grandfathering snapshot (STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_ELITE_MONTHLY env vars preserved; new annual SKUs live alongside).
- Brand-v2 token scope audit (`--accent-red`, `--bg-deep`, `--radius-boxy` live only under `.theme-v2`).
- SC-by-SC coverage index — 13 rows, all "✅ covered".
- Open Deltas: **Delta #1** documents Plan 03 Tasks 3-4 deferral honestly with root cause, impact assessment, and remediation path (worktree blocker recorded in 24-03-SUMMARY.md carried the stoppage).

### 2. `supabase/functions/_tests/grandfather-subscriber-stability.test.ts` (committed — `ac3e9ba`)

4 Deno tests proving the reset-subscription-merits pipeline never reads `stripe_price_id`:

| Test | Assertion |
|------|-----------|
| `legacy-pro-monthly-refresh-still-works` | Legacy Pro user refreshed to tier=pro; SELECT projection does NOT include `stripe_price_id` |
| `shop-balance-preserved-across-reset` | SELECT projection does NOT include `shop_balance`; RPC contract is exactly 3 args (`p_user_id`, `p_tier`, `p_next_reset_date`) |
| `webhook-replay-for-legacy-price-does-not-double-credit` | Idempotence enforced by `subscription_reset_date` date filter, not by price ID |
| `mixed-batch-new-and-legacy-users-both-credited` | Single sweep containing a legacy Pro + a new-price Elite user credits both via the same code path |

Verified: `cd supabase/functions && deno test _tests/grandfather-subscriber-stability.test.ts --allow-env --allow-net --no-check` → 4 passed / 0 failed.

### 3. `.planning/REQUIREMENTS.md` — Phase 24 section appended (uncommitted — under `.planning/`)

New section `## Phase 24 Requirements — Pricing / Merit Economy / Top-Up Packs Update` with 13 bullet REQ-IDs:

- Top-Up Packs: TOPUP-01..05
- Budgets: BUDGET-01, BUDGET-02, BUDGET-03 (BUDGET-03 tracked as Open Delta #1)
- Brand V2: BRAND-01, BRAND-02
- Economy: ECON-01, ECON-02
- Audit: AUDIT-01

Traceability table extended with a 5×3 Phase-24 subgrid. BUDGET-03 is the only row currently left unchecked (deferred — see Open Delta #1).

### 4. `src/config/__tests__/req-coverage.test.ts` (committed — `ef25dbe`)

2 vitest tests:

1. **REQUIREMENTS.md registers the 13 expected Phase 24 REQ-IDs** — parses `## Phase 24 Requirements` bullet list and asserts exact set match.
2. **Every Phase 24 plan frontmatter requirement is registered or allow-listed** — parses `requirements:` from each of the 7 plan files (both block and flow form), cross-checks against the union of registered Phase-24 REQ-IDs and the prior-phase allowlist; also asserts no orphan registrations.

Verified: `npm test -- --run src/config/__tests__/req-coverage.test.ts` → 2 passed / 0 failed.

### 5. `24-VALIDATION.md` — per-task map populated (uncommitted — under `.planning/`)

- 28 rows spanning all 7 plans: 01×2, 02×4, 03×4 (T2/T3/T4 marked ⚠️ deferred), 04×4, 05×5, 06×5, 07×4.
- Every row names: plan, wave, requirement, threat ref, secure behavior, test type, exact automated command, file existence anchor, current status.
- Each of the 11 Validation Seeds from §Validation Architecture is mapped to the tasks that cover it.
- Wave 0 checklist updated (5/6 items ✅ green; `input-guard.ts` deferred to Delta #1 remediation).
- Frontmatter flipped: `status: draft → ready`, `nyquist_compliant: false → true`, `wave_0_complete: false → true`.
- Sign-off checklist all ✅; Approval: ready for /gsd-verify-work.

## Commits

Two commits on-disk for this plan (no new commits added during finalization):

| Task | Hash     | Scope | Message |
|------|----------|-------|---------|
| 2    | `ac3e9ba` | committed | test(24-07): add grandfather-subscriber-stability regression guard (MIG-03/D-20) |
| 3    | `ef25dbe` | committed | test(24-07): add Phase 24 REQ-ID coverage CI guard |

### Uncommitted `.planning/` artefacts (4 files, gitignored per project rule)

Per `CLAUDE.md` and user memory, nothing under `.planning/` is committed to git. The following four artefacts persist on disk and are consumed by `/gsd-verify-work 24`:

1. `.planning/phases/24-pricing-merit-economy-and-top-up-packs-update-update-merits-/24-AUDIT.md` — SC-13 reconciliation artefact (Task 1)
2. `.planning/REQUIREMENTS.md` — §Phase 24 section appended with 13 new REQ-IDs + traceability subgrid (Task 3 Part A)
3. `.planning/phases/24-pricing-merit-economy-and-top-up-packs-update-update-merits-/24-VALIDATION.md` — 28-row per-task verification map + sign-off (Task 4)
4. `.planning/phases/24-pricing-merit-economy-and-top-up-packs-update-update-merits-/24-07-SUMMARY.md` — this file

## Verification (Task-by-Task)

| Task | Check | Result |
|------|-------|--------|
| 1 | `grep -c "✅ covered" 24-AUDIT.md` ≥ 13 | **13** ✅ |
| 1 | `grep -ci "TBD\|placeholder\|pending" 24-AUDIT.md` = 0 | **0** ✅ |
| 2 | `deno test _tests/grandfather-subscriber-stability.test.ts` | **4 passed / 0 failed** ✅ |
| 3 | `npm test -- --run src/config/__tests__/req-coverage.test.ts` | **2 passed / 0 failed** ✅ |
| 4 | `grep -c "nyquist_compliant: true" 24-VALIDATION.md` ≥ 1 | **3** ✅ |
| 4 | per-task row count ≥ 25 | **28** ✅ |

## Deviations from Plan

None on the spec side — all four task acceptance criteria met exactly. The only pre-existing gap (Plan 03 Tasks 3-4 deferral) is honestly documented in 24-AUDIT.md §Open Deltas rather than silently recorded as compliant, per Task 1 acceptance criteria: *"Any Δ ≠ 0 is escalated to the orchestrator and documented in 'Open Deltas' with remediation plan."*

## Threat Model Alignment

| Threat ID | Disposition | Status | Mitigation delivered |
|-----------|-------------|--------|----------------------|
| T-24-01 | mitigate | complete | SC-12 drift guard (01-T2) + cost-map-invariant test (03-T1) + REQ-coverage test (07-T3) |
| T-24-07 | mitigate | complete | SC-13 audit artefact with 13 ✅ covered rows; Open Deltas register for honest escalation |
| T-24-08 | mitigate | complete | Grandfather-subscriber-stability Deno test guards D-20 contract end-to-end |
| T-24-09 | mitigate | complete | REQ-coverage test — plan frontmatter drift from REQUIREMENTS.md fails CI |

## Known Stubs

None. All 5 artefacts are concrete (real tables, real tests, real commands). The 3 ⚠️ deferred rows in the validation map explicitly link to Open Delta #1 in 24-AUDIT.md — they are tracked deferrals, not stubs.

## Known Deferrals (not blocking close)

**Open Delta #1** (from `24-AUDIT.md §Open Deltas`): Plan 03 Tasks 3-4 (runtime-enforcement rewire of 5 feature edge handlers to call `getMaxOutput`/`validateInputBudget`) were not committed due to the worktree blocker recorded in `24-03-SUMMARY.md`. Impact: the SC-12 TS contract holds at build time (guarded by `sc12-snapshot.test.ts`), but runtime `maxTokens` caps in `analyze-resume`, `analyze-career`, `grade-linkedin`, `recruiting-lens`, and `interview-prep-analyze` still ship the Phase 15 literals (higher ceilings). A micro-plan will be spun to wire `getMaxOutput` + `validateInputBudget` into these 5 handlers. Phase 24 close does NOT wait on this because:
1. The TS source of truth is correct and guarded.
2. Cost-map parity (DB ↔ TS) is proven by `cost-map-invariant.test.ts`.
3. Grandfathering contract is untouched and actively regression-tested.

## Self-Check: PASSED

Files:
- `.planning/phases/24-.../24-AUDIT.md` — **EXISTS** (13 ✅ rows)
- `supabase/functions/_tests/grandfather-subscriber-stability.test.ts` — **EXISTS** (4 tests, all green)
- `src/config/__tests__/req-coverage.test.ts` — **EXISTS** (2 tests, all green)
- `.planning/REQUIREMENTS.md` §Phase 24 — **EXISTS** (13 REQ-ID bullets + traceability subgrid)
- `.planning/phases/24-.../24-VALIDATION.md` — **UPDATED** (nyquist_compliant: true, 28 rows, approval=ready)

Commits:
- `ac3e9ba` in `git log` — **FOUND**
- `ef25dbe` in `git log` — **FOUND**

Commands (re-verified 2026-04-22 at finalization):
- `npm test -- --run src/config/__tests__/req-coverage.test.ts` — **PASS** (2/2)
- `npm test -- --run src/config/__tests__/sc12-snapshot.test.ts` — **PASS** (pre-existing, 5/5)
- `deno test _tests/grandfather-subscriber-stability.test.ts --allow-env --allow-net --no-check` — **PASS** (4/4, 47ms)

## Handoff to /gsd-verify-work 24

Phase 24 is **ready for verification**. The next step is:

```
/gsd-verify-work 24
```

The verifier should:
1. Read `24-AUDIT.md` §Open Deltas and confirm Delta #1 acceptance is recorded (it is — see this SUMMARY's `checkpoint_resolution` frontmatter and `closure_status: approved`).
2. Read `24-VALIDATION.md` per-task map (28 rows, `nyquist_compliant: true`, `approval: ready`).
3. Read `.planning/REQUIREMENTS.md` §Phase 24 to confirm the 13 REQ-IDs exist and the traceability subgrid matches the shipped state.
4. Re-run the two CI guards (`req-coverage.test.ts` and `grandfather-subscriber-stability.test.ts`) as independent verification — both passed at finalization time.
5. Spin a micro-plan for Delta #1 remediation (wire `getMaxOutput` + `validateInputBudget` into the 5 feature edge handlers). Not blocking phase close.
