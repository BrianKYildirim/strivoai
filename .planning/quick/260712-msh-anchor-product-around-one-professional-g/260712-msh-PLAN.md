---
quick_id: 260712-msh
phase: quick-260712-msh
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - supabase/migrations/20260712000001_add_professional_goal_and_readiness_columns.sql
  - supabase/migrations/20260712000002_goal_readiness_scorer_and_triggers.sql
  - src/integrations/supabase/types.ts
  - src/lib/taxonomies.ts
  - src/lib/dashboard-intelligence/goal-readiness.ts
  - src/lib/dashboard-intelligence/goal-readiness.test.ts
  - src/lib/dashboard-intelligence/types.ts
  - src/lib/dashboard-intelligence/index.ts
  - supabase/functions/_tests/goal_readiness_test.ts
  - supabase/functions/_shared/goal-readiness-guard.test.ts
  - supabase/functions/deno.json
  - src/hooks/useProfessionalGoal.ts
  - src/pages/Onboarding.tsx
  - src/components/ProtectedRoute.tsx
  - src/hooks/useOnboardingStatus.ts
  - src/hooks/__tests__/useOnboardingStatus.test.ts
  - src/components/dashboard/GoalEditDialog.tsx
  - src/pages/Dashboard.tsx
  - src/pages/Profile.tsx
  - e2e/global-setup.ts
  - e2e/dashboard-intelligence.spec.ts

must_haves:
  truths:
    - "A user with a resume but NO professional goal cannot reach /dashboard by direct navigation — they land on onboarding Step 4 with Steps 1-3 shown complete"
    - "Onboarding shows 'Step N of 4' with 25/50/75/100% progress"
    - "Step 4 renders the exact locked copy (title, supporting text, placeholder, reassurance) and requires a non-empty goal"
    - "No goal is ever inferred, auto-generated, or backfilled — the user types it; the raw wording is preserved verbatim"
    - "The saved goal appears in the dashboard hero and is editable from the hero and from Profile"
    - "Goal Readiness adds ZERO incremental AI calls and ZERO incremental token cost — no Anthropic/LLM call exists anywhere in the feature, by construction (the scorer is SQL and cannot make one)"
    - "Goal Readiness is computed server-side on WRITE and PERSISTED; the dashboard only READS the stored value — zero compute and zero scoring round-trip on load"
    - "The score recomputes automatically on EVERY evidence change (goal saved/edited, resume analyzed, LinkedIn graded, analysis written, target roles changed) because DB triggers fire regardless of which code path wrote the evidence"
    - "The score is a pure function of persisted evidence: same evidence in, same score out (stable and reproducible)"
    - "The hero big number, the hero MiniMeters, the Goal Readiness command card, AND the Readiness Matrix headline all render the SAME persisted value — the decorative careerReadiness formula, the hardcoded 76/84 literals, and the decorative radarItems math no longer exist in the file"
    - "Missing LinkedIn is rendered as un-evidenced MISSING DATA and is renormalized OUT of the rubric denominator — never scored 0"
    - "The UI clearly indicates when readiness is computed from PARTIAL evidence"
    - "Goal Readiness rises when resume/LinkedIn evidence scores rise, holding the evidence set constant"
    - "Adding a NEW low-scoring evidence source can LOWER Goal Readiness — this is intentional, tested, and explained in UI copy"
    - "The persisted score is owner-scoped — user A's readiness is never readable by user B — and is not client-writable"
    - "'Every Version, Ranked' (ResumeVault) and the 2-tab Tabs wrapper are gone; SavedJobsDashboard renders directly"
    - "All existing resume, analysis, target, subscription, merit and onboarding data is preserved (additive-only migrations with rollback SQL)"
  artifacts:
    - path: "supabase/migrations/20260712000001_add_professional_goal_and_readiness_columns.sql"
      provides: "Additive career_targets goal + persisted-readiness columns; goal_taxonomy table"
      contains: "ADD COLUMN IF NOT EXISTS professional_goal"
    - path: "supabase/migrations/20260712000002_goal_readiness_scorer_and_triggers.sql"
      provides: "Deterministic zero-AI plpgsql scorer + AFTER triggers on all 4 evidence tables"
      contains: "compute_goal_readiness"
    - path: "src/lib/taxonomies.ts"
      provides: "ROLE_OPTIONS / INTEREST_OPTIONS extracted as the single TS source, mirrored by goal_taxonomy"
      exports: ["ROLE_OPTIONS", "INTEREST_OPTIONS"]
    - path: "src/lib/dashboard-intelligence/goal-readiness.ts"
      provides: "READ-ONLY parser of the persisted breakdown into a render model — contains NO scoring math"
      exports: ["parseGoalReadiness"]
    - path: "supabase/functions/_tests/goal_readiness_test.ts"
      provides: "Gated-remote rubric proofs: renormalization, monotonicity, intentional-drop, determinism, owner-scoping"
    - path: "supabase/functions/_shared/goal-readiness-guard.test.ts"
      provides: "Offline in-gate static guard: zero-AI, trigger coverage, renormalization, tamper-resistance, taxonomy parity, no parallel scorer"
    - path: "src/hooks/useProfessionalGoal.ts"
      provides: "Read the goal + persisted readiness; write the goal. One shared data seam."
    - path: "src/components/dashboard/GoalEditDialog.tsx"
      provides: "Goal edit dialog reused by Dashboard hero and Profile"
  key_links:
    - from: "supabase/migrations/20260712000002_goal_readiness_scorer_and_triggers.sql"
      to: "resumes, linkedin_grades, analysis_results, career_targets"
      via: "AFTER INSERT OR UPDATE triggers calling compute_goal_readiness(user_id)"
      pattern: "CREATE TRIGGER"
    - from: "compute_goal_readiness"
      to: "career_targets.goal_readiness_score + goal_readiness_components"
      via: "SECURITY DEFINER write of the score and full component breakdown"
      pattern: "goal_readiness_components"
    - from: "src/components/ProtectedRoute.tsx"
      to: "career_targets.professional_goal"
      via: "supabase select in the onboarding gate"
      pattern: "professional_goal"
    - from: "src/pages/Onboarding.tsx"
      to: "career_targets.professional_goal"
      via: "upsert on Step 4 finish (the trigger recomputes readiness in the same write)"
      pattern: "professional_goal"
    - from: "src/pages/Dashboard.tsx"
      to: "career_targets.goal_readiness_score"
      via: "useProfessionalGoal read-only query; feeds hero AND Readiness Matrix"
      pattern: "goal_readiness_score"
    - from: "src/lib/dashboard-intelligence/goal-readiness.ts"
      to: "persisted breakdown"
      via: "parseGoalReadiness — render-only, no scoring math"
      pattern: "parseGoalReadiness"
---

<objective>
Anchor Strivo around ONE user-stated professional goal.

1. Onboarding gains a required Step 4 ("Set Your Professional Goal"); progress becomes 25/50/75/100.
2. The goal is persisted, editable, and route-gated — no goal, no dashboard.
3. The dashboard replaces its DECORATIVE readiness numbers with a REAL "Goal Readiness" score — **deterministic, zero-AI, computed server-side on every evidence write, and persisted**. The dashboard only reads it. The hero AND the Readiness Matrix render the same stored value.
4. The "Every Version, Ranked" (ResumeVault) section and its 2-tab shell are removed from the dashboard UI (UI only — no data or backend deletion).

Purpose: the product must continuously answer "How close is my profile to THIS goal, what is holding me back, and what should I improve next?" — with a number that is honest, improvable, reproducible, transparent about missing data, and **free to compute**.
Output: 2 additive migrations (columns + zero-AI scorer/triggers), Step 4 + route guards, a rewired dashboard that only reads, and a goal-edit surface.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260712-msh-anchor-product-around-one-professional-g/260712-msh-CONTEXT.md
@CLAUDE.md
@TESTING-STRATEGY.md
@src/lib/dashboard-intelligence/types.ts
@src/lib/dashboard-intelligence/inputs.ts
@src/lib/dashboard-intelligence/profile-alignment.ts
@src/pages/Onboarding.tsx
@src/pages/Dashboard.tsx
@src/components/ProtectedRoute.tsx
@src/hooks/useOnboardingStatus.ts
@supabase/functions/_tests/merit_rls_test.ts
</context>

<locked_decisions>
Non-negotiable, from CONTEXT.md. **§9 (DETERMINISTIC-ONLY) SUPERSEDES §1 and voids §8c.** Do not revisit.

- **ZERO AI (§9a/§9b/§9g).** Goal Readiness must add **zero** incremental Anthropic/LLM/external-AI calls and zero incremental token cost — at onboarding, goal create/edit, dashboard load/refresh, or any evidence change. There is **no** `score-goal-alignment` edge function, **no** `goal_alignment_cache`, **no** evidence hash, **no** `{ goal, evidence, evidenceHash }` payload, **no** cache-miss branch, and **no** feature-specific AI rate limiter. None of it may be built.
  - Consequently: **`cors-audit.test.ts:55` STAYS at 20** and **`sanitizer-coverage.test.ts:130` STAYS at 5.** Do NOT bump them to 21/6. There is no new edge function and no new AI ingester.
  - Existing paid features (Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens, Interview Prep) keep their AI calls exactly as-is (§9g). This constraint is scoped to Goal Readiness.
