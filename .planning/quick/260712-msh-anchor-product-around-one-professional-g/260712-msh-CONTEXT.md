# Quick Task 260712-msh: Anchor product around one professional goal - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Task Boundary

Anchor the entire Strivo product around ONE user-stated professional goal:

1. Add onboarding Step 4 — "Set Your Professional Goal" (required, free text, preserves user wording).
2. Persist the goal; make it editable later from dashboard / account settings.
3. Surface the goal near the top of the existing "Your Career OS" hero (subtle, no redesign).
4. Convert the hero's "Live Readiness" into a REAL "Goal Readiness" score (0-100) computed from career evidence.
5. Remove the "Every Version, Ranked" section from the dashboard UI (UI only — no data/logic deletion).
6. Change nothing else on the dashboard.

</domain>

<decisions>
## Implementation Decisions — LOCKED

### 1. Goal Readiness scoring architecture — ⚠️ SUPERSEDED BY §9 (DETERMINISTIC-ONLY)

> **THIS SECTION IS OBSOLETE.** The hybrid (deterministic + cached AI) architecture below was
> REVOKED by the user after plan-check iteration 2. Goal Readiness must add **ZERO** incremental
> AI cost. See **§9 — Deterministic-Only Goal Readiness (BINDING)** at the bottom of this file.
> The rubric, missing-LinkedIn, one-source-of-truth, and improvability rules below all STILL
> APPLY — only the AI/cache/edge-payload machinery is removed. §8c is void (there is no
> projection, no hash, no cache-miss call). Kept below for provenance only.

### 1 (OBSOLETE). Goal Readiness scoring architecture — HYBRID (deterministic + cached AI alignment)

- A deterministic rubric over already-normalized evidence in `src/lib/dashboard-intelligence/`
  (resume score/quality, target-role ATS keywords, experience & demonstrated impact,
  LinkedIn strength, resume–LinkedIn consistency, missing-evidence penalties).
- PLUS one AI-derived **semantic goal-alignment sub-score** (how well the resume/LinkedIn
  actually support the stated goal), **cached** keyed on a hash of
  (professional_goal, resume evidence, linkedin evidence).
- The dashboard MUST NOT pay AI latency or cost on every load — it reads the cached
  alignment sub-score. Recompute only when the goal or the underlying evidence changes.
- The score MUST be a real raw computed value. The existing decorative formulas
  (`Dashboard.tsx:334` `clampScore(latestResumeScore * 0.42 + ...)`, the hardcoded
  hero MiniMeter literals `76` / `84`, and `Dashboard.tsx:148`) are REPLACED, not renamed.
- **One source of truth:** every dashboard component that displays overall readiness reads
  the same computed value. No parallel/duplicate readiness math anywhere.
- The score MUST improve when the user meaningfully applies Strivo's resume/LinkedIn
  feedback and the profile becomes more aligned with the goal.
- **Missing LinkedIn must surface transparently as MISSING DATA**, not as a low/zero score.
  Do not silently penalize absence of LinkedIn — represent it as an un-evidenced component.
- The score is explicitly NOT a claimed probability of receiving an offer. It is a
  transparent measure of how strongly the current profile supports the stated goal.

### 2. Existing (legacy) users — FORCED THROUGH STEP 4 ONLY

Route guard logic becomes:
- **No resume** → normal onboarding from Step 1.
- **Resume exists but NO professional goal** → redirect directly to onboarding **Step 4**.
- **Resume AND professional goal exist** → dashboard access allowed.

Rules:
- Do NOT restart onboarding for legacy users and do NOT make them repeat Steps 1-3.
  Show Steps 1-3 as already completed; open directly on Step 4.
- Update `checkExistingOnboarding()` in `src/pages/Onboarding.tsx` AND all relevant
  onboarding/dashboard route guards (`src/components/ProtectedRoute.tsx`,
  `src/hooks/useOnboardingStatus.ts`) accordingly.
