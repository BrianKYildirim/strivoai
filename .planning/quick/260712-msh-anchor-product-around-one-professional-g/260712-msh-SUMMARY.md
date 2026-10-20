---
quick_id: 260712-msh
phase: quick-260712-msh
plan: 01
type: execute
status: complete-with-owed-verification
subsystem: [onboarding, dashboard, database, auth-gating]
tags: [professional-goal, goal-readiness, zero-ai, plpgsql-trigger, renormalization, resume-vault-removal]

requires:
  - career_targets, resumes, linkedin_grades, analysis_results (existing tables)
  - src/lib/dashboard-intelligence/ (existing normalized signal layer)
provides:
  - career_targets.professional_goal (raw, verbatim, user-typed)
  - career_targets.goal_readiness_score + goal_readiness_components (trigger-owned, persisted)
  - compute_goal_readiness() — the ONE deterministic zero-AI scorer
  - parseGoalReadiness() — read-only parser (no scoring math)
  - Route/data goal gate (no goal, no dashboard)
affects:
  - src/pages/Onboarding.tsx (4 steps), src/pages/Dashboard.tsx (one source of truth), src/pages/Profile.tsx

tech-stack:
  added: []          # ZERO new dependencies. ZERO new edge functions. ZERO new AI calls.
  patterns:
    - Postgres AFTER INSERT/UPDATE triggers -> SECURITY DEFINER plpgsql scorer (compute-on-write, persist, read-on-load)
    - Column-level GRANTs for tamper-resistance (RLS gates rows, not columns)
    - Renormalization over EVIDENCED components only (missing data is dropped, never zeroed)

key-files:
  created:
    - supabase/migrations/20260712000001_add_professional_goal_and_readiness_columns.sql
    - supabase/migrations/20260712000002_goal_readiness_scorer_and_triggers.sql
    - supabase/migrations/20260712000003_fix_career_targets_update_grant.sql   # CORRECTIVE — see "The GRANT Bug"
    - supabase/functions/_shared/goal-readiness-guard.test.ts
    - supabase/functions/_tests/goal_readiness_test.ts
    - src/lib/taxonomies.ts
    - src/lib/dashboard-intelligence/goal-readiness.ts
    - src/lib/dashboard-intelligence/goal-readiness.test.ts
    - src/hooks/useProfessionalGoal.ts
    - src/hooks/__tests__/useOnboardingStatus.test.ts
    - src/components/dashboard/GoalEditDialog.tsx
  modified:
    - src/pages/Onboarding.tsx, src/pages/Dashboard.tsx, src/pages/Profile.tsx
    - src/components/ProtectedRoute.tsx, src/hooks/useOnboardingStatus.ts
    - src/lib/dashboard-intelligence/{types,index}.ts
    - e2e/global-setup.ts, e2e/dashboard-intelligence.spec.ts, src/pages/Dashboard.test.tsx

metrics:
  tasks: 7
  commits: 7
  completed: 2026-07-12
---

# Quick 260712-msh: Anchor the Product Around ONE Professional Goal — Summary

Strivo now anchors on ONE user-typed professional goal. Onboarding gained a required Step 4
(25/50/75/100), the goal is route-gated (no goal, no dashboard), and the dashboard's three
decorative readiness numbers were replaced by a **real, deterministic, ZERO-AI Goal Readiness
score** computed server-side by a plpgsql trigger on every evidence write and merely *read* on
load. "Every Version, Ranked" and its tab shell are gone from the UI (UI only).

> **A prior executor was cut off mid-run by a session limit** after completing Tasks 1-4
> (commits `0e3cad47`, `d1cb10ff`, `cbaa8717`, `a00581a2`). This session executed **Tasks 5, 6,
> and 7** on top of what actually shipped (not what the plan predicted), and did not redo 1-4.

---

## ⚠️ READ FIRST — Owed to the Operator

Two things are **NOT discharged** and require the operator. Neither is a silent skip.

### 1. THREE production migrations are OWED

Applied to **PREVIEW ONLY** (`cimjltzovkahkqecpwgi`). Production (`zjpjapgraoxdukdvpjes`) is
**untouched**, per CLAUDE.md (production migrations are operator-approved only).