- **Compute on write, persist, read on load (§9c).** The scorer runs server-side whenever evidence changes, persists the score + full component breakdown, and the dashboard only READS it. Tamper-resistant: the score is not client-writable.
- **Derived from already-persisted Strivo data (§9d)**: existing resume analysis scores/findings, target-role ATS keyword coverage, relevant experience, quantified impact, existing Recruiting Lens outputs, existing LinkedIn Grader scores/findings, resume–LinkedIn consistency, missing skills/evidence, selected target roles/industries, and the goal text parsed deterministically.
- **Deterministic goal parsing only (§9e).** Preserve the user's original wording EXACTLY. Any extraction of role/industry/location/opportunity-type/year uses deterministic rules against the EXISTING taxonomies (`ROLE_OPTIONS` / `INTEREST_OPTIONS`). No model call, ever.
- **Renormalization spec (§8d) — UNCHANGED:** `score = Σ(c.score/100 × c.weight) / Σ(c.weight)` over **evidenced components only**. Un-evidenced components are dropped from BOTH numerator and denominator. **Cite no repo precedent — there is none.** Do NOT model this on `normalizeFromSections` (`grade-linkedin/schema.ts`): it plain-sums so inapplicable sections *lower the achievable ceiling*, i.e. exactly the silent missing-LinkedIn penalty this bans.
- **Missing LinkedIn = MISSING DATA**, never a silent low/zero score.
- **Partial evidence must be surfaced (§9f).** The UI clearly indicates when readiness is computed from partial evidence.
- **Adding evidence can lower the score (§8f)** — honest and intended. Explained in UI copy and locked by a test.
- **Stable and reproducible (§9f)**: same evidence in → same score out. Pure function.
- **One source of truth**: the hero big number, hero MiniMeters, Goal Readiness command card, and the **Readiness Matrix headline (§8a)** all read the SAME persisted value. `careerReadiness` (`:334`), the `76`/`84` MiniMeter literals, and the decorative `radarItems` math (`:470-474`) are DELETED.
- **§8g RATIFIED**: Readiness Matrix row `Networking Strength` → `Profile Consistency`.
- **Legacy users**: no resume → Step 1. Resume but no goal → **Step 4 directly** (Steps 1-3 shown complete, never repeated). Resume + goal → dashboard.
- **Progress**: 25 / 50 / 75 / 100. **Step 4 copy is EXACT** (Task 4).
- **ResumeVault removal is UI-only.** No resume versions, analyses, comparison functionality, DB records, or backend logic deleted. `/results/*`, `/improvements/*`, `/history` stay intact.
- **Otherwise the dashboard is unchanged**: Your Next 3 Moves, Recruiter First Impression, Profile Alignment, nav, command-card layout, Free/Elite behavior, visual design, responsive behavior.
- **Migrations are additive-only, ship rollback SQL, applied to PREVIEW first.** Production is operator-approved (CLAUDE.md).
- Semantic design tokens only. `npm run verify:baseline` is the pre-merge gate.
</locked_decisions>

<architecture_decision>
**Mechanism: Postgres `AFTER INSERT OR UPDATE` triggers → a `SECURITY DEFINER` plpgsql scorer. NOT application-code hooks.**

**Why — this is the load-bearing choice, because the main failure mode of compute-on-write is a missed write path:**
Evidence is written from **10+ edge functions AND client code** (verified against the codebase): `resumes` ← `analyze-resume` (lifecycle save + legacy save) and `process-resume-analysis-job`; `linkedin_grades` ← `grade-linkedin` (lifecycle + legacy) and `grade-linkedin/entitlement.ts`; `analysis_results` ← `recruiting-lens`, `analyze-career`, `process-career-analysis-job`, `extract-analysis-structure`; `career_targets` ← the **client** (`Onboarding.tsx`, `Profile.tsx`). Hooking every one of those is fragile by construction — and several sit inside **merit refund-boundary-critical save tails** (`analyze-resume` / `grade-linkedin`, guarded by `refund-after-save.test.ts`), where inserting a recompute call risks breaking money-path invariants the codebase deliberately protects.

A DB trigger fires on **every** write path — edge function, worker, client, admin, backfill — regardless of the code path. It touches **zero application code**, disturbs **zero money paths**, and cannot be missed. It also makes zero-AI a *structural* guarantee (SQL cannot call Anthropic) and reduces the dashboard to a plain column read (zero compute, zero network scoring work on load, per §9c). Repo precedent is strong: 33 migrations already carry `SECURITY DEFINER` business logic (`check_and_deduct_merits`, `create_or_recover_analysis_run`, `transition_analysis_run`).

**Honest tradeoff:** SQL is harder to unit-test than TS. Mitigated by BOTH layers in Task 3:
- an **offline, in-gate static guard** (`_shared/goal-readiness-guard.test.ts`) asserting zero-AI, trigger coverage on all four evidence tables, the renormalized denominator, tamper-resistance, taxonomy parity, and the absence of any parallel scorer — fail-closing inside `verify:baseline`;
- a **gated-remote rubric suite** (`_tests/goal_readiness_test.ts`, following the existing `_tests/merit_rls_test.ts` idiom) proving renormalization, partial-evidence, monotonicity, intentional-drop, reproducibility, trigger coverage, and owner-scoping against the real SQL function on preview.

**No parallel scoring implementation exists.** The math lives in SQL only. `src/lib/dashboard-intelligence/goal-readiness.ts` is a **read-only parser** of the persisted breakdown — it contains no scoring math and must never regain any.
</architecture_decision>

<scope_boundary>
**`getJobMatchScore` (`Dashboard.tsx:146`) and `jobReadiness` (`Dashboard.tsx:330`) STAY. USER-RATIFIED (CONTEXT §8b).**

They feed only the *Job Match Readiness* card, the radar *Job Fit* row, and the per-saved-job *Match score* — none of which display **overall readiness**, so "one source of truth" (scoped to overall readiness) does not reach them.

**They remain a known-fake score** — fabricated from resume score alone (`48 + resumeScore * 0.34 + hasContext * 6`) with zero job-specific evidence. The executor **MUST** record this in `SUMMARY.md` as a follow-up: *"Make the Saved Jobs / Job Fit match score evidence-backed (Recruiting Lens) or mark it Needs data."* Do NOT fix it here.
</scope_boundary>

<tasks>

<task type="auto">
  <name>Task 1: Migration A — goal + persisted-readiness columns, goal taxonomy, taxonomy extraction</name>
  <files>
supabase/migrations/20260712000001_add_professional_goal_and_readiness_columns.sql
src/lib/taxonomies.ts
src/pages/Onboarding.tsx
src/integrations/supabase/types.ts
  </files>
  <action>
Follow the conventions in `supabase/migrations/20260702000001_analysis_lifecycle_ledger.sql`: a header comment stating purpose + the additive guarantee, a `ROLLBACK:` section with copy-paste inverse DDL, and fully re-runnable DDL (`IF NOT EXISTS` everywhere).

**A. Add to `public.career_targets`** (one row per user; `user_id` already unique):
- `professional_goal text` — the user's RAW wording. Source of truth for display. NEVER overwritten by any derived form. Add `CHECK (professional_goal IS NULL OR length(professional_goal) <= 500)`, matching the sibling `career_goals` bound (`20260525000001_phase42_layer1_users_career_targets.sql:55`). This is not cosmetic: unbounded free text gets substring-matched against every `goal_taxonomy` term inside a trigger that runs on the money path (see Task 2 Warning-4 note).
- `professional_goal_structured jsonb` — deterministically parsed `{ role, industry, location, opportunity_type, year }`. Nullable. Written ONLY by the Task 2 scorer, never by the client.
- `professional_goal_set_at timestamptz`.
- `goal_readiness_score int` — the persisted 0-100 score. `NULL` when not yet computable. **Trigger-owned.**
- `goal_readiness_components jsonb` — the full breakdown: `[{ id, label, weight, score, evidenced }]` plus `interpretation`, `partial_evidence` (bool), `evidenced_weight` (int), `blockers[]`. **Trigger-owned.**
- `goal_readiness_computed_at timestamptz` — **trigger-owned.**

**B. `public.goal_taxonomy`** — `(kind text CHECK (kind IN ('role','industry')), term text, PRIMARY KEY (kind, term))`. Seed from the SAME lists as `ROLE_OPTIONS` / `INTEREST_OPTIONS`. This is what the SQL scorer parses the goal against (§9e). Seed idempotently (`ON CONFLICT DO NOTHING`). RLS: readable by `authenticated` (a public reference list, no user data); not writable by clients.

**C. Tamper-resistance (§9c) — COLUMN-LEVEL PRIVILEGES, not a guard trigger.**
The three `goal_readiness_*` columns (and `professional_goal_structured`) must NOT be client-writable. RLS alone does not do this — RLS gates *rows*, not *columns*.