- The professional goal MUST be saved before dashboard access is granted.
- Add protection at the **route/data level** so a user cannot bypass Step 4 by manually
  navigating directly to `/dashboard`.
- **Do NOT auto-generate, infer, or backfill a goal** from target roles, resume content,
  or LinkedIn data. The user must personally type and confirm one goal.
- After the goal is saved: persist it, mark the updated onboarding flow complete,
  redirect to the dashboard, and compute Goal Readiness using the newly saved goal.
- **Preserve all existing** resume, LinkedIn, target-role, subscription, merit, analysis,
  and onboarding data. This is additive — no destructive migration.

### 3. "Every Version, Ranked" removal — DROP THE TAB SHELL

- Remove the `ResumeVault` section from `Dashboard.tsx` **and** the now-pointless 2-tab
  `Tabs` wrapper (`Dashboard.tsx:590`). Render `SavedJobsDashboard` directly as a section.
- Removal is **UI-only**. Do NOT delete resume versions, analysis history, comparison
  functionality, database records, or backend logic. Resume access via Results pages and
  all underlying data/queries remain fully intact.

### 4. Onboarding progress — 4 STEPS

- Step 1 = 25%, Step 2 = 50%, Step 3 = 75%, Step 4 = 100%.
- Replace the hardcoded `step / 3` math in `Onboarding.tsx` (progress label + `Progress` value).

### 5. Step 4 copy (exact)

- Title: **"Set Your Professional Goal"**
- Supporting text: *"Tell Strivo the one professional outcome you are currently working
  towards. We'll use your resume, LinkedIn, and future improvements to help you get closer to it."*
- Placeholder: *"e.g. Investment Banking Internship in New York — 2027"*
- Reassurance beneath input: *"You can update this goal at any time."*
- Required to complete onboarding.

### 6. Goal storage & normalization

- Preserve the user's **original wording** verbatim as the source of truth for display.
- Strivo MAY additionally store a normalized/structured form (e.g. role / location / timeframe)
  for personalization — but the raw text is never overwritten.
- Hero displays e.g. `Current Goal — Investment Banking Internship • New York • 2027`,
  falling back to the raw text when no structured form is available.
- Editable later from the dashboard and/or account settings (`src/pages/Profile.tsx`).

### 7. Dashboard — everything else UNCHANGED

Keep exactly as-is: Your Next 3 Moves, Readiness Matrix, Recruiter First Impression,
Profile Alignment, navigation, feature cards, Free/Elite behavior, visual design,
responsive behavior. Hero is NOT redesigned or enlarged — the goal line is visually subtle
and consistent with the current premium design.

### 8. Arbitrations (added post-plan-check — LOCKED)

The plan-checker surfaced three genuine contradictions in decisions 1/7. User arbitration:

**8a. Readiness Matrix "Radar avg" → REWIRE to Goal Readiness.**
`CareerRadar` (`Dashboard.tsx:779`) renders a 4xl "Radar avg" headline fed by decorative
math (`radarItems` at :470-474: `latestResumeScore - 4`, `+ 3`, `- 8`). Shipping it unchanged
would put two disagreeing readiness numbers on one dashboard, falsifying "one source of truth".
- The Readiness Matrix keeps its **exact layout, styling, section header, and rows**.
- Its headline number becomes the **real Goal Readiness score** (same value as the hero).
- Its rows are fed by the **real rubric components** from the Goal Readiness engine.
- Visually unchanged; only the numbers become real. This SUPERSEDES the "Readiness Matrix
  keep exactly as-is" clause in decision 7, which meant *visual/layout* preservation.

**8b. `getJobMatchScore` (`Dashboard.tsx:148`) → LEAVE IN PLACE, log as follow-up.**
It feeds the Job Match card / radar Job Fit / per-job match score — NOT overall readiness.
Out of scope for goal anchoring. It remains a known-fake score (fabricated from resume score
alone with no job-specific evidence). The executor MUST record it in SUMMARY.md as a
follow-up task. This narrows decision 1's "replace :148" clause: "one source of truth" is
scoped to **overall readiness**, which `:148` does not display.