| # | Migration file | Applied to preview | Applied to prod |
|---|---|---|---|
| A | `supabase/migrations/20260712000001_add_professional_goal_and_readiness_columns.sql` | ✅ (by prior executor) | ❌ **OWED** |
| B | `supabase/migrations/20260712000002_goal_readiness_scorer_and_triggers.sql` | ✅ (by prior executor) | ❌ **OWED** |
| **C** | **`supabase/migrations/20260712000003_fix_career_targets_update_grant.sql`** | ❌ **NOT YET** | ❌ **OWED** |

> **🚨 C IS NOT OPTIONAL AND IT IS NOT A POLISH ITEM.** Migration A shipped a `GRANT UPDATE`
> column list that omitted `user_id`, which broke **every** client write to `career_targets`.
> **A and B must NEVER be applied to production without C in the same batch** — applying A alone
> makes the dashboard permanently unreachable for every user. See "The GRANT Bug" below.
>
> **If A and B are already live on preview, preview onboarding is broken RIGHT NOW.** Apply C to
> preview to unbreak it.

All three are additive-only, fully re-runnable (`IF NOT EXISTS` / `OR REPLACE` / re-granting an
already-held privilege is a no-op), and write **zero rows** (no goal is ever backfilled).
*Caveat: this session could not independently re-verify the preview application of A and B — no
preview credentials in this workspace. The claim is carried forward from the prior executor's
Task 1/2 commits and should be re-confirmed at apply time.*

**Rollback SQL — Migration C (run FIRST if rolling back all three):**
```sql
BEGIN;
-- Drops ONLY the column privilege C added, restoring the exact post-A grant list.
-- NOTE: this deliberately restores the BROKEN state — every client upsert of
-- career_targets will 403 again. Roll back C only together with A and B.
REVOKE UPDATE (user_id) ON public.career_targets FROM authenticated;
COMMIT;
```

**Rollback SQL — Migration B (run FIRST, it depends on A):**
```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_goal_readiness_resumes_ins  ON public.resumes;
DROP TRIGGER IF EXISTS trg_goal_readiness_resumes_upd  ON public.resumes;
DROP TRIGGER IF EXISTS trg_goal_readiness_linkedin_ins ON public.linkedin_grades;
DROP TRIGGER IF EXISTS trg_goal_readiness_linkedin_upd ON public.linkedin_grades;
DROP TRIGGER IF EXISTS trg_goal_readiness_analysis_ins ON public.analysis_results;
DROP TRIGGER IF EXISTS trg_goal_readiness_analysis_upd ON public.analysis_results;
DROP TRIGGER IF EXISTS trg_goal_readiness_targets_ins  ON public.career_targets;
DROP TRIGGER IF EXISTS trg_goal_readiness_targets_upd  ON public.career_targets;
DROP FUNCTION IF EXISTS public.tg_goal_readiness();
DROP FUNCTION IF EXISTS public.compute_goal_readiness(uuid);
DROP FUNCTION IF EXISTS public.parse_professional_goal(text);
DROP FUNCTION IF EXISTS public.goal_readiness_tokens(text);
DROP FUNCTION IF EXISTS public.goal_readiness_flatten(jsonb);
DROP FUNCTION IF EXISTS public.goal_readiness_arrlen(jsonb);
COMMIT;
```

**Rollback SQL — Migration A (run LAST — C, then B, then A):**
```sql
BEGIN;
-- restore the pre-migration blanket table privileges
REVOKE INSERT, UPDATE ON public.career_targets FROM anon, authenticated;
GRANT  INSERT, UPDATE ON public.career_targets TO   anon, authenticated;

DROP INDEX IF EXISTS public.idx_analysis_results_user_type_created;
DROP INDEX IF EXISTS public.idx_resumes_user_created;

DROP TABLE IF EXISTS public.goal_taxonomy;

ALTER TABLE public.career_targets
  DROP CONSTRAINT IF EXISTS career_targets_professional_goal_length_check;
ALTER TABLE public.career_targets
  DROP COLUMN IF EXISTS goal_readiness_computed_at,
  DROP COLUMN IF EXISTS goal_readiness_components,
  DROP COLUMN IF EXISTS goal_readiness_score,
  DROP COLUMN IF EXISTS professional_goal_set_at,
  DROP COLUMN IF EXISTS professional_goal_structured,
  DROP COLUMN IF EXISTS professional_goal;
COMMIT;
```

---

## 🐛 The GRANT Bug — a CRITICAL post-ship defect, and the test-suite gap that hid it

Found by the verifier **after** the seven tasks above were marked complete and green. Fixed in a
follow-up session by corrective migration **C** (`20260712000003_fix_career_targets_update_grant.sql`).