**Do NOT gate on `session_user`.** PostgREST connects as the login role `authenticator` and then `SET LOCAL ROLE authenticated`, so for a client write `session_user` is `authenticator`, NEVER `authenticated` — a `session_user <> 'authenticated'` guard ALWAYS passes and the client can freely write the score. Use Postgres column-level grants instead, which are enforced by the engine and cannot be spoofed:

```sql
REVOKE UPDATE, INSERT ON public.career_targets FROM anon, authenticated;
GRANT INSERT (user_id, target_roles, target_industries, target_companies,
              location_preference, career_goals, professional_goal, professional_goal_set_at)
  ON public.career_targets TO authenticated;
GRANT UPDATE (target_roles, target_industries, target_companies, location_preference,
              career_goals, professional_goal, professional_goal_set_at)
  ON public.career_targets TO authenticated;
```
The `SECURITY DEFINER` scorer runs as the table owner and is unaffected by these grants — it can still write the readiness columns.

**Verify the client-writable column list against the REAL current `career_targets` schema before writing this.** Confirmed at plan time (9 columns): `id`, `user_id`, `target_roles`, `target_industries`, `target_companies`, `location_preference`, `career_goals`, `created_at`, `updated_at`. `id`/`created_at`/`updated_at` are defaulted and are not sent by the client's upsert, so they need no grant — but re-confirm before applying, and make sure the existing onboarding/Profile writes still succeed (Task 4/Task 7 manual checks cover this).

Existing owner-scoped RLS on `career_targets` stays exactly as-is; these grants are an ADDITIONAL, narrower layer on top. Do not weaken any policy.

**D. Constraints.**
- Additive ONLY. No column drops, no type changes, no RLS weakening. Do not touch the pre-existing `career_goals` column (legacy, ambiguous — never read or write it).
- Do NOT backfill `professional_goal` from `target_roles`, `career_goals`, resume content, or LinkedIn (CONTEXT §2). No default on it; the migration writes NO rows.
- `goal_readiness_*` starts NULL for everyone. It populates naturally as Task 2's triggers fire on the next evidence write, and immediately for every user the moment they save a goal.

**E. Taxonomy extraction (prevents drift).** Move `ROLE_OPTIONS` and `INTEREST_OPTIONS` verbatim out of `src/pages/Onboarding.tsx` (`:38-136`) into a new `src/lib/taxonomies.ts`, and import them back into `Onboarding.tsx`. **Do not add, remove, reorder, or reword a single entry** — this is a pure move so the TS list and the `goal_taxonomy` seed have one authorable source, with a Task 3 static guard asserting they stay identical.

**F. Indexes the scorer's latest-row lookups need (money-path latency — see Task 2).** These do NOT exist today and the scorer runs inside the caller's statement on the `analyze-resume` save tail, so a seq-scan here can trip `statement_timeout` and abort a resume save:
```sql
CREATE INDEX IF NOT EXISTS idx_resumes_user_created ON public.resumes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_results_user_type_created
  ON public.analysis_results (user_id, analysis_type, created_at DESC);
```
`linkedin_grades` already has `idx_linkedin_grades_user_created (user_id, created_at DESC)` — do NOT re-create it.

Apply to **preview** (`cimjltzovkahkqecpwgi`) only. **Do NOT apply to production** — operator-approved per CLAUDE.md. Record the owed prod migration in the SUMMARY. Regenerate `src/integrations/supabase/types.ts` from preview.
  </action>
  <verify>
- `rg -n --fixed-strings 'IF NOT EXISTS professional_goal' supabase/migrations/20260712000001_*.sql` hits; same for the three `goal_readiness_*` columns.
- `rg -n --fixed-strings 'GRANT UPDATE (' supabase/migrations/20260712000001_*.sql` shows a column list that EXCLUDES all three `goal_readiness_*` columns and `professional_goal_structured`.
- `rg -n --fixed-strings 'length(professional_goal) <= 500' supabase/migrations/20260712000001_*.sql` hits.
- `rg -n --fixed-strings 'idx_resumes_user_created' supabase/migrations/20260712000001_*.sql` hits; `idx_analysis_results_user_type_created` hits.
- The file contains a `ROLLBACK:` block with inverse `DROP COLUMN IF EXISTS` / `DROP TABLE IF EXISTS goal_taxonomy` DDL.
- `rg -n --fixed-strings 'ROLE_OPTIONS' src/lib/taxonomies.ts src/pages/Onboarding.tsx` shows the definition in `taxonomies.ts` and an import in `Onboarding.tsx`.
- The role/industry entry COUNT in `src/lib/taxonomies.ts` equals the count seeded into `goal_taxonomy`.
- Re-applying the migration against preview is a no-op.
- `npm run lint && npm run type-check && npm run test` pass (the taxonomy move must be behavior-neutral).
  </verify>
  <done>Preview `career_targets` carries the goal + three trigger-owned readiness columns; `goal_taxonomy` is seeded from the same list `Onboarding.tsx` renders; zero rows backfilled; no existing column altered or dropped; rollback SQL in the file; types regenerated.</done>
</task>

<task type="auto">
  <name>Task 2: Migration B — deterministic zero-AI scorer + evidence triggers</name>
  <files>
supabase/migrations/20260712000002_goal_readiness_scorer_and_triggers.sql
  </files>
  <action>
All plpgsql. **No network, no `pg_net`, no `http`, no external call of any kind — zero AI by construction (§9a/§9b).**

**A. Deterministic goal parsing (§9e).** `parse_professional_goal(p_goal text) RETURNS jsonb`:
- Case-insensitive substring match of `p_goal` against `goal_taxonomy` terms → `role`, `industry` (longest match wins; deterministic tie-break by term length then alphabetical).
- `year` → regex for a 4-digit `20xx`.
- `opportunity_type` → a small fixed keyword list (`internship`, `full-time`, `graduate`, `co-op`, `analyst`, …).
- `location` → best-effort deterministic (e.g. the token after `" in "`), nullable. **Never guess.**
- Every field is nullable. **The raw `professional_goal` is NEVER modified.** Output goes to `professional_goal_structured`.

**B. `compute_goal_readiness(p_user_id uuid) RETURNS void`** — `SECURITY DEFINER`, `SET search_path = public`.

**FIRST STATEMENT — the money-path early exit (do not skip this).** The scorer runs INSIDE the caller's statement, and one of its callers is the `resumes` trigger, which fires on the `analyze-resume` refund-boundary save tail. `EXCEPTION WHEN OTHERS` covers scorer *errors* but does NOT cover `statement_timeout` — a slow scorer can abort the resume save itself. So:
```sql
SELECT professional_goal INTO v_goal FROM public.career_targets WHERE user_id = p_user_id;
IF NOT FOUND OR v_goal IS NULL OR btrim(v_goal) = '' THEN RETURN; END IF;
```
This is the common case AND it is ALWAYS the case when onboarding's `resumes` INSERT fires (the resume row lands before the goal is saved). One indexed lookup, then out. Everything below runs only for users who actually have a goal.

Then read ONLY already-persisted evidence (§9d): the latest `resumes` row (`overall_score`, `grading_data`), the latest `linkedin_grades` row (`overall_score`, `grading_data`), the latest relevant `analysis_results` rows (Recruiting Lens / Career Compass), and `career_targets` (`target_roles`, `target_industries`, `professional_goal`).