**8c. Cache key → CLIENT SENDS THE EVIDENCE PROJECTION.**
The original design had the client and the edge function each derive the cache key from
different code paths (client: `normalizeDashboardIntelligenceInputs`; server: hand-rolled
re-derivation from DB rows). They would drift → permanent hash mismatch → an Anthropic call
on EVERY dashboard load, defeating the "zero AI on load" guarantee entirely.
- The **client** computes the `GoalEvidence` projection AND its hash, and POSTs both.
- The **server NEVER re-derives evidence from DB rows.** It recomputes the hash from the
  received projection (integrity check), compares to the cache, and only calls Anthropic on
  a miss. This deletes the entire drift class.
- The server MUST still sanitize the projection via `prompt-sanitizer.ts` before LLM ingest.
- Do NOT mirror `inputs.ts` into `_shared/`.

**8d. Do NOT cite `normalizeFromSections` (`grade-linkedin/schema.ts`) as the renormalization
precedent.** That function does the OPPOSITE of what's needed: it plain-sums applicable
sections so inapplicable ones *lower the achievable ceiling* — i.e. exactly the silent
missing-LinkedIn penalty decision 1 bans. The correct spec is the inline formula:
`Σ(component.score/100 × weight) / Σ(weight)` over **evidenced components only** (drop
un-evidenced components from BOTH numerator and denominator). There is no repo precedent
for true renormalization — cite none.

**8e. `verify_jwt = false`** for the new edge function in `supabase/config.toml`, matching
every other user function (auth is done in-function via `requireAuth`). `verify_jwt = true`
would break CORS preflight.

**8f. Renormalization means adding LinkedIn can LOWER the score** (a user with a resume at 82
who then grades a LinkedIn at 55 sees Goal Readiness drop). This is mathematically honest and
decision-1-compliant, but reads as a bug. Handle it with explicit UI copy framing the drop as
newly-revealed evidence, and add a unit test asserting the drop is POSSIBLE and INTENTIONAL —
so no one later "fixes" it by zeroing missing components (which would re-break the
missing-LinkedIn rule).

**8g. Readiness Matrix row relabel — APPROVED.** `Networking Strength` → `Profile Consistency`.
The row was fabricated (`latestLinkedInScore - 8`) with no evidence source. The real rubric has a
resume–LinkedIn consistency component, so the new label describes what the number actually measures.
Keeping the old label on the new number would be a fresh lie. This is a ratified exception to §8a's
"visually unchanged" clause.

---

## §9 — DETERMINISTIC-ONLY GOAL READINESS (BINDING — SUPERSEDES §1 AND §8c)

**Hard requirement: Goal Readiness must create ZERO additional Anthropic, LLM, or external AI cost.**

### 9a. Remove ALL Goal-Readiness-specific AI machinery

Delete from the plan entirely — none of this may be built:
- Anthropic / LLM / semantic-scoring calls
- AI cache infrastructure (`goal_alignment_cache`, evidence hashes, cache-miss branches)
- Evidence-projection API payloads (client→server `{ goal, evidence, evidenceHash }`)
- Token-cost logic and AI rate-limit logic introduced for this feature
- The `score-goal-alignment` edge function (and its `config.toml` / `deno.json` / sanitizer-coverage
  / cors-audit enrollments — those guard counts stay at 20 and 5, NOT 21 and 6)

### 9b. Goal Readiness must NEVER call an AI model when:

onboarding completes · a goal is created · a goal is edited · the dashboard loads · the dashboard
refreshes · resume data changes · LinkedIn data changes · existing analysis evidence changes ·
no cached score exists.

The Professional Goal feature itself must not generate **any** additional model call.

### 9c. Compute on write, persist the score (LOCKED)

