---
quick_id: 260712-msh
verified: 2026-07-12T22:10:00Z
status: passed
score: 17/17 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 16/17
  previous_verified: 2026-07-12T21:05:00Z
  gaps_closed:
    - "The saved goal appears in the dashboard hero and is editable from the hero and from Profile — client upserts to career_targets no longer 403; fixed by migration 20260712000003 (commit 39671c9c) adding user_id to the GRANT UPDATE column list."
  gaps_remaining: []
  regressions: []
method: |
  Same harness that caught the defect, rebuilt and hardened. Migrations A + B + C applied
  UNMODIFIED to real PostgreSQL 15 (docker) against a Supabase-shaped scaffold — now with a
  FAITHFUL auth.uid() (reading the `sub` claim off request.jwt.claims) and a real
  owner-scoped RLS policy carrying BOTH a USING (old-row) and a WITH CHECK (new-row) arm,
  so the row-hijack question could actually be settled rather than assumed. Real PostgREST
  v12.2.3 was run against it, and every flow was exercised over HTTP with HS256
  `role=authenticated` JWTs (anon-key posture — NEVER the service role, which bypasses
  column grants and is exactly why the gated-remote suite stayed green through the outage).
  Two distinct users were minted to test cross-tenant access. The new guards were
  mutation-tested in both directions. Containers torn down; working tree clean.
final_gate_run:  # 2026-07-13 — the two previously-unverified legs were RUN and are GREEN
  date: 2026-07-13
  gated_remote_suite:
    status: PASSED
    result: "12 passed | 0 failed (53s)"
    target: "PREVIEW project (cimjlt…) — confirmed NOT production (zjpjap…)"
    command: "DENO_TEST_SUPABASE_REMOTE=1 deno test --allow-all --no-check _tests/goal_readiness_test.ts"
    note: >-
      Ran against the REAL preview database, which has all three migrations applied
      (20260712000001/2/3 confirmed present via list_migrations). GR-11 — the positive-path
      privilege test that would have caught the 403 grant bug — PASSED. No output fabricated.
    tests:
      - "GR-01 missing LinkedIn is un-evidenced and RENORMALIZED OUT (never a zero) — ok"
      - "GR-02 partial evidence is flagged and quantified — ok"
      - "GR-03a raising resumes.overall_score 60->85 STRICTLY raises readiness — ok"
      - "GR-03b raising linkedin_grades.overall_score STRICTLY raises readiness — ok"
      - "GR-04 adding a LOW LinkedIn LOWERS readiness — INTENTIONAL and REQUIRED — ok"
      - "GR-05 re-running the scorer on unchanged evidence is byte-identical — ok"
      - "GR-06 writing to EACH of the 4 evidence tables recomputes readiness — ok"
      - "GR-07 user B cannot READ or WRITE user A's goal readiness — ok"
      - "GR-08 an authenticated user cannot forge goal_readiness_score on their OWN row — ok"
      - "GR-09 the raw professional_goal is byte-identical after parsing — ok"
      - "GR-10 rubric weights sum to 100 — ok"
      - "GR-11 an authenticated client CAN insert AND upsert its goal (and still cannot forge the score) — ok"
  playwright:
    status: PASSED
    result: "7 passed, 2 intentionally skipped, 0 failed (operator-run on this Mac)"
  preview_state: "All three migrations CONFIRMED applied to preview. MSH-ORDER is DISCHARGED — preview is consistent, not broken."
owed_to_operator:  # remaining after the 2026-07-13 gate run
  - id: MSH-DEF-05
    item: "ALL THREE migrations (20260712000001, 20260712000002, 20260712000003) remain OWED to PRODUCTION — unapplied (prod tip is 20260709000001, confirmed read-only). Production application is operator-approved only (CLAUDE.md)."
  - id: MSH-ORDER
    item: "STILL BINDING FOR PRODUCTION. Migration C MUST ship in the SAME batch as A, in order A -> B -> C. Verified load-bearing: A-without-C reproduces a total outage (goal saves 403; /dashboard unreachable because the gate requires a goal). Resolved on preview; NOT yet on prod."
resolved:  # closed by the 2026-07-13 gate run — do not re-open
  - id: MSH-DEF-03
    item: "Gated-remote rubric suite — RESOLVED. Ran against preview: 12 passed / 0 failed."
  - id: MSH-DEF-04
    item: "Playwright leg — RESOLVED. 7 passed, 2 intentionally skipped, 0 failed."