### What was broken

Migration A's tamper-resistance used column-level `GRANT`/`REVOKE` — the **correct** mechanism
(RLS gates *rows*, not *columns*; only a column grant stops a user from forging
`goal_readiness_score = 100` on their own row). But its `GRANT UPDATE (...)` column list
**omitted `user_id`**.

All three client writers upsert with `user_id` present, and PostgREST implements
`.upsert(..., { onConflict: 'user_id' })` with the merge-duplicates preference, emitting:

```sql
INSERT INTO career_targets (user_id, ...) VALUES (...)
ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id, ...;
```

That requires `UPDATE(user_id)`. **Postgres checks column privileges at execution start, not at
conflict time** — so the missing privilege on the `DO UPDATE` arm aborted the statement *even on
the fresh-INSERT path*, where no conflict fires at all.

Reproduced by the verifier over real HTTP against real Postgres 15 + PostgREST v12.2.3 with a
`role=authenticated` JWT. All three flows returned **403 / SQLSTATE 42501 permission denied**:

| Flow | Impact |
|---|---|
| Onboarding Step 4 "Finish Setup" (`Onboarding.tsx`) | **The professional goal could never be saved.** |
| Goal edit — dashboard hero + Profile (`GoalEditDialog` → `useProfessionalGoal.ts`) | Could never edit the goal. |
| `Profile.tsx` career-targets save | **REGRESSION** — this flow worked *before* this task. |

**Blast radius: total.** The new `ProtectedRoute` gate requires a goal to reach `/dashboard`, so a
goal that can never be saved made **the dashboard permanently unreachable for every user**.

### The fix

Add `user_id` — and *only* `user_id` — to the `GRANT UPDATE` column list. Delivered as a **new**
migration, not an edit to A: A had already been applied to preview, and editing an applied
migration does not re-run it, so the fix would silently never reach the database.

**The tamper hole does not reopen.** Tamper-resistance comes from what is *absent* from the grant
list, not what is present: `goal_readiness_score`, `goal_readiness_components`,
`goal_readiness_computed_at` and `professional_goal_structured` remain absent, so forging them
still 403s with 42501 (the verifier confirmed this empirically, and GR-11 asserts it). And
`UPDATE(user_id)` is **not** a row-hijack primitive — the unchanged owner-scoped RLS policy
(`user_id = auth.uid()`) still decides *which row* you may touch, on both the `USING` and
`WITH CHECK` side. The granted privilege is exactly the one PostgREST needs to write
`user_id = EXCLUDED.user_id` back onto **your own** row: a self-assignment no-op.

### Why 1,749 green tests missed it

**Every existing assertion tested that the score CANNOT be written. Nothing tested that the goal
CAN be.** Those are independent properties, and A satisfied the first while breaking the second
for every user. A suite that only ever asserts *denial* will happily certify a product in which
nothing works at all.

Two specific blind spots:

1. **The offline guard (`goal-readiness-guard.test.ts`) only asserted exclusions.** It looped over
   the four trigger-owned columns asserting each was absent from the grant list. An empty grant
   list would have passed every one of those assertions.