- The deterministic scorer runs **server-side**, triggered when evidence changes: goal saved/edited,
  resume analyzed, LinkedIn graded, relevant analysis written.
- It **persists** the score + component breakdown to the DB.
- The dashboard **only READS** the persisted value. Zero compute and zero network scoring work on load.
- This is tamper-resistant, genuinely one source of truth, and auto-updates when evidence changes.

### 9d. Score must be derived from ALREADY-PERSISTED Strivo data

Reuse existing evidence and outputs already generated by existing features:
- existing Resume Analysis scores and findings; resume quality and section scores
- target-role ATS keyword coverage
- relevant experience; quantified impact
- existing Recruiting Lens outputs
- existing LinkedIn Grader scores and findings
- resume–LinkedIn consistency
- missing skills / experience / evidence / recruiter signals
- selected target roles and industries
- professional-goal text parsed with **deterministic rules only**

### 9e. Goal parsing — deterministic only

Preserve the user's original goal wording **exactly**. Any internal extraction of role, industry,
location, opportunity type, or target year MUST use deterministic parsing and the **existing role
taxonomies** only (e.g. `ROLE_OPTIONS` / `INTEREST_OPTIONS` in `Onboarding.tsx`). No model call.

### 9f. The score must still

- remain a real, evidence-based 0–100 score (never decorative, random, or static)
- be **stable and reproducible** (same evidence in → same score out; pure function, unit-testable)
- update automatically when persisted resume / LinkedIn / analysis evidence changes
- use ONE source of truth across the hero AND the Readiness Matrix
- transparently show LinkedIn as **missing data** when unavailable — never as poor performance
- clearly indicate when readiness is calculated from **partial evidence**

### 9g. Scope of this requirement

Existing paid Strivo features (Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens,
Interview Prep) continue operating exactly as they already do, AI calls included. This requirement is
specifically that **Goal Readiness adds zero incremental AI calls and zero incremental token cost.**

### Claude's Discretion

- Exact deterministic weight distribution across rubric components.
- Where the persisted score + component breakdown live (new column(s) vs. new table).
- The exact server-side recompute trigger mechanism (DB trigger / RPC / edge-function hook on the
  existing analysis write paths) — as long as it is deterministic, zero-AI, and fires on every
  evidence change listed in §9c.
- Deterministic goal-parsing rules and how they map onto the existing role/industry taxonomies.
- Component file layout for the new goal input and goal-edit dialog.
- Exact UI copy for the §8f "score dropped because new evidence appeared" case and the §9f
  "partial evidence" indicator.

</decisions>

<specifics>
## Specific Ideas

- Canonical example goal: user types `"IB internship 2027 in NY"` → Strivo preserves that
  wording, may structure it internally as
  `{ role: "Investment Banking Internship", location: "New York", timeframe: "2027" }`.
- The product must continuously answer: *"How close is my current professional profile to
  this goal, what is holding me back, and what should I improve next?"*

</specifics>

<canonical_refs>
## Canonical References

- `src/pages/Onboarding.tsx` — 3-step flow, `checkExistingOnboarding()`, `handleFinishSetup()`.
- `src/pages/Dashboard.tsx` — `CareerHero` (goal line + Goal Readiness), decorative score at
  :148 and :334, `Tabs` at :590, `ResumeVault` at :821.
- `src/lib/dashboard-intelligence/` — existing normalized signal layer (`inputs.ts`,
  `types.ts`, `profile-alignment.ts`, `recruiter-first-impression.ts`). Goal Readiness
  belongs here as the single source of truth.
- `career_targets` table (user_id, target_roles, target_industries) — natural home for the goal.
- `src/components/ProtectedRoute.tsx`, `src/hooks/useOnboardingStatus.ts` — route guards.
- `CLAUDE.md` — semantic design tokens (no hardcoded colors), Supabase migration + rollback
  rules, preview-before-production policy.

</canonical_refs>