human_verification:
  - test: "Apply A+B+C to PRODUCTION as one ordered batch, then complete onboarding Step 4 as a NEW user and as a LEGACY user (resume, no goal)."
    expected: "Goal saves; redirect to /dashboard; hero shows the goal and a real Goal Readiness number."
    why_human: "Production migrations are operator-approved only (CLAUDE.md). Preview equivalent already proven green by the gated-remote suite."
---

# Quick Task 260712-msh: Anchor Product Around One Professional Goal — Verification

**Goal:** Onboarding Step 4, persist + edit the goal, surface it in the hero, replace the decorative "Live Readiness" with a REAL deterministic "Goal Readiness", remove "Every Version, Ranked" from the dashboard UI.

**Status:** `passed` — **17 of 17** must-haves verified. The one ship-blocking gap from the previous round is **closed and independently re-proven**.

**Re-verification:** Yes — after gap closure (`gaps_found` 16/17 → `passed` 17/17). No regressions.

---

## Gap Closure: the `GRANT UPDATE` defect

The previous round found that Migration A's `GRANT UPDATE` column list omitted `user_id`, so every client upsert to `career_targets` returned `403 / 42501` — the goal could never be saved, `/dashboard` was permanently unreachable, and `Profile.tsx`'s career-targets save was regressed.

**Fix:** `supabase/migrations/20260712000003_fix_career_targets_update_grant.sql` (commit `39671c9c`) — a **new additive migration** (correct call: A is already applied to preview and editing it would never re-run) adding `user_id` to the `GRANT UPDATE` list. Nothing else widened.

### 1. The three flows now succeed — both paths

Real PostgREST, `role=authenticated` JWT (anon-key posture, **not** service role):

| Flow | A+B only | A+B+C fresh insert | A+B+C on-conflict |
| --- | --- | --- | --- |
| Onboarding Step 4 finish (`Onboarding.tsx:305`) | **403** `42501` | ✓ **200** | ✓ **200** |
| Goal edit via `GoalEditDialog` (`useProfessionalGoal.ts:119`) | **403** `42501` | ✓ **200** | ✓ **200** |
| `Profile.tsx` career-targets save (`:302`) | **403** `42501` | ✓ **200** | ✓ **200** |

The goal persists (`professional_goal = 'PE analyst 2028'`) and the trigger fires inside the same write — `professional_goal_structured` was populated by the SECURITY DEFINER scorer, confirming the write path and the scorer are connected end-to-end.

### 2. The tamper hole did NOT reopen

All four trigger-owned columns remain unwritable by an authenticated client:

| Attack | Result |
| --- | --- |
| Forge `goal_readiness_score` | **403** `42501 permission denied` |
| Forge `goal_readiness_components` | **403** `42501` |
| Forge `goal_readiness_computed_at` | **403** `42501` |
| Forge `professional_goal_structured` | **403** `42501` |
| Call `compute_goal_readiness()` directly via RPC | **403** `permission denied for function` |

Tamper-resistance comes from what is **absent** from the grant list, not what is present — widening by `user_id` does not touch it.

### 3. Row-level safety is intact — the widened grant is not a hijack primitive

This was the one thing `GRANT UPDATE(user_id)` could plausibly have loosened, so I tested it explicitly with two distinct authenticated users under a real `user_id = auth.uid()` policy:

| Cross-tenant attempt (user A → user B's row) | Result |
| --- | --- |
| A **re-parents its own row** to B (`user_id = B`) | **403** — `new row violates row-level security policy` (the `WITH CHECK` arm rejects it) |
| A writes B's row directly (`PATCH ?user_id=eq.B`) | **204, zero rows affected** — the `USING` arm filtered B's row out; a silent no-op, not a write |
| A reads B's row | `[]` — empty |
| A upserts a row owned by B | **403** — `new row violates row-level security policy` |

**B's row verified byte-intact afterwards** (`B private goal`, unmodified). Re-parenting is impossible because RLS evaluates `WITH CHECK` against the *new* row: writing `user_id = B` fails `user_id = auth.uid()`. The granted privilege is exactly the one PostgREST needs to write `user_id = EXCLUDED.user_id` back onto **your own** row — a self-assignment no-op.

### 4. A-then-C ordering is load-bearing — confirmed

Applying **A + B without C reproduced the full outage**: all three flows returned `403 / 42501`. The SUMMARY's "C must ship in the same batch as A" constraint is correct and necessary. **If A+B are already on preview, preview onboarding is broken until C lands.**

### 5. The new regression guards bite in BOTH directions — mutation-tested

`_shared/goal-readiness-guard.test.ts` now parses the **effective** grant list as the union across migrations A and C (correctly — the privilege is cumulative) and asserts both directions. I mutation-tested it:

| Mutation | Guard |
| --- | --- |
| Baseline (fix in place) | ✓ **45 passed, 0 failed** |
| **Over-tight** — remove `user_id` from C (re-introduce the original bug) | ✗ **RED** |
| **Over-wide** — add `goal_readiness_score` to the grant (re-open the tamper hole) | ✗ **RED** |

This closes the exact blind spot that let the bug ship: the old guard only asserted the score *cannot* be written, never that the goal *can* be. Both properties are now enforced, so an over-tight grant can no longer pass a green suite.

---

## Observable Truths — 17/17

| # | Truth | Status |
| --- | --- | --- |
| 1 | Legacy user (resume, no goal) cannot reach `/dashboard`; lands on Step 4 without repeating 1-3 | ✓ VERIFIED |
| 2 | Onboarding shows "Step N of 4" at 25/50/75/100% | ✓ VERIFIED |
| 3 | Step 4 renders the exact locked copy and requires a non-empty goal | ✓ VERIFIED |
| 4 | No goal inferred/backfilled; raw wording preserved verbatim | ✓ VERIFIED |
| 5 | **Goal appears in hero and is editable from hero and Profile** | ✓ **VERIFIED — gap closed** (was ✗ FAILED; all three upserts now 200 on both paths) |
| 6 | ZERO incremental AI calls / token cost, by construction | ✓ VERIFIED |
| 7 | Computed server-side on WRITE, PERSISTED; dashboard only READS | ✓ VERIFIED |
| 8 | Recomputes on EVERY evidence change via DB triggers | ✓ VERIFIED |
| 9 | Pure function of persisted evidence — same evidence in, same score out | ✓ VERIFIED |
| 10 | Hero number, hero MiniMeters, command card, Readiness Matrix headline all render the SAME persisted value | ✓ VERIFIED |
| 11 | Missing LinkedIn = MISSING DATA, renormalized OUT of the denominator, never 0 | ✓ VERIFIED |
| 12 | UI clearly indicates PARTIAL evidence | ✓ VERIFIED |
| 13 | Score rises when evidence scores rise, holding the evidence set constant | ✓ VERIFIED |
| 14 | Adding a NEW low-scoring source can LOWER the score (§8f, intentional) | ✓ VERIFIED |
| 15 | Persisted score is owner-scoped and NOT client-writable | ✓ VERIFIED (re-proven under a real `auth.uid()` RLS policy, incl. cross-tenant) |
| 16 | "Every Version, Ranked" + 2-tab shell gone; SavedJobsDashboard renders directly | ✓ VERIFIED |
| 17 | All existing data preserved (additive migrations + rollback SQL) | ✓ VERIFIED (C is additive: one idempotent GRANT, no REVOKE, no rows, no RLS touched, rollback SQL present) |

Findings 1-4, 6-14, 16-17 were established in round 1 against the same harness and are unchanged by the fix; the fix touches only grants, and the full suites were re-run to confirm no regression. Round-1 evidence retained below.

## Round-1 evidence (retained — still valid)

- **Zero AI:** no `score-goal-alignment` function; `cors-audit.test.ts` still `20` and `sanitizer-coverage.test.ts` still `5` (**neither file was ever touched**); zero AI references across the commits; the scorer is plpgsql with no `pg_net`/`http`/`net.*` and structurally cannot reach a model. The guard **fails closed** — injecting `net.http_post('https://api.anthropic.com/...')` produced 3 failures.
- **The score is real:** live-fired triggers proved renormalization drops missing LinkedIn from **both** numerator and denominator (`evidenced_weight = 75`, not 100); an independent hand-recompute matched the persisted value exactly (86 = 86); monotonic (resume 80→95 lifted 86→91); byte-reproducible; the §8f intentional drop reproduced (91→77); no recursion; scorer `UPDATE`s, never upserts; trigger DDL correctly splits `AFTER INSERT` from `AFTER UPDATE … WHEN (OLD… IS DISTINCT FROM NEW…)`.
- **One source of truth:** `careerReadiness` = 0 occurrences; hardcoded `76`/`84` gone; `CareerRadar`'s local average deleted; `radarItems` survives *as a name only*, now fed by the persisted rubric components.
- **`goal-readiness.ts`** is a genuine read-only parser — no weights, no renormalization, no summation, no rounding, no clamp.
- **Removal is UI-only:** `/results/*`, `/improvements/*`, `/history` and all resume/analysis/comparison data untouched.
- **Tests reconciled, not weakened:** assertions inverted (`toBeVisible()` → `toHaveCount(0)`) plus a positive assertion proving *replacement*; `global-setup.ts` **seeds** the goal rather than loosening the gate.
- **Observations (not gaps):** the scorer's `EXCEPTION WHEN OTHERS` swallows errors into a `WARNING` to protect the money path (deliberate; a scorer bug surfaces as a stale score, not a loud failure). Deterministic parsing does not resolve abbreviations — the CONTEXT's own canonical `"IB internship 2027 in NY"` yields `role: null` (the taxonomy has "Investment Banking", not "IB"); spec-compliant, since it never guesses, and `goal_alignment` still anchors via selected target roles/industries.

## Gates executed on this machine

| Gate | Result |
| --- | --- |
| vitest | ✓ **570 passed** (90 files) |
| offline deno (`test:edge`) | ✓ **1190 passed, 0 failed, 12 ignored** (was 1179; +11 new grant/tamper guards) |
| `goal-readiness-guard.test.ts` | ✓ **45 passed, 0 failed** (was 35) |
| Playwright leg | ✓ **7 passed, 2 intentionally skipped, 0 failed** (2026-07-13) |
| Gated-remote rubric suite | ✓ **12 passed, 0 failed** against real PREVIEW (2026-07-13) |
| `npm run build` | ✓ exit 0 |
| `npm run lint` | ✓ 0 errors (159 pre-existing warnings) |
| `npm run type-check` | ✓ 8 errors — **proven pre-existing**: identical 8 in `src/components/ui/chart.tsx` (recharts drift) on the pre-task commit `a6887f3a`. This task added **zero** type errors. |

## Final gate run — 2026-07-13

Both previously-unverified legs were RUN and are GREEN. `verify:baseline` is now fully discharged
on this machine.

**Gated-remote suite** — `DENO_TEST_SUPABASE_REMOTE=1 deno test --allow-all --no-check
_tests/goal_readiness_test.ts`, against the REAL preview database (`cimjlt…`; confirmed NOT
production `zjpjap…`), which has all three migrations applied:

```
running 12 tests from ./_tests/goal_readiness_test.ts
GR-01: missing LinkedIn is un-evidenced and RENORMALIZED OUT (never a zero) ... ok (5s)
GR-02: partial evidence is flagged and quantified ... ok (3s)
GR-03a: raising resumes.overall_score 60 -> 85 STRICTLY raises readiness ... ok (4s)
GR-03b: raising linkedin_grades.overall_score STRICTLY raises readiness ... ok (4s)
GR-04: adding a LOW LinkedIn LOWERS readiness — INTENTIONAL and REQUIRED ... ok (4s)
GR-05: re-running the scorer on unchanged evidence is byte-identical ... ok (4s)
GR-06: writing to EACH of the 4 evidence tables recomputes readiness ... ok (6s)
GR-07: user B cannot READ or WRITE user A's goal readiness ... ok (6s)
GR-08: an authenticated user cannot forge goal_readiness_score on their OWN row ... ok (4s)
GR-09: the raw professional_goal is byte-identical after parsing ... ok (3s)
GR-11: an authenticated client CAN insert AND upsert its goal (and still cannot forge the score) ... ok (6s)
GR-10: rubric weights sum to 100 ... ok (0ms)

ok | 12 passed | 0 failed (53s)
```

GR-11 is the test that would have caught the 403 grant bug. It now passes against a real
database. Nothing here was fabricated.

**MSH-ORDER is DISCHARGED ON PREVIEW.** `list_migrations` confirms preview carries
`20260712000001`, `20260712000002` AND `20260712000003`. Preview is consistent, not broken.

## Still owed to the operator

1. **All three migrations are unapplied to PRODUCTION** (prod tip is `20260709000001`, confirmed
   read-only). Operator-approved only (CLAUDE.md).
2. **Migration C must ship in the SAME batch as A, in order A → B → C.** A-without-C reproduces
   a total outage (goal saves 403; `/dashboard` unreachable because the gate requires a goal).
   Proven load-bearing. Resolved on preview; **still binding for production.**

---

_Verified: 2026-07-12 · Verifier: Claude (gsd-verifier)_
_Method: real PostgreSQL 15 + real PostgREST v12.2.3 (docker), migrations A+B+C applied unmodified, faithful `auth.uid()` + owner-scoped RLS (USING + WITH CHECK), two authenticated users, anon-key JWTs only (never service role). Guards mutation-tested in both directions. Containers torn down; working tree clean._