2. **The gated-remote suite writes `career_targets` via `admin()` — the SERVICE ROLE — which
   BYPASSES column grants entirely.** Its `saveGoal()` helper never exercised the privilege path
   the browser actually takes, so it stayed green through a total client-write outage. (It also
   self-skips without preview credentials, so it wasn't even running here.)

### The regression guards added

| Guard | Where | Runs in-gate? |
|---|---|---|
| **Effective-grant parser** — computes the grant list as the **UNION across all migrations** (grants accumulate; no single file is the source of truth) | `_shared/goal-readiness-guard.test.ts` | ✅ **yes** (`test:ci` → `test:edge` → `verify:baseline`) |
| 8 × `INCLUDES client-writable <col>` — every column a real client upsert sends must be in **both** the INSERT and UPDATE grant | ″ | ✅ yes |
| `user_id is UPDATE-grantable — PostgREST upsert needs it` — the exact bug, called out on its own | ″ | ✅ yes |
| `the blanket privilege is never re-granted` — blocks the lazy `GRANT UPDATE ON career_targets` "fix" that would re-open the tamper hole | ″ | ✅ yes |
| 4 × `EXCLUDES <trigger-owned col>` — **strengthened** to check the union, so a future corrective migration can't quietly widen the grant | ″ | ✅ yes |
| **GR-11** — an authenticated client (real anon-key + `role=authenticated` JWT, *not* service role) CAN fresh-insert, CAN upsert-on-conflict, CAN do the Profile.tsx save, and still CANNOT forge `goal_readiness_score` or `professional_goal_structured` | `_tests/goal_readiness_test.ts` | ⚠️ gated-remote — self-skips without preview creds (see §2 below) |

The offline guard is deliberately where the weight sits, **because the gated-remote suite cannot
run on this machine** — a guard that only runs somewhere else is not a guard. All four failure
modes were **mutation-tested**: reverting the fix, adding `goal_readiness_score` to the grant, and
substituting a blanket grant each turn the suite **red**.

---

### 2. The gated-remote rubric suite was NOT run — it is OWED (MSH-DEF-03)

**I could not produce its output, and I did not fabricate it.**

`supabase/functions/_tests/goal_readiness_test.ts` (GR-01 … GR-11, incl. the new GR-11 positive-path
privilege proof added with corrective migration C) requires:
`DENO_TEST_SUPABASE_REMOTE=1`, `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`,
`SUPABASE_TEST_ANON_KEY`. In this workspace:

- `.env.test.local` **does not exist** (only `.env.test.local.example`). Per the recorded
  two-device workflow, the real secrets live on the Windows box.
- The Supabase CLI *is* authenticated, but is linked to **production**, and pulling the preview
  **service-role key** out of it would mean printing/storing it — which **CLAUDE.md explicitly
  forbids**. I deliberately did not do this.
- No Supabase MCP tools were available in this executor's toolset.

What the suite DID do offline (as designed — it self-skips, it does not fail):
```
[SKIP] GR-09 — needs DENO_TEST_SUPABASE_REMOTE=1 + SUPABASE_TEST_URL +
       SUPABASE_TEST_SERVICE_ROLE_KEY + SUPABASE_TEST_ANON_KEY (preview project).
GR-09: the raw professional_goal is byte-identical after parsing ... ok (0ms)
GR-10: rubric weights sum to 100 ... ok (0ms)

ok | 1179 passed | 0 failed | 12 ignored (4s)
```

**A green offline gate does NOT discharge this.** The operator must run, against preview:

```bash
DENO_TEST_SUPABASE_REMOTE=1 \
SUPABASE_TEST_URL=... SUPABASE_TEST_SERVICE_ROLE_KEY=... SUPABASE_TEST_ANON_KEY=... \
deno test supabase/functions/_tests/goal_readiness_test.ts --no-check --allow-env --allow-net
```

It proves, against the REAL SQL scorer: renormalization (missing LinkedIn is never a zero),
partial-evidence flagging, monotonicity, the intentional-drop case, reproducibility, trigger
coverage on all four evidence tables, owner-scoping, non-writability, and byte-preservation of
the raw goal wording.

---

## Zero-AI Confirmation (§9a / §9b / §9g) — the load-bearing constraint

**Goal Readiness adds ZERO incremental Anthropic/LLM calls and ZERO incremental token cost.**
This is **structural, not disciplinary**: the scorer is plpgsql, and SQL cannot call Anthropic.

| Check | Result |
|---|---|
| `supabase/functions/score-goal-alignment/` exists? | **No.** Only referenced by the guard that asserts its absence. |
| `pg_net` / `http_post` / `net.*` / `anthropic` in the scorer migration? | **None.** |
| `cors-audit.test.ts:55` — `USER_FUNCTIONS.length, 20` | ✅ **still 20** (NOT bumped to 21) |
| `sanitizer-coverage.test.ts:130` — `AI_INGESTERS.length, 5` | ✅ **still 5** (NOT bumped to 6) |
| Both guard files touched by this task? | **No** — last touched by unrelated commit `70cd9fad`. |
| `invoke` / `anthropic` anywhere in `Dashboard.tsx`? | **None.** |
| `invoke` in `useProfessionalGoal.ts` / `GoalEditDialog.tsx`? | **None.** No edge-function call, no recompute latch. |

The dashboard's **entire** readiness compute path on load is: **one column read + a parse.**

---

## The Rubric — Weights and Deterministic Parsing (read out of the shipped migration)

### Weight distribution (Σ = 100), from `compute_goal_readiness()`

| id | label | weight | evidenced when | score source |
|---|---|---|---|---|
| `resume_quality` | Resume Quality | **25** | latest resume has non-null `overall_score` | `resumes.overall_score` |
| `goal_alignment` | Goal Alignment | **25** | resume evidenced AND ≥1 goal term | deterministic hit-rate of goal terms (parsed role/industry + `target_roles`/`target_industries`) against the resume's `suggestedTargetRoles` / `strengths` / `executiveSummary.keyStrengths` / `industryGuess`; scaled by ATS coverage (full coverage leaves base intact, zero coverage scales to 65%) |
| `goal_keyword_coverage` | ATS Keyword Coverage | **15** | Recruiting Lens keyword split exists, else resume `recommendedKeywords` present | **Best:** `matched / (matched + missing)` from persisted Recruiting Lens. **Fallback (INVERTED):** `recommendedKeywords` is a *gap* list per the resume prompt contract, so more entries = worse coverage → `100 - 3 × min(gap, 25)` |
| `linkedin_strength` | LinkedIn Strength | **15** | a `linkedin_grades` row exists | `linkedin_grades.overall_score` |
| `evidence_depth` | Demonstrated Impact | **10** | resume evidenced | `40 + strengths×10 − priorityImprovements×5`, both capped at 6, clamped 0-100 |
| `profile_consistency` | Profile Consistency | **10** | resume **AND** LinkedIn both evidenced | token overlap (len ≥ 4, deduped, sorted) between resume roles/strengths/industry and LinkedIn keyStrengths/profileInsights/sectionBreakdown |

**Renormalization (§8d) — the load-bearing formula:**
```
score = ROUND(100 * SUM(score/100 × weight) FILTER (WHERE evidenced)
                  /  SUM(weight)            FILTER (WHERE evidenced))
```
Un-evidenced components are dropped from **BOTH** numerator and denominator. They are **never
scored 0**, and they **never lower the achievable ceiling**. (Deliberately *not* modelled on
`normalizeFromSections` in `grade-linkedin/schema.ts`, which plain-sums and would reintroduce
exactly the silent missing-LinkedIn penalty this design bans.)

### Deterministic goal parsing (`parse_professional_goal`, §9e) — no model call, ever

The user's raw `professional_goal` is **NEVER modified**. Output goes only to
`professional_goal_structured`. Every field is nullable; nothing is ever guessed.

- **role / industry** — case-insensitive substring match against `goal_taxonomy` (seeded from
  `src/lib/taxonomies.ts`: 39 roles, 40 industries). **Longest match wins**; deterministic
  tie-break `length(term) DESC, term ASC`.
- **year** — first 4-digit `20xx` (`substring(goal FROM '(20[0-9]{2})')`).
- **opportunity_type** — fixed keyword list, scanned in fixed order: `internship`, `co-op`,
  `full-time`, `graduate`, `apprenticeship`, `fellowship`, `analyst`, `associate`, `placement`.
- **location** — best-effort only: 1-3 capitalized tokens directly after the word "in". If the
  pattern does not match, the field stays **NULL**. It never guesses.

Canonical: `"Investment Banking Internship in New York — 2027"` →
`{ role: "Investment Banking", industry: "Investment Banking", location: "New York", opportunity_type: "internship", year: "2027" }`.

---

## What Shipped, Task by Task

### Tasks 1-4 — prior executor (read from their commits)

**Task 1 (`0e3cad47`) — Migration A: columns, taxonomy, tamper-resistance.**
Added to `career_targets`: `professional_goal` (raw, `CHECK length <= 500`),
`professional_goal_structured` (jsonb), `professional_goal_set_at`, and the three **trigger-owned**
columns `goal_readiness_score` / `goal_readiness_components` / `goal_readiness_computed_at`.
Created `goal_taxonomy` (role/industry reference list, RLS-readable by `authenticated`, seeded
idempotently from the same lists `Onboarding.tsx` renders). Extracted `ROLE_OPTIONS` /
`INTEREST_OPTIONS` verbatim into `src/lib/taxonomies.ts` so the TS list and the SQL seed have one
authorable source. Added `idx_resumes_user_created` + `idx_analysis_results_user_type_created`.

> **Tamper-resistance is COLUMN-LEVEL GRANTs, not a guard trigger.** RLS gates *rows*, not
> *columns* — a user passing owner-scoped RLS could otherwise forge their own score. The migration
> `REVOKE`s blanket `INSERT, UPDATE` on `career_targets` from `anon, authenticated` and re-`GRANT`s
> an explicit column list that **excludes** all three `goal_readiness_*` columns and
> `professional_goal_structured`. A `session_user <> 'authenticated'` guard would have been a
> **no-op**: PostgREST connects as the login role `authenticator` and then `SET LOCAL ROLE
> authenticated`, so `session_user` is *never* `authenticated` and such a guard always passes —
> silently leaving the score client-writable while every test stayed green.

**Task 2 (`d1cb10ff`) — Migration B: the deterministic zero-AI scorer + evidence triggers.**
`compute_goal_readiness(uuid)` (`SECURITY DEFINER`, `SET search_path = public`) reads only
already-persisted evidence, renormalizes, and persists score + full breakdown +
`professional_goal_structured`. Key decisions baked in:

- **Money-path early exit (first statement).** The scorer runs *inside the caller's statement*, and
  one caller is the `resumes` trigger on the `analyze-resume` refund-boundary save tail.
  `EXCEPTION WHEN OTHERS` catches scorer *errors* but **does NOT catch `statement_timeout`** — a slow
  scorer could abort a user's resume save. So: one indexed lookup on `career_targets`; if there is no
  goal, `RETURN` immediately. This is the common case *and always* the case during onboarding (the
  `resumes` INSERT lands before the goal is saved).
- **Triggers on all 4 evidence tables, INSERT and UPDATE SPLIT.** `AFTER INSERT OR UPDATE … WHEN
  (OLD.col IS DISTINCT FROM NEW.col)` **does not compile** (`OLD cannot be referenced in ON INSERT
  trigger`), and that `WHEN` clause *is* the recursion guard — so every conditional trigger is two
  triggers. 8 total across `resumes`, `career_targets`, `linkedin_grades`, `analysis_results`.
- **Recursion guard = the column-scoped `WHEN`,** not `pg_trigger_depth()` (which is already ≥ 1
  inside a trigger, so a `= 0` condition would never fire and the score would silently never
  recompute). The scorer writes only `goal_readiness_*` + `professional_goal_structured`, none of
  which appear in the `career_targets` UPDATE predicate.
- **Persist with `UPDATE`, never an upsert** — an `INSERT … ON CONFLICT` would re-fire the
  unconditional `AFTER INSERT` trigger on `career_targets` and defeat the guard.
- **Resilience:** the body is wrapped in `EXCEPTION WHEN OTHERS → RAISE WARNING; RETURN`. A failed
  recompute must never lose a user's resume analysis; the score just goes stale.
- **Purity:** no `random()`, no clock in the score math (`clock_timestamp()` only stamps
  `computed_at`, and is kept OUT of the breakdown so "same evidence in → byte-identical breakdown
  out" holds); "latest" is always `ORDER BY created_at DESC, id DESC LIMIT 1`.
- **Grants:** `REVOKE ALL … FROM public, anon, authenticated` on every function — per project
  memory, `REVOKE FROM public` alone is NOT sufficient on Supabase.

**Task 3 (`cbaa8717`) — rubric proofs (gated-remote) + in-gate static guard.**
`_shared/goal-readiness-guard.test.ts` (offline, inside `verify:baseline`) fail-closes on: zero-AI
(no `pg_net`/`http_post`/`net.`/`anthropic`), trigger coverage on all four tables (INSERT + UPDATE
each), the renormalized `FILTER (WHERE evidenced)` denominator, tamper-resistance (grant list
excludes the readiness columns; no `session_user` gate; explicit `anon`+`authenticated` revokes),
taxonomy parity (SQL seed ≡ `taxonomies.ts`, compared as sets both ways), no parallel scorer in the
TS parser, "UPDATEs never INSERTs", and the money-path early exit + both indexes.
`_tests/goal_readiness_test.ts` (gated-remote, GR-01…GR-10) — **see the OWED section above.**

**Task 4 (`a00581a2`) — `useProfessionalGoal` + required Onboarding Step 4.**
One shared data seam: reads the goal + persisted readiness; `saveGoal(raw)` partial-upserts on
`user_id` (never clobbers `target_roles`/`target_industries`), writes **neither**
`professional_goal_structured` **nor** any `goal_readiness_*` column (trigger-owned and
DB-rejected). **No `refreshAlignment()`, no invoke, no AI** — the trigger recomputes inside the same
transaction, so `saveGoal` just invalidates the query. Onboarding became 4 steps (25/50/75/100) with
the exact locked copy, `maxLength={500}` matching the DB CHECK, and a legacy-user fork that opens
**directly on Step 4** ("Steps 1-3 complete") without ever repeating Steps 1-3.

### Task 5 (`39313e49`) — Route/data goal gate

- **`ProtectedRoute.tsx`**: the `resumes` lookup and a new `career_targets.professional_goal`
  lookup now run under **`Promise.all`** — the gate adds **no serial round-trip** to every protected
  navigation. `hasResume && !hasGoal → /onboarding`. The **fail-open posture is preserved exactly**:
  the 6s timeout, the `console.error`-and-continue, and the catch-block fail-open all stay, and the
  new redirect is ANDed with `!goalError` so a goal-check *error* can never trap a user — only a
  definitive "no goal" redirects.
- **`useOnboardingStatus.ts`**: added `hasProfessionalGoal` + `professionalGoal`;
  `hasCompletedOnboarding` became `hasResume && hasProfessionalGoal`. `profileStrength` math
  untouched.
- **`useOnboardingStatus.test.ts`** (new, 5 cases): resume+goal → complete; **resume, NO goal →
  NOT complete** (the load-bearing legacy-user case); whitespace-only goal → rejected; no
  `career_targets` row → rejected; no resume → rejected.
- **`e2e/global-setup.ts`**: seeds `career_targets.professional_goal` for the E2E user, idempotently,
  alongside the existing resume seed. **The gate was SEEDED, never weakened** — without this the new
  gate would bounce the E2E user off `/dashboard`, failing `auth.setup.ts` and cascading into every
  spec that depends on `storageState`.

### Task 6 (`c7cdc396`) — Dashboard rewire (one source of truth) + ResumeVault removal

- **`goal-readiness.ts` — a READ-ONLY PARSER.** No weight constants, no renormalization, no scoring
  math. It validates the persisted jsonb into a render model and returns a **safe model on malformed
  input rather than throwing** (the `profile-alignment.ts` defensive posture). 26 vitest cases,
  including a mirror of the Deno static guard so *both* gates go red if the math is ever regrown
  client-side.
- **DELETED, not renamed:** the decorative `careerReadiness` formula **and its full prop plumbing**
  (the `careerReadiness=` pass, the destructure, and the prop type), the hardcoded `76` / `84`
  MiniMeter literals, the decorative `radarItems` math (`latestResumeScore - 4` / `+ 3` /
  `latestLinkedInScore - 8`), and the local `average` in `CareerRadar`.
- **One source of truth (§8a):** the hero big number, the hero MiniMeters, the Goal Readiness command
  card, and the Readiness Matrix headline **all** render the same persisted value.
- **Missing data, never a 0% bar:** un-evidenced components render "Needs data" on a muted meter, via
  the existing `locked` path. Partial evidence (§9f) is surfaced ("Based on N% of your profile…"),
  and the intentional-drop case (§8f) is framed as newly-revealed evidence, never as a regression.
- **§8g ratified relabel:** Readiness Matrix row `Networking Strength` → **`Profile Consistency`**.
- **ResumeVault + the 2-tab shell removed — UI ONLY.** `SavedJobsDashboard` renders directly. No
  resume version, analysis, comparison feature, DB record, query, or backend logic deleted;
  `/results/*`, `/improvements/*`, `/history` all intact. `getJobMatchScore` / `jobReadiness` **stay**
  (§8b).

### Task 7 (`4ad35e13`) — Goal editing from both surfaces

`GoalEditDialog.tsx` — **ONE** shared shadcn Dialog used by **both** the Dashboard hero (inline ghost
pencil on the Current Goal line) and Profile (a "Professional Goal" card above Subscription &
Billing). Pre-filled with the **raw** goal (never the structured form), `maxLength={500}` to match the
DB CHECK, and **save disabled while empty** — the goal can be *changed* but never *cleared* (an empty
goal would bounce the user back through the Task 5 gate). Saving makes **no AI call and no
edge-function invoke**; the trigger has already recomputed readiness inside the same write.

---

## Ship Gate: `npm run verify:baseline`

| Leg | Result |
|---|---|
| **vitest** | ✅ **570 passed / 90 files** (was 542 before this task; +28) |
| **offline deno (`test:edge`)** | ✅ **1179 passed, 0 failed, 12 ignored** — includes the new zero-AI/trigger-coverage/renormalization/tamper-resistance/taxonomy-parity/no-parallel-scorer static guard |
| **Playwright (`test:e2e`)** | ⛔ **Could not run here** — env-gated (MSH-DEF-04) |

The Playwright leg **fail-closes**; it does not silently skip:

```
Error: [e2e/global-setup] Missing required env. Need SUPABASE_TEST_URL,
SUPABASE_TEST_SERVICE_ROLE_KEY, and E2E_TEST_PASSWORD (source them from
.env.test.local locally or CI secrets). Refusing to run with a partial config.
   at global-setup.ts:32
```

`.env.test.local` does not exist in this workspace; per TESTING-STRATEGY.md:134-136 those secrets
live in GitHub Actions / the Windows box. **`verify:baseline` is therefore NOT yet proven green
end-to-end** — the two legs that can run here are green, and the Playwright leg must be run where
the secrets exist. Notably the Playwright web-server step **did build the production bundle
successfully**, so the Task 6/7 changes compile under `vite build`.

Also green: `npm run lint` → **0 errors** (158 pre-existing warnings, unchanged);
`npm run type-check` → **8 errors, all pre-existing in `src/components/ui/chart.tsx`** (MSH-DEF-01),
byte-identical to clean HEAD.

---

## Deviations

1. **[Rule 1 — stale test] `src/pages/Dashboard.test.tsx` reconciled.** *Not named in the plan.* It
   hard-asserted the `Every Version, Ranked` heading and the `Saved Jobs` **tab** that Task 6 deletes,
   so it went red the moment the UI removal landed. Same class as the E2E spec the plan *did* name, so
   it got the same treatment: flipped to removal proofs, **added** a positive `Goal Readiness`
   assertion, and taught the supabase mock `.maybeSingle()` (which `useProfessionalGoal` calls).
   **Reconciled, not weakened.** Commit `c7cdc396`.
2. **[Rule 1 — stale test] `e2e/dashboard-intelligence.spec.ts` reconciled** exactly as the plan
   specified: `resumeVault` + `savedJobsTab` → `toHaveCount(0)`, the two `appearsBefore` assertions
   routed through `resumeVault` dropped and the chain re-linked
   (`recruiterFirstImpression → profileAlignment`), plus a positive `Goal Readiness` hero assertion.
3. **[Rule 3 — blocking] Doc comments tripped the own-file guard.** My first draft of
   `goal-readiness.ts` explained the rubric using the literal tokens `/100`, `.reduce(` and
   `Math.round(` inside a comment — which the static guard greps for as *raw file text*. It went red
   (correctly). Reworded the prose; the guard is intentionally not softened.
4. **Task 6D's edit button deferred into Task 7.** The plan had Task 6 add an edit affordance that
   opens `GoalEditDialog` — a component Task 7 creates. Adding it in Task 6 would not have compiled,
   so the button landed in Task 7 alongside the dialog. End state is identical; each commit builds.
5. **Three helpers removed as genuinely dead:** `asArray`, `pickStrings`, `getScoreTone` were used
   **only** by the removed ResumeVault section (`asArray` only reachable via `pickStrings`).
   `getScoreStatus` and `formatDate` were **kept** — `SavedJobsDashboard` still uses them. No route,
   query, or table was touched.

---

## Follow-ups / Deferrals

See `deferred-items.md`. Summary:

| ID | Item |
|---|---|
| MSH-DEF-01 | 8 pre-existing `type-check` errors in `chart.tsx` (recharts 3.x drift). Identical on clean HEAD. Not a ship gate. |
| MSH-DEF-02 | **`getJobMatchScore` / `jobReadiness` remain a KNOWN-FAKE score** — `48 + resumeScore*0.34 + hasContext*6`, with **zero job-specific evidence**. User-ratified out of scope (§8b). **Follow-up: make the Saved Jobs / Job Fit match score evidence-backed (Recruiting Lens), or mark it "Needs data".** |
| MSH-DEF-03 | **OWED:** gated-remote rubric suite not executed (preview creds absent; service-role key must not be printed/stored). |
| MSH-DEF-04 | **OWED:** Playwright leg of `verify:baseline` env-gated on this machine. |
| MSH-DEF-05 | **OWED:** **THREE** migrations still to be applied to production (A, B, and the corrective C). **C must ship in the same batch as A** — A alone makes the dashboard unreachable for every user. C is also **not yet applied to preview**; if A/B are live there, preview onboarding is broken until C lands. |

---

## Self-Check: PASSED

All 10 created files exist on disk; all 7 commits exist in `git log`.