Six components (weights Σ = 100; the exact split is Claude's discretion — this is the recommendation):

| id | label | weight | evidenced when | score source |
|----|-------|--------|----------------|--------------|
| `resume_quality` | Resume Quality | 25 | a resume with a non-null `overall_score` exists | `resumes.overall_score` |
| `goal_alignment` | Goal Alignment | 25 | a goal exists AND a resume is evidenced | **deterministic** goal↔evidence match: overlap of the parsed goal role/industry + `target_roles`/`target_industries` against the resume's `suggestedTargetRoles` / `recommendedKeywords` (`grading_data`), scaled by ATS keyword coverage |
| `goal_keyword_coverage` | ATS Keyword Coverage | 15 | resume evidenced | coverage of goal/target-role keywords in the resume's `recommendedKeywords`, boosted by any persisted Recruiting Lens `keywords.matched` vs `keywords.missing` |
| `linkedin_strength` | LinkedIn Strength | 15 | a `linkedin_grades` row exists | `linkedin_grades.overall_score` |
| `evidence_depth` | Demonstrated Impact | 10 | resume evidenced | monotone in the count of resume strengths / quantified-impact findings in `grading_data`, decreasing in the count of priority improvements. Deterministic and capped. |
| `profile_consistency` | Profile Consistency | 10 | resume AND LinkedIn both evidenced | deterministic token overlap between resume keywords/roles and LinkedIn section strengths |

**Renormalization — implement this formula literally (§8d):**
```
score = ROUND(100 * SUM(c.score/100.0 * c.weight) FILTER (WHERE c.evidenced)
                 / NULLIF(SUM(c.weight) FILTER (WHERE c.evidenced), 0))
```
Un-evidenced components are dropped from BOTH numerator and denominator — never scored 0, and they never lower the achievable ceiling. **Cite no repo precedent — there is none.** Do NOT copy `normalizeFromSections`.

**Persist with `UPDATE` — NEVER an upsert/INSERT.** Write `UPDATE public.career_targets SET ... WHERE user_id = p_user_id;` explicitly. An `INSERT ... ON CONFLICT` would re-fire the unconditional `AFTER INSERT` trigger on `career_targets` (which has no `WHEN` clause and therefore no recursion guard). The early-return above already guarantees the row exists. The Task 3A static guard asserts this.

Persist to `career_targets`:
- `goal_readiness_score` = the renormalized score, or `NULL` when no component is evidenced (or no goal exists).
- `goal_readiness_components` = the FULL breakdown — every component with `{ id, label, weight, score, evidenced }` — plus `interpretation` (how strongly the profile supports the goal; **never** offer/hire-probability language), `partial_evidence` (true when ANY component is un-evidenced — this is what the §9f UI indicator reads), `evidenced_weight` (Σ of evidenced weights, so the UI can say "based on N% of the rubric"), and `blockers[]` (the weakest evidenced components + the names of the un-evidenced ones).
- `goal_readiness_computed_at` = `now()`.
- `professional_goal_structured` = `parse_professional_goal(professional_goal)`.

**Purity (§9f):** a deterministic function of the persisted rows — no `random()`, no `now()` inside the score math (`now()` is only stamped into `computed_at`), and no ordering ambiguity (always `ORDER BY created_at DESC, id DESC LIMIT 1` when picking "the latest" row).

**C. Triggers (§9c) — the unmissable part. SPLIT INSERT AND UPDATE.**

A single `AFTER INSERT OR UPDATE ... WHEN (OLD.col IS DISTINCT FROM NEW.col)` trigger **will not compile** — Postgres raises `ERROR: OLD cannot be referenced in ON INSERT trigger`. And that `WHEN` clause IS the recursion guard, so it cannot simply be dropped. Every conditional trigger is therefore TWO triggers:

```sql
-- resumes
CREATE TRIGGER trg_goal_readiness_resumes_ins AFTER INSERT ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION tg_goal_readiness();
CREATE TRIGGER trg_goal_readiness_resumes_upd AFTER UPDATE ON public.resumes
  FOR EACH ROW WHEN (OLD.overall_score IS DISTINCT FROM NEW.overall_score
                  OR OLD.grading_data  IS DISTINCT FROM NEW.grading_data)
  EXECUTE FUNCTION tg_goal_readiness();

-- career_targets  (THE RECURSION GUARD)
CREATE TRIGGER trg_goal_readiness_targets_ins AFTER INSERT ON public.career_targets
  FOR EACH ROW EXECUTE FUNCTION tg_goal_readiness();
CREATE TRIGGER trg_goal_readiness_targets_upd AFTER UPDATE ON public.career_targets
  FOR EACH ROW WHEN (OLD.professional_goal   IS DISTINCT FROM NEW.professional_goal
                  OR OLD.target_roles        IS DISTINCT FROM NEW.target_roles
                  OR OLD.target_industries   IS DISTINCT FROM NEW.target_industries)
  EXECUTE FUNCTION tg_goal_readiness();

-- linkedin_grades  (user_id is NULLABLE here, unlike the other three)
CREATE TRIGGER trg_goal_readiness_linkedin_ins AFTER INSERT ON public.linkedin_grades
  FOR EACH ROW WHEN (NEW.user_id IS NOT NULL) EXECUTE FUNCTION tg_goal_readiness();
CREATE TRIGGER trg_goal_readiness_linkedin_upd AFTER UPDATE ON public.linkedin_grades
  FOR EACH ROW WHEN (NEW.user_id IS NOT NULL) EXECUTE FUNCTION tg_goal_readiness();

-- analysis_results  (insert-only in practice; cover update too)
CREATE TRIGGER trg_goal_readiness_analysis_ins AFTER INSERT ON public.analysis_results
  FOR EACH ROW EXECUTE FUNCTION tg_goal_readiness();
CREATE TRIGGER trg_goal_readiness_analysis_upd AFTER UPDATE ON public.analysis_results
  FOR EACH ROW EXECUTE FUNCTION tg_goal_readiness();
```
`tg_goal_readiness()` is a thin `RETURNS trigger` wrapper that calls `compute_goal_readiness(NEW.user_id)` and `RETURN NULL` (AFTER triggers ignore the return).

**Recursion guard — MANDATORY mechanism: the column-scoped `WHEN` clause above.** The scorer writes only `goal_readiness_*` + `professional_goal_structured`, and NONE of those appear in the `career_targets` UPDATE `WHEN` predicate — so its own write-back cannot re-fire the trigger. Combined with "UPDATE, never INSERT" (section B), the unconditional `AFTER INSERT` trigger is never reached by the scorer either.

**Do NOT use `pg_trigger_depth()` as the guard.** It is a footgun here: inside a trigger it is already `>= 1`, so a `pg_trigger_depth() = 0` condition never fires at all. The column-scoped `WHEN` is correct and sufficient.

**Resilience:** a scoring failure must NEVER abort the underlying evidence write (a failed recompute may not lose a user's resume analysis). Wrap the scorer body in an exception handler that logs and returns — the score simply stays stale rather than taking down the analysis/money path.

**Grants:** `REVOKE ALL ON FUNCTION compute_goal_readiness FROM public, anon, authenticated` — per project memory, `REVOKE FROM public` alone is NOT sufficient; revoke `anon` and `authenticated` explicitly. It is called by triggers only.

`ROLLBACK:` header block: `DROP TRIGGER`s (incl. the Task 1C guard trigger), then `DROP FUNCTION compute_goal_readiness`, `DROP FUNCTION parse_professional_goal`.

Apply to **preview** only. Production is operator-approved.
  </action>
  <verify>
- `rg -n --fixed-strings 'pg_net' supabase/migrations/20260712000002_*.sql` returns NOTHING; likewise `http_post` and `anthropic`. Zero-AI is structural.
- `rg -n --fixed-strings 'CREATE TRIGGER' supabase/migrations/20260712000002_*.sql` shows, for EACH of `resumes`, `linkedin_grades`, `analysis_results`, `career_targets`, BOTH a separate `AFTER INSERT` trigger AND a separate `AFTER UPDATE ... WHEN (` trigger. No trigger uses `AFTER INSERT OR UPDATE` together with a `WHEN` clause referencing `OLD` (that does not compile).
- `rg -n --fixed-strings 'pg_trigger_depth' supabase/migrations/20260712000002_*.sql` returns NOTHING.
- The scorer persists via `UPDATE public.career_targets` — `rg -n 'INSERT INTO public.career_targets|ON CONFLICT' supabase/migrations/20260712000002_*.sql` returns NOTHING.
- The migration applies cleanly to preview (proving the DDL compiles — a `WHEN`-on-INSERT mistake fails here immediately).
- `rg -n --fixed-strings 'FILTER (WHERE' supabase/migrations/20260712000002_*.sql` shows the denominator summing only evidenced weights.
- On preview: saving a goal for a test user populates `goal_readiness_score` + `goal_readiness_components` within the same transaction. Updating that user's `resumes.overall_score` recomputes it. The scorer's own write-back to `career_targets` does NOT re-fire the trigger (no infinite recursion — the write completes).
- Re-applying the migration is a no-op.
  </verify>
  <done>A deterministic, zero-AI, SECURITY DEFINER plpgsql scorer persists the renormalized score + full breakdown, and AFTER triggers on all four evidence tables recompute it on every write path — with no recursion, and with no ability to abort the underlying evidence write.</done>
</task>

<task type="auto">
  <name>Task 3: Rubric proofs (gated-remote) + in-gate static guard</name>
  <files>
supabase/functions/_shared/goal-readiness-guard.test.ts
supabase/functions/_tests/goal_readiness_test.ts
supabase/functions/deno.json
  </files>
  <action>
This task pays down the one honest cost of the SQL design (see `<architecture_decision>`): SQL is harder to unit-test. Two suites, two layers.

**A. `_shared/goal-readiness-guard.test.ts` — OFFLINE, inside `verify:baseline`.** A static-source guard over the two migration files, following the existing idiom (`_shared/cors-audit.test.ts`, `sanitizer-coverage.test.ts`, `no-paddle-live-surface.test.ts`). It must fail-close if anyone later weakens the design:
1. **Zero-AI**: the scorer migration contains no `pg_net`, no `http_post`, no `net.`, no `anthropic` — no external-call surface at all. This makes the §9a guarantee permanent.
2. **Trigger coverage**: for EACH of `resumes`, `linkedin_grades`, `analysis_results`, `career_targets`, BOTH an `AFTER INSERT` trigger AND an `AFTER UPDATE` trigger exist. **A missed evidence table = a permanently stale score — this assertion is the whole reason the guard exists.** Also assert no trigger combines `AFTER INSERT OR UPDATE` with a `WHEN` clause (that DDL does not compile), and that `pg_trigger_depth` appears nowhere.
3. **Renormalization**: the scorer sums evidenced weights in the denominator (`FILTER (WHERE ... evidenced)`) and does NOT plain-sum all weights.
4. **Tamper-resistance**: migration A REVOKEs blanket `INSERT, UPDATE` on `career_targets` from `anon, authenticated` and re-GRANTs an explicit COLUMN LIST that **excludes all three `goal_readiness_*` columns and `professional_goal_structured`**. Assert the grant list does not contain them. Assert the migration does NOT gate on `session_user` (that guard is a no-op under PostgREST's `authenticator` → `SET LOCAL ROLE authenticated` model and would silently leave the score client-writable). Separately assert `compute_goal_readiness` is REVOKEd from `anon` AND `authenticated` explicitly, not just `public`.
5. **Taxonomy parity**: the terms seeded into `goal_taxonomy` in migration A are EXACTLY the entries in `src/lib/taxonomies.ts` — parse both, compare as sets, assert equal in both directions. This is what stops the SQL taxonomy and the onboarding UI from drifting.
6. **No parallel scorer**: `src/lib/dashboard-intelligence/goal-readiness.ts` contains no scoring arithmetic — no weight constants, no renormalization expression. The math lives in SQL, once.
7. **Scorer UPDATEs, never INSERTs**: the scorer migration contains no `INSERT INTO public.career_targets` and no `ON CONFLICT` — an upsert would re-fire the unconditional `AFTER INSERT` trigger and defeat the recursion guard.
8. **Money-path early exit**: `compute_goal_readiness` returns early when the user has no `career_targets` row or a NULL/blank `professional_goal` (assert the guard clause is present), and migration A creates `idx_resumes_user_created` + `idx_analysis_results_user_type_created`.

Append BOTH new suites to `deno.json` `test:ci` — the offline guard AND the gated-remote `_tests/goal_readiness_test.ts` (the latter self-skips under `DENO_TEST_SUPABASE_REMOTE=0`, exactly like the already-registered `_tests/merit_rls_test.ts`, so registering it is safe and keeps it discoverable). Append only — do not reorder or drop existing entries. **Do NOT touch `cors-audit.test.ts` or `sanitizer-coverage.test.ts` — they stay at 20 and 5.** There is no new edge function and no new AI ingester.

**B. `_tests/goal_readiness_test.ts` — GATED-REMOTE.** Follow the `_tests/merit_rls_test.ts` idiom exactly (env-gated; self-skips when the remote env is absent, so `npm run test:edge` — which pins `DENO_TEST_SUPABASE_REMOTE=0` — stays green offline). Seeds fixtures on **preview** and asserts against the REAL SQL function:
1. **Missing LinkedIn renormalizes, not zeroes**: a resume-only user's `linkedin_strength` has `evidenced: false`, and the score is STRICTLY GREATER than the value it would have if that component were scored 0 with its weight KEPT in the denominator (compute the comparison inline). This assertion makes the silent-penalty bug impossible to reintroduce.
2. **Partial evidence flagged (§9f)**: that same user's breakdown has `partial_evidence: true` and `evidenced_weight < 100`.
3. **Monotonicity, evidence set held constant**: raising `resumes.overall_score` 60→85 strictly raises the persisted score; raising `linkedin_grades.overall_score` strictly raises it.
4. **Intentional drop (§8f)**: a resume-only user at `overall_score = 82` scores X. Inserting a `linkedin_grades` row at `overall_score = 55` yields Y **< X**. Assert `Y < X` **with a comment that this is INTENTIONAL and REQUIRED** — new evidence is revealed, not a penalty applied. Anyone "fixing" this by zeroing or floor-ing un-evidenced components re-breaks the missing-LinkedIn rule and must fail this test.
   **Pin the fixture:** adding LinkedIn evidences BOTH `linkedin_strength` AND `profile_consistency` at the same moment, so the assertion is fixture-dependent unless controlled. Author the LinkedIn `grading_data` so its resume-overlap lands `profile_consistency` below X too (e.g. section strengths sharing few tokens with the resume's keywords/roles). Compute the expected Y by hand in a comment so a future weight change fails loudly instead of silently inverting the test.
5. **Stable + reproducible (§9f)**: re-running `compute_goal_readiness` on unchanged evidence yields a byte-identical `goal_readiness_components` (modulo `computed_at`). Same evidence in → same score out.
6. **Triggers fire on every evidence path**: writing to each of `resumes`, `linkedin_grades`, `analysis_results`, and `career_targets` each bumps `goal_readiness_computed_at`.
7. **Owner-scoping**: user A's `goal_readiness_score` is NOT readable by user B (query as B's JWT via the anon client → zero rows), and B cannot write A's.
8. **Not client-writable**: an authenticated client attempting `update career_targets set goal_readiness_score = 100` on their OWN row is rejected / has no effect.
9. **Goal wording preserved (§9e)**: after parsing, `professional_goal` is byte-identical to what the user typed; only `professional_goal_structured` is derived.

The executor MUST run this against preview with the remote flag ON and paste the pass/fail output into the SUMMARY. **A green offline gate alone does NOT discharge this task.**
  </action>
  <verify>
- `npm run test:edge` — green, including the new offline guard; the gated-remote suite self-skips (does not fail) offline.
- `rg -n --fixed-strings 'USER_FUNCTIONS.length, 20' supabase/functions/_shared/cors-audit.test.ts` still hits (NOT 21).
- `rg -n --fixed-strings 'AI_INGESTERS.length, 5' supabase/functions/_shared/sanitizer-coverage.test.ts` still hits (NOT 6).
- The gated-remote suite, run against preview with the remote flag ON, passes all 9 cases; the output is pasted into the SUMMARY.
- Fail-before demo: deleting one `CREATE TRIGGER` line turns the offline guard RED (demonstrate, then restore).
  </verify>
  <done>The rubric's properties (renormalization, partial-evidence, monotonicity, intentional-drop, reproducibility, trigger coverage, owner-scoping, non-writability, goal-wording preservation) are proven against the real SQL scorer on preview, and an offline guard inside `verify:baseline` permanently fail-closes on zero-AI, trigger coverage, renormalization, tamper-resistance, taxonomy parity, and any reintroduction of a parallel scorer.</done>
</task>

<task type="auto">
  <name>Task 4: `useProfessionalGoal` hook + Onboarding Step 4</name>
  <files>
src/hooks/useProfessionalGoal.ts
src/pages/Onboarding.tsx
  </files>
  <action>
Goal CAPTURE ships before the goal GATE (Task 5). Order matters: a guard without Step 4 would redirect legacy users into an onboarding page that immediately bounces them back to `/dashboard` — an infinite loop.

**A. `useProfessionalGoal.ts`** — one shared data seam (follow the `useUserTargets.ts` pattern):
- Reads `career_targets` → `{ professional_goal, professional_goal_structured, professional_goal_set_at, goal_readiness_score, goal_readiness_components, goal_readiness_computed_at }`. Exposes `hasGoal: boolean`.
- `saveGoal(rawText)` → upserts `career_targets` on `user_id` with `professional_goal: rawText.trim()` and `professional_goal_set_at: now`. **Never writes `professional_goal_structured` (the scorer owns it), never writes any `goal_readiness_*` column (trigger-owned and DB-rejected), never overwrites the raw text.** Must NOT clobber `target_roles` / `target_industries` — partial upsert on the conflict target.
- **There is NO `refreshAlignment()`, no edge-function invoke, and no AI call.** The Task 2 trigger recomputes readiness inside the same transaction as the goal write. After `saveGoal` resolves, simply invalidate the goal query — the fresh score is already persisted and comes back on the refetch.

**B. `Onboarding.tsx` — Step 4.**
- Import `ROLE_OPTIONS` / `INTEREST_OPTIONS` from `@/lib/taxonomies` (moved in Task 1E).
- Add `const [professionalGoal, setProfessionalGoal] = useState('')`.
- Progress: `Step {step} of 3` → `Step {step} of 4`, and BOTH `(step / 3) * 100` occurrences (label at ~:458 and `<Progress value>` at ~:460) → `(step / 4) * 100`. Yields 25/50/75/100.
- Step 3's finish button becomes `Continue →` (`setStep(4)`); it must NO LONGER call `handleFinishSetup`.
- New `{step === 4 && (...)}` Card, styled consistently with Steps 1-3 (same `Card p-8`, same icon-circle header, `Target` icon, semantic tokens only). **Exact copy, verbatim:**
  - Title: `Set Your Professional Goal`
  - Supporting text: `Tell Strivo the one professional outcome you are currently working towards. We'll use your resume, LinkedIn, and future improvements to help you get closer to it.`
  - Input placeholder: `e.g. Investment Banking Internship in New York — 2027`
  - Beneath the input: `You can update this goal at any time.`
- Free-text input (single-line `Input` or short `Textarea`) — preserves the user's wording verbatim. No dropdown, no chips, no suggestions, no inference. Required: the finish button is `disabled` while `professionalGoal.trim().length === 0`. Set `maxLength={500}` to match the DB `CHECK` from Task 1A (otherwise a long paste is rejected by Postgres with an opaque error).

**C. `checkExistingOnboarding()` — the legacy-user fork (currently `:166-211`).**
Today it redirects ANY user with a resume straight to `/dashboard` — exactly why legacy users would never see Step 4. Replace that branch:
```
hasResume = resumes?.length > 0
hasGoal   = !!targets?.professional_goal?.trim()

if (hasResume && hasGoal)  -> navigate('/dashboard'); return
if (hasResume && !hasGoal) -> setStep(4); setIsGoalOnlyFlow(true);   // fall through, DO NOT redirect
if (!hasResume)            -> normal flow from Step 1
```
Widen the existing `career_targets` select to include `professional_goal`. Add `isGoalOnlyFlow` state; when true, render a subtle `Steps 1-3 complete` line above the Step 4 card. Locked: legacy users NEVER repeat Steps 1-3.

**D. `handleFinishSetup()` — two paths.**
- **Goal-only path** (`isGoalOnlyFlow`): the user already has a resume/LinkedIn/targets. `await saveGoal(...)` — the trigger computes readiness synchronously — then `navigate('/dashboard')`. Do NOT re-upload a resume, re-run analysis, or touch `target_roles`/`target_industries`/`profiles`.
- **Full path** (new user): keep the existing sequence byte-for-byte — upload → signed URL → `resumes` insert → LinkedIn extraction → `career_targets` upsert → resume extraction → analysis invoke (BOTH the lifecycle and dormant branches, verbatim). **Add** `professional_goal` + `professional_goal_set_at` to the EXISTING `career_targets` upsert payload (one extra field on the same write — do not add a second write). The existing `navigate(/results/${resume.id})` destination is UNCHANGED. Readiness populates itself: the `career_targets` trigger fires on the upsert, and the `resumes` trigger fires again when the analysis lands.
- Guard: if `!professionalGoal.trim()` → toast + `setStep(4)`, mirroring the existing `!resumeFile` guard.
  </action>
  <verify>
- `rg -n --fixed-strings 'step / 3' src/pages/Onboarding.tsx` returns NOTHING; `rg -n --fixed-strings 'Step {step} of 4' src/pages/Onboarding.tsx` hits.
- The four locked copy strings appear verbatim in `Onboarding.tsx`.
- `rg -n --fixed-strings 'goal_readiness' src/hooks/useProfessionalGoal.ts` shows only READS — no write of any `goal_readiness_*` column.
- `rg -n --fixed-strings 'invoke' src/hooks/useProfessionalGoal.ts` returns NOTHING (no edge-function call, no AI).
- `npm run lint && npm run type-check && npm run test` pass.
- Manual (dev server, preview DB): a NEW user completes 4 steps at 25/50/75/100 and still lands on `/results/:id` with the analysis running. A LEGACY user (resume present, `professional_goal` NULL) visiting `/onboarding` opens directly on Step 4 at 100% showing "Steps 1-3 complete"; saving the goal lands them on `/dashboard` with a NON-NULL `goal_readiness_score` already persisted, and their resume/targets/analyses intact.
  </verify>
  <done>Onboarding is a 4-step 25/50/75/100 flow with the exact locked Step 4 copy and a required free-text goal preserved verbatim. Legacy users open directly on Step 4 without repeating Steps 1-3. Saving the goal persists readiness via the trigger with zero AI calls and zero edge-function invokes. The new-user path is otherwise byte-identical.</done>
</task>

<task type="auto">
  <name>Task 5: Route/data goal gate (ProtectedRoute + useOnboardingStatus)</name>
  <files>
src/components/ProtectedRoute.tsx
src/hooks/useOnboardingStatus.ts
src/hooks/__tests__/useOnboardingStatus.test.ts
e2e/global-setup.ts
  </files>
  <action>
Turns the gate ON, now that Step 4 exists (Task 4) to receive the redirected users.

**A0. `e2e/global-setup.ts` — seed the goal, or this task breaks the Playwright suite that Task 7 uses as its ship gate.**
`global-setup.ts:99-115` seeds ONLY a `resumes` row for the E2E user, explicitly so the onboarding gate passes and login settles on `/dashboard`. The new `hasResume && !hasGoal → /onboarding` gate below will therefore redirect the E2E user, breaking `e2e/auth.setup.ts:43-46` (`goto('/dashboard')` → `toHaveURL(/\/dashboard/)`). That fails the `setup` project, which fails EVERY spec depending on `storageState: '.auth/user.json'` (incl. `auth-session.spec.ts:19` and `stripe-checkout.spec.ts:62`).

Fix: alongside the existing idempotent resume seed, upsert `career_targets` for the same `userId` with a non-empty `professional_goal` (e.g. `'E2E baseline goal — Software Engineering role 2027'`) and `professional_goal_set_at`. Use the same admin client and the same skip-if-already-present idempotency. Seed the GOAL, do not weaken the gate.

**A. `ProtectedRoute.tsx` — the route/data gate.**
In the `!skipOnboardingCheck` block (`:39-60`), alongside the existing `resumes` lookup, also select `career_targets.professional_goal` for the session user. **`Promise.all` the two queries** so this does not add a serial round-trip to every protected navigation.
```
if (!hasResume && pathname !== '/onboarding')            -> navigate('/onboarding')   // unchanged
if (hasResume && !hasGoal && pathname !== '/onboarding') -> navigate('/onboarding')   // NEW
```
Preserve the existing fail-open posture EXACTLY: the 6s timeout safeguard, the `console.error`-and-continue on query error, and the catch-block fail-open all stay. A goal-check *error* must never trap the user — only a definitive "no goal" redirects.

**B. `useOnboardingStatus.ts`.**
Widen the `career_targets` select to include `professional_goal`. Add `hasProfessionalGoal: boolean` and `professionalGoal: string | null` to `OnboardingStatus`. Change `hasCompletedOnboarding = hasResume` → `hasResume && hasProfessionalGoal`. Leave the `profileStrength` math untouched (it is not a readiness score; nothing in scope depends on it).

**C. `src/hooks/__tests__/useOnboardingStatus.test.ts`** (vitest, mock `@/lib/supabaseClient`):
- resume + goal → `hasCompletedOnboarding === true`.
- resume, NO goal → `hasCompletedOnboarding === false`, `hasProfessionalGoal === false`. **The legacy-user case — the load-bearing assertion.**
- whitespace-only goal (`'   '`) → `hasProfessionalGoal === false` (must not satisfy the gate).
- no resume → `hasCompletedOnboarding === false`.
  </action>
  <verify>
- `rg -n --fixed-strings 'professional_goal' src/components/ProtectedRoute.tsx src/hooks/useOnboardingStatus.ts` hits both.
- `rg -n --fixed-strings 'Promise.all' src/components/ProtectedRoute.tsx` confirms the goal check runs parallel to the resume check, not serially.
- `npx vitest run src/hooks/__tests__/useOnboardingStatus.test.ts` passes.
- `npm run lint && npm run type-check` pass.
- Manual: a user with a resume and NULL `professional_goal` who types `/dashboard` directly is redirected to `/onboarding` Step 4 and cannot return to `/dashboard` until the goal is saved. A fully-onboarded user is never redirected. Simulating a `career_targets` query ERROR does NOT trap the user (fail-open preserved).
  </verify>
  <done>No user can reach /dashboard without a saved professional goal, by direct navigation or otherwise. The gate is enforced at the route/data level, adds no serial round-trip, and preserves the existing fail-open error posture.</done>
</task>

<task type="auto">
  <name>Task 6: Dashboard rewire — goal line, persisted Goal Readiness (hero + Readiness Matrix), ResumeVault/Tabs removal</name>
  <files>
src/lib/dashboard-intelligence/goal-readiness.ts
src/lib/dashboard-intelligence/goal-readiness.test.ts
src/lib/dashboard-intelligence/types.ts
src/lib/dashboard-intelligence/index.ts
src/pages/Dashboard.tsx
e2e/dashboard-intelligence.spec.ts
  </files>
  <action>
**A. `goal-readiness.ts` — a READ-ONLY PARSER. It contains NO scoring math.**
`parseGoalReadiness(score: number | null, components: unknown): GoalReadinessModel` defensively validates the persisted jsonb into a render model:
```ts
type GoalReadinessComponent = { id: string; label: string; weight: number; score: number; evidenced: boolean };
type GoalReadinessModel = {
  status: 'no_goal' | 'no_evidence' | 'ready';
  score: number | null;
  components: GoalReadinessComponent[];
  unevidenced: GoalReadinessComponent[];
  partialEvidence: boolean;
  evidencedWeight: number;      // e.g. 75 -> "based on 75% of the rubric"
  interpretation: string;
  blockers: string[];
};
```
Malformed/absent jsonb → a safe `no_evidence` model, never a throw (the `profile-alignment.ts` defensive posture). **Never recompute, re-weight, clamp-up, or "fix" the score here.** Add the types to `types.ts`; re-export from `index.ts` (barrel is `export * from './x'`).

`goal-readiness.test.ts` (vitest): well-formed jsonb parses to the right model; missing/null/garbage/wrong-typed jsonb returns a safe model without throwing; `unevidenced` is derived correctly; `partialEvidence` is surfaced; parsing is deterministic. Plus a guard assertion that the module exports no weight constants and performs no renormalization (the Task 3A static guard enforces the same from the Deno side — the math must live in SQL alone).

**B. Data.** Add `useProfessionalGoal()` (Task 4A) and:
```ts
const goalReadiness = useMemo(
  () => parseGoalReadiness(goal_readiness_score, goal_readiness_components),
  [goal_readiness_score, goal_readiness_components],
);
```
**That is the entire compute path on load: one column read and a parse.** No hash, no evidence projection, no edge-function invoke, no latch, no AI. Every trace of the old cache/recompute design is gone.

**C. DELETE the decorative formulas — including the prop plumbing.**
- Delete `const careerReadiness = clampScore(latestResumeScore * 0.42 + ...)` (`:334-340`) **entirely**. It must not survive under a new name.
- Remove its plumbing too, or the build breaks: the `careerReadiness={careerReadiness}` prop pass at **`:537`**, the `careerReadiness,` destructure at **`:631`**, and the `careerReadiness: number;` prop type at **`:639`**. Replace with the `goalReadiness` model. (`:345`/`:346` command-card and `:691`/`:699` hero usages are covered by sections D and F below.)
- Delete the decorative `radarItems` math (`:467-475`) — specifically the `latestResumeScore - 4`, `latestResumeScore + 3`, and `latestLinkedInScore - 8` fabrications.

**D. `CareerHero` (`:626-706`).**
- **Goal line**: directly beneath the existing `<p>Track your resume, LinkedIn, job readiness...</p>` (`:668`), add ONE subtle line — `Current Goal — {display}`, where `display` is the structured form (`role • location • year`) when `professional_goal_structured` has values, else the RAW `professional_goal` verbatim. Muted/small (`text-sm text-muted-foreground`), semantic tokens only. Add a small inline ghost/icon edit button opening `GoalEditDialog` (Task 7). Do NOT enlarge, restructure, or redesign the hero.
- **Readiness panel** (`:687-701`): `Live readiness` → `Goal Readiness`. Big number → `goalReadiness.score ?? '--'`.
- **MiniMeters** (`:698-700`): **delete the hardcoded `76` and `84` literals.** Render the three highest-weighted components from `goalReadiness.components` with their real labels + scores. An un-evidenced component renders `muted` (the `MiniMeter` prop already exists) and reads as missing data — never a 0% bar. Keep exactly three meter slots so the hero's height and layout are unchanged.
- **Partial-evidence indicator (§9f)**: when `goalReadiness.partialEvidence`, show a subtle line in the readiness panel naming what is missing and the coverage — e.g. *"Based on {evidencedWeight}% of your profile. Add LinkedIn to complete the picture."* Muted, semantic tokens, no layout growth.

**E. `CareerRadar` / Readiness Matrix (`:778-819`) — REWIRE, do not redesign (§8a).**
Keep the **exact** layout, styling, conic-gradient ring, `SectionHeader`, row markup, `MiniMeter` usage, and the Elite footer note. Only the NUMBERS change:
- Delete the local `average` computation (`:779`). The 4xl headline becomes `goalReadiness.score ?? '--'` — **byte-identical to the hero's number, from the same persisted value**. Relabel the caption `Radar avg` → `Goal Readiness` (the old caption would now be a lie).
- Feed the rows from the persisted components, preserving the 7-row list and order:

  | row label | new source |
  |---|---|
  | Resume Quality | `resume_quality` component |
  | LinkedIn Quality | `linkedin_strength` component (un-evidenced → `locked`, reads "Needs data") |
  | ATS Keywords | `goal_keyword_coverage` component |
  | Experience Strength | `evidence_depth` component |
  | Job Fit | `jobReadiness` — **UNCHANGED** (§8b, see `<scope_boundary>`) |
  | Interview Readiness | `0` / `locked: true` / "Coming Soon" — **UNCHANGED** (no rubric component backs it) |
  | Networking Strength | **relabel to `Profile Consistency`** (§8g, user-ratified) and source from the `profile_consistency` component. It was fabricated (`latestLinkedInScore - 8`) with no evidence source; keeping the old label on the new number would be a fresh lie. |

  A row whose component is un-evidenced uses the existing `locked` path ("Needs data" + muted meter) — never a 0% bar. The `goal_alignment` component has no radar row; it surfaces in the hero MiniMeters.

**F. `commandCards[0]` (`:343-354`).** Keep the card, icon, tone, position, and layout **exactly**. Label `Career Readiness Score` → `Goal Readiness`. `value` → `goalReadiness.score != null ? String(goalReadiness.score) : '--'`. `trend`/`insight` describe goal support, never offer probability, and say so honestly when there is no goal or no evidence.

**G. Intentional-drop copy (§8f).** Renormalization means adding a new low-scoring evidence source can LOWER the score (resume 82 → LinkedIn grades at 55 → readiness drops). This is correct and must not read as a bug. Frame it as newly-revealed evidence — e.g. *"Your LinkedIn is now factored in. New evidence can move this number in either direction — it reflects what Strivo can actually see."* (exact wording is Claude's discretion). It must never read as an error or a regression.

**H. Remove ResumeVault + the Tabs shell (UI ONLY).**
- Delete the entire `<Tabs>` block (`:590-618`) — `TabsList`, both `TabsTrigger`s, both `TabsContent`s.
- Render `<SavedJobsDashboard ... />` directly in its place, same props, same `mb-10` wrapper spacing.
- Delete the `ResumeVault` function (`:821-941`).
- Drop the now-unused `Tabs, TabsList, TabsTrigger, TabsContent` import (`:33`) and any icon/helper import ResumeVault alone used (let `npm run lint` identify them — do NOT remove `getScoreStatus`/`getScoreTone`/`formatDate`/`pickStrings` if anything else still uses them).
- **UI-ONLY.** Do NOT delete the `resumes` `useInfiniteQuery` or `handleDeleteResume` if anything still references them, and do NOT touch `/results/*`, `/improvements/*`, `/history`, or any DB record. If lint proves a symbol is genuinely dead, removing it is fine — deleting a *route, query, or table* is not.

**H2. `e2e/dashboard-intelligence.spec.ts` — reconcile the E2E spec, or Task 7's ship gate cannot go green.**
The spec hard-asserts the exact surfaces H deletes: `resumeVault` (`:12`, the `Every Version, Ranked` heading) `toBeVisible()` at `:20`, `savedJobsTab` (`:13`, the `Saved Jobs` **tab** role) , and two `appearsBefore` ordering assertions routed through `resumeVault` (`:44`, `:45`). Update it — this is a Rule-1 stale-test reconciliation (the test encoded the OLD contract), the same pattern used in Phase 04/05:
- Flip `resumeVault` and `savedJobsTab` to removal proofs (`toHaveCount(0)`), joining the existing removed-surface assertions rather than inventing a new idiom.
- Delete the two `appearsBefore(..., resumeVault)` / `appearsBefore(resumeVault, ...)` assertions and re-chain the ordering directly (`recruiterFirstImpression` → `profileAlignment`), preserving the rest of the order chain.
- ADD a positive assertion that the hero renders `Goal Readiness` (the new contract), so the spec proves the replacement, not just the deletion.

**I. Everything else untouched.** `NextBestActions`, `RecruiterFirstImpression`, `ProfileAlignment`, the four other command cards, the Elite banner, the merits banner, backgrounds, grid, responsive classes — byte-identical. `getJobMatchScore` (`:148`) and `jobReadiness` (`:330`) STAY (§8b).
  </action>
  <verify>
- `rg -n --fixed-strings 'careerReadiness' src/pages/Dashboard.tsx` returns NOTHING.
- `rg -n 'latestResumeScore - 4|latestResumeScore \+ 3|latestLinkedInScore - 8' src/pages/Dashboard.tsx` returns NOTHING (decorative radar math gone).
- `rg -n 'Radar avg|ResumeVault|TabsTrigger|Every Version, Ranked' src/pages/Dashboard.tsx` returns NOTHING.
- `rg -n --fixed-strings 'goalReadiness.score' src/pages/Dashboard.tsx` shows the hero big number, the Readiness Matrix headline, and `commandCards[0]` ALL reading the same parsed persisted value.
- `rg -n 'invoke|anthropic' src/pages/Dashboard.tsx` shows NO new call for readiness — the score is a column read.
- `rg -n --fixed-strings 'careerReadiness' src/pages/Dashboard.tsx` is empty INCLUDING the prop plumbing at the old `:537`/`:631`/`:639`.
- `rg -n 'Every Version, Ranked|getByRole..tab' e2e/dashboard-intelligence.spec.ts` shows only removal proofs (`toHaveCount(0)`), and the spec asserts `Goal Readiness` is visible.
- `npx playwright test e2e/dashboard-intelligence.spec.ts e2e/auth.setup.ts` passes (the E2E user is seeded with a goal by Task 5, so the gate does not bounce it).
- `npx vitest run src/lib/dashboard-intelligence/goal-readiness.test.ts` passes; `npm run lint && npm run type-check && npm run test` pass.
- Manual: the hero shows `Current Goal — …`; the hero number and the Readiness Matrix headline show the SAME value; a user with no LinkedIn sees the LinkedIn meter AND the LinkedIn Quality radar row as "Needs data" (NOT 0%) plus the partial-evidence line; the "Every Version, Ranked" section and the tab bar are gone with Saved Jobs rendering directly; `/results/:id`, `/improvements/:id` and `/history` all still work.
  </verify>
  <done>The hero and the Readiness Matrix render one identical, real Goal Readiness score read straight from the persisted column; all three decorative formulas are gone; missing evidence reads as missing data and partial evidence is clearly indicated; the intentional-drop case is explained in copy; the dashboard makes zero scoring calls of any kind on load; ResumeVault and the tab shell are gone with all resume data and routes intact; every other section is unchanged.</done>
</task>

<task type="auto">
  <name>Task 7: Goal editing (hero + Profile) and the verify:baseline gate</name>
  <files>
src/components/dashboard/GoalEditDialog.tsx
src/pages/Dashboard.tsx
src/pages/Profile.tsx
  </files>
  <action>
**A. `GoalEditDialog.tsx`** — one shadcn `Dialog` reused by BOTH surfaces:
- Pre-filled with the current RAW `professional_goal` (never the structured form — raw text is the source of truth for editing).
- Same input affordance and the same reassurance line as Step 4 (`You can update this goal at any time.`), including `maxLength={500}` to match the DB `CHECK` from Task 1A.
- Save disabled while the trimmed value is empty — the goal can be CHANGED but never CLEARED (an empty goal would bounce the user back to onboarding via the Task 5 gate).
- On save: `await saveGoal(raw)` → success toast (`sonner`) → invalidate the goal query. The Task 2 trigger has ALREADY recomputed and persisted the new readiness inside that same write, so the refetch returns the updated score. **No AI call, no edge-function invoke, no background recompute latch.**
- Semantic design tokens only.

**B. Dashboard hero** — wire the edit affordance added in Task 6D to this dialog.

**C. `Profile.tsx`** — add a "Professional Goal" `Card` following the existing card pattern (`:439`, `:604`, `:698`). Display the raw goal + `professional_goal_set_at`, with an Edit button opening the same `GoalEditDialog`. Place it above the existing Subscription & Billing card (the goal is now the product's anchor). Change nothing else on the page.

**D. Ship gate.**
```
npm run verify:baseline     # vitest + offline-deno + Playwright
```
MUST be green. If a pre-existing Playwright/E2E leg is environment-gated (the repo has a documented E2E-secrets deferral), record that explicitly in the SUMMARY rather than silently skipping it.

**E. SUMMARY must record:**
- **Zero-AI confirmation**: Goal Readiness adds no Anthropic call and no token cost; the scorer is SQL and structurally cannot make one; `cors-audit` stayed at 20 and `sanitizer-coverage` at 5 (no new edge function, no new AI ingester).
- The **gated-remote rubric suite output** (Task 3B, run against preview) — pasted in full.
- **Both production migrations are OWED to the operator** (preview only was applied) — exact filenames + their rollback SQL.
- The **trigger-coverage** decision, the four evidence tables covered (INSERT + UPDATE triggers each), and the column-scoped `WHEN` recursion guard (NOT `pg_trigger_depth`).
- The **tamper-resistance mechanism**: column-level `GRANT`s on `career_targets` (a `session_user` guard would have been a no-op under PostgREST's `authenticator` → `SET LOCAL ROLE authenticated` model).
- The **money-path hardening**: the scorer's early-return when no goal exists, plus the two new indexes — the scorer runs inside the `analyze-resume` save tail and `statement_timeout` is not caught by `EXCEPTION WHEN OTHERS`.
- The **two E2E reconciliations** (`e2e/global-setup.ts` goal seed; `e2e/dashboard-intelligence.spec.ts` removal proofs) — Rule-1 stale-test updates, not gate weakening.
- The `getJobMatchScore` (`:148`) / `jobReadiness` (`:330`) follow-up from `<scope_boundary>` (§8b): a known-fake score fabricated from resume score alone with no job-specific evidence.
- The chosen rubric weight distribution and the deterministic goal-parsing rules.
  </action>
  <verify>
- `npm run verify:baseline` is green.
- `rg -n --fixed-strings 'GoalEditDialog' src/pages/Dashboard.tsx src/pages/Profile.tsx` hits both (ONE shared component, not two implementations).
- `rg -n --fixed-strings 'score-goal-alignment' src/ supabase/` returns NOTHING — the AI surface exists nowhere in the repo.
- Manual: editing the goal from the hero AND from Profile both persist the new raw text, both surface it immediately in the hero, and Goal Readiness updates on the same refetch (no second round-trip, no spinner, no AI wait).
- Manual: the goal cannot be saved empty from either surface.
  </verify>
  <done>The goal is editable from the dashboard hero and Profile via one shared dialog; edits recompute readiness synchronously via the DB trigger with zero AI; `verify:baseline` is green; the gated-remote rubric proof and both owed production migrations are recorded in the SUMMARY.</done>
</task>

</tasks>

<verification>
1. **Zero AI (§9a/§9b/§9g)**: no `score-goal-alignment` function exists anywhere; no Anthropic/LLM call is added; the scorer is plpgsql and structurally cannot make one (the offline guard asserts no `pg_net`/`http_post`); `cors-audit.test.ts` stays at 20 and `sanitizer-coverage.test.ts` stays at 5.
2. **Compute on write, read on load (§9c)**: the dashboard's entire readiness path is one column read + a parse. Triggers on all four evidence tables recompute on every write path — proven by the offline trigger-coverage guard and the gated-remote suite.
3. **Goal gate**: a preview user with a resume and `professional_goal IS NULL` cannot reach `/dashboard`; direct navigation lands on Step 4 with Steps 1-3 complete. Saving the goal grants access AND persists a score in the same transaction. No goal was inferred; the raw wording is byte-preserved.
4. **One source of truth (§8a)**: `rg careerReadiness src/pages/Dashboard.tsx` is empty. Hero number, hero MiniMeters, Goal Readiness command card, and the Readiness Matrix headline all render the same persisted value.
5. **Missing data, not zero (§8d)**: the gated-remote suite proves a resume-only user's `linkedin_strength` is `evidenced: false`, dropped from BOTH numerator and denominator, and that the score is strictly higher than the zero-with-weight-kept alternative. The UI renders it as "Needs data".
6. **Partial evidence (§9f)**: `partial_evidence` + `evidenced_weight` are persisted and surfaced in the hero.
7. **Reproducible + improvable (§9f)**: re-running the scorer on unchanged evidence yields an identical breakdown; raising resume/LinkedIn scores strictly raises the total.
8. **Intentional drop (§8f)**: proven possible by test and explained in UI copy.
9. **Tamper-resistance / owner-scoping**: the score is not client-writable, and user A's score is not readable by user B.
10. **Data preservation**: both migrations are additive (`ADD COLUMN IF NOT EXISTS`), ship rollback SQL, backfill nothing, and were applied to preview; production stays operator-gated. `/results/*`, `/improvements/*`, `/history` and all resume/analysis rows survive the ResumeVault removal.
11. **Ship gate**: `npm run verify:baseline` green.
</verification>

<success_criteria>
- Goal Readiness adds **zero** incremental AI calls and **zero** token cost — structurally, not by discipline.
- The score is deterministic, evidence-based, reproducible, computed server-side on every evidence write, and persisted; the dashboard only reads it.
- Onboarding is 4 steps at 25/50/75/100 with the exact locked Step 4 copy and a required, verbatim-preserved free-text goal.
- Legacy users are forced through Step 4 only — never Steps 1-3 — and cannot bypass it at the route or data level.
- The hero AND the Readiness Matrix render one identical, REAL Goal Readiness value.
- Missing LinkedIn is transparently missing data, never a silent low score; partial evidence is clearly indicated; the intentional-drop case is tested and explained.
- The decorative `careerReadiness` formula, the hardcoded `76`/`84` literals, and the decorative `radarItems` math no longer exist.
- "Every Version, Ranked" and the tab shell are gone from the dashboard UI; all resume data, routes, and comparison functionality are intact.
- The goal is editable from the dashboard hero and Profile.
- Every other dashboard surface is behaviorally unchanged.
- `npm run verify:baseline` is green; both production migrations are recorded as OWED to the operator.
</success_criteria>

<output>
After completion, create `.planning/quick/260712-msh-anchor-product-around-one-professional-g/260712-msh-SUMMARY.md`
</output>
</content>
