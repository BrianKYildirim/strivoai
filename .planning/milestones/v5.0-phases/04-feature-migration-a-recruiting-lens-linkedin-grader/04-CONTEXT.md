# Phase 4: Feature Migration A — Recruiting Lens + LinkedIn Grader - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Route the **two smallest-blast-radius synchronous features** — Recruiting Lens and LinkedIn
Grader — through the **dormant Phase 3 shared analysis lifecycle** (authenticate → validate
inputs → create/recover run → atomically reserve Merits → extract → generate → strictly validate
output → save → settle → complete → recover), flipping each feature's per-feature flag
independently, and **rebuild LinkedIn scoring** so the final total is computed mathematically
server-side from **11 deterministic, evidence-backed section scores** that meaningfully separate
weak / average / strong / exceptional profiles (VER-03).

Recruiting Lens is a **preserve-exactly migration** (its approved product experience + output
quality are byte-preserved; only reliability/persistence/idempotency/Merit-safety/recovery are
added) plus a **re-proof** of the already-centrally-fixed cross-origin path. LinkedIn Grader is a
**scoring redesign** (the real product work of this phase).

**Requirements:** FEAT-03 (deterministic evidence-based LinkedIn scoring, no fixed-score sources),
FEAT-04 (reliable repeated LinkedIn runs), FEAT-06 (Recruiting Lens CORS + full-standard
verification, product preserved), VER-03 (weak/avg/strong/exceptional differentiation proof).

This phase clarifies **HOW** the two features adopt the substrate and how LinkedIn scoring is
rebuilt. It **does not** re-debate the Phase 3 substrate contracts (idempotency-key derivation,
refund-exactly-once, retry model, recovery hook, error taxonomy, dormancy flags) — those are
LOCKED and carried in. It must keep `verify:baseline` green and fold its new tests in.

**Carried in from Phase 3 (LOCKED — do not re-open):**
- The 11-state lifecycle, `create_or_recover_analysis_run()` / `transition_analysis_run()` CAS
  RPCs, partial-UNIQUE active-per-feature index, `CHECK (NOT (merit_settled AND refunded))`.
- **Edge-derived idempotency key** = `hash(user + feature + tier + input-identity + attempt-nonce)`;
  frontend sends an explicit "new run" signal, edge computes the key; key must be **cache-key-stable**
  (never composed from a save-mutated field like `prior_grade_id` — Pitfall 8). `withMerits` already
  forwards `ctx.idempotencyKey ?? null` to the 4-arg RPC; **Phase 4 supplies each feature's
  input-identity and threads the key** (Recruiting Lens passes NO key today — closing that gap is a
  Phase 4 deliverable).
- Refund/release **exactly once ONLY on a post-reserve pre-`saving` failure**; `saving → completed`
  is the point of no return; never charge for missing input / invalid output / unsaved result.
- Strict **no-masking** `_shared/llm-validation.ts` contract: an invalid/malformed/truncated
  response is NEVER silently replaced with a fixed score / empty object / generic / fabricated result.
- Structured error taxonomy + safe user-facing messages; `useAnalysisRun` recovery hook
  (subscribe-first / poll-fallback, `run_id` persistence, refresh/navigation recovery,
  retry-only-retryable, preserve-previous-success); per-feature flags + global kill-switch.

</domain>

<decisions>
## Implementation Decisions

**Operator stance (carried from Phases 2–3): MAXIMAL thoroughness / complete-the-migration.** Both
features ride the full lifecycle end-to-end (no scoped-down skeleton); LinkedIn scoring is rebuilt
completely, not patched. Operator-gated preview→prod for any DB/RLS touch; rollback SQL per migration.

### 1. LinkedIn rubric — 11 sections with **context-aware max** (missing-section fairness)
- **D-01:** Score the 11 mandated areas — **Headline, About, Experience, Education, Skills, Projects,
  Certifications, Achievements, Completeness, Career positioning, Recruiter discoverability**. A
  section that **legitimately doesn't apply** to a profile's stage/role is scored out of a **reduced
  max (or excluded)**, and the **total is normalized to the applicable sections** — so a strong senior
  IC with no "Projects" isn't floored and a new grad isn't unfairly penalized. This is the core lever
  for **"meaningfully differentiate without an artificial score range."**
- Each section carries **earned / max / evidence / strengths / weaknesses / improvements** (roadmap
  mandate). The **total is math-from-sections** (already the pattern today: `rawScore = Σ section.score`,
  reconciled server-side) — **the model NEVER invents the headline number.**
- Distinction (guards Pitfall 9): a **legitimately absent** section (D-04, honest low score) is
  different from a **non-applicable** section (reduced/excluded max). Both are honest; neither is
  mid-range filler.
- Rationale: chosen over "absence always = lost points out of 100" (compresses the strong end,
  unfair across career stages) and "core + bonus split." Context-aware max is the fairest path to a
  real, wide distribution.

### 2. Determinism — **fully deterministic; drop follow-up context; stable cache key**
- **D-02:** Identical input must **converge to the same total**. Achieve it with **explicit,
  evidence-anchored band definitions** (what a 3/20 vs 18/20 Headline looks like, tied to quoted
  profile evidence) so the model **discriminates instead of averaging** — NOT by lowering temperature
  further (low temp = consistently *central*, still wrong — Pitfall 8).
- **Remove the "follow-up context"** that injects the prior grade's JSON back into the prompt (root
  cause of second-run drift). **Fix the cache key** to stable input identity (profile content-hash +
  feature + tier + variant) — **exclude `prior_grade_id`** (the save-mutated field that made every
  rerun miss cache and re-anchor on the last score).
- **Eliminate all fixed-score sources** (FEAT-03): remove prompt-example numeric anchoring
  ("20-40" / "70-90" calibration ranges that pull scores toward the low-50s), no hardcoded/default/
  placeholder total, no DB default surfacing as a score, no frontend placeholder rendered as real
  (remove the `LOCKED_FIXES_PLACEHOLDERS` teaser once depth is ungated — see D-05), keep
  section clamping as bounds-only defense (must fire rarely).
- Rationale: chosen over "deterministic but keep follow-up" (reintroduces drift) and "allow slight
  variation." Directly closes Pitfall 8. Convergence proven by a **repeated-run determinism test**,
  not by trusting temperature.

### 3. Score bands — **recalibrate to the real distribution**
- **D-03:** Define score bands/labels against **where genuinely weak/avg/strong/exceptional profiles
  actually land** under the new rubric — not the old clustered curve. The current UI cutoffs (Top 5%
  ≥90 / Excellent ≥80 / Good ≥70 / Average ≥55 / Needs Work <55) are **recalibrated** with explicit
  band definitions that the **VER-03 test suite asserts against** (no ~52 clustering, real spread
  across the four bands).
- Rationale: chosen over "keep current cutoffs" — labels must match the new spread or the redesign's
  differentiation is invisible to users.

### 4. No-evidence handling — **honest low score with stated reason** (anti-masking)
- **D-04:** When the model **cannot cite specific profile evidence** for a section, that section earns
  a **genuinely low score** with the weakness/improvement explaining what's missing (e.g. "No About
  section found"). **Absence is real signal, scored honestly — never mid-range filler**; the total
  reflects it via the context-aware max (D-01).
- This is the **honest-scoring** path for *missing profile content*. The Phase 3 strict no-masking
  contract still **fails the run** (specific terminal error + Merit refund, per the lifecycle) for
  *genuinely malformed / truncated / unparseable model output* — the two are different failure classes.
- Rationale: chosen over "fail the run on any unanchored section" (too many user-visible failures for
  normal thin profiles). Honest low scores ARE the product signal a thin profile deserves.

### 5. LinkedIn tier gating — **everything to everyone (no depth gating); Free + Elite only**
- **D-05:** For LinkedIn, **both tiers see the full 11-section output** — all section scores,
  evidence, strengths, weaknesses, improvements, and the complete prioritized fix list. **No depth
  gating on LinkedIn.** The tier differentiator becomes **Merit budget (number of runs), not output
  depth.**
- **Tier model for LinkedIn is Free + Elite (there is NO Pro tier)** — matches the current code where
  Pro and Elite already share one prompt variant. Plans/prompts/validation should collapse to a
  **Free/Elite** shape, not Free/Pro/Elite.
- **Supersedes** the earlier "preserve current LinkedIn tiering" selection: this removes today's
  Free=1-fix / minimal-section-feedback restriction. Remove the `LOCKED_FIXES_PLACEHOLDERS` teaser
  cards (no longer real once Free sees all fixes).
- Rationale: user's explicit, more-specific final answer. Maximum transparency; Merit economics
  remain the paid differentiator.

### 6. Recruiting Lens — **preserve-exactly migration + CORS re-proof; stays Elite-only**
- **D-06:** Recruiting Lens keeps its **approved product experience + output quality byte-preserved**
  (the 3-call parallel merge, `RecruitingLensOutput` schema, tier shaping, Elite-only Free-403 gate).
  The migration **adds only** shared reliability: route through the **`inline` lifecycle driver**,
  thread the **edge-derived idempotency key** (currently NOT passed — the concrete gap), consolidate
  the **dual merit/legacy persistence paths** onto one lifecycle-driven path, gain persistence +
  refresh recovery + History + structured errors + repeated-run safety.
- **CORS is a re-proof, not a new code fix.** The function already uses the shared
  `withCors`/`corsHeaders` primitives (structurally identical to its peers). The "confirmed
  production cross-origin failure" is the **historical apex-vs-`www` outage Phase 1 fixed centrally**
  (single-origin `APP_URL` → `ALLOWED_ORIGINS` allowlist). Phase 4 must **re-verify** it live for
  **both** `strivoai.net` and `www.strivoai.net` and guard it: preserve the
  `serve((req) => withCors(req, 'user', () => handler(req)))` wrapper and ensure deployed
  `ALLOWED_ORIGINS` includes both origins. Watch the 401-without-CORS class (auth.ts now attaches
  CORS — keep it).
- Rationale: roadmap mandates "preserve the approved product experience and output quality." No
  product/UX change — reliability only.

### Claude's Discretion
- The **exact point allocation across the 11 sections** (what each section's max is, and the
  reduced-max / normalization math for D-01) — apply a defensible, documented weighting; the
  invariant is math-from-sections + a real spread, not specific per-section numbers.
- The **evidence-anchored band definitions** per section (the 0→max descriptors tied to quoted
  evidence) and the exact recalibrated band cutoffs (D-03) — grounded in the four VER-03 quality bands.
- The **stable input-identity hash + canonical serialization** for LinkedIn (and Recruiting Lens)
  cache/idempotency identity (order-independent, collision-resistant, excludes save-mutated fields).
- The **plan sub-ordering** (ROADMAP sketch 04-01 Recruiting Lens → 04-02 LinkedIn → 04-03 tests is a
  starting point) — provided Recruiting Lens proves idempotency/refund/refresh on the simpler path
  first, LinkedIn scoring lands with its validator, and the VER-03 + repeated-run suite folds into
  `verify:baseline` last.
- The **frontend rendering rewrite** for LinkedIn (today hard-depends on `rawScore` +
  `sectionBreakdown[4]` with fixed maxScores) → dynamic 11-section render, honest N/A/absent-section
  display, recalibrated bands, teaser removal — the shape is Claude's, the contract is "11 evidence
  sections, everything to everyone, no fabricated placeholders."

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase's requirements + roadmap
- `.planning/ROADMAP.md` (Phase 4 section, L131-149) — goal, 4 success criteria (11 rubric areas
  named, math-from-sections, fixed-score-source elimination list, weak/avg/strong/exceptional proof),
  plan sketch 04-01..04-03.
- `.planning/REQUIREMENTS.md` — FEAT-03 (full fixed-score-source list + 11 areas + per-section
  fields), FEAT-04, FEAT-06, VER-03; Traceability.

### The substrate this phase adopts (LOCKED contracts — read first)
- `.planning/phases/03-shared-analysis-lifecycle-substrate/03-CONTEXT.md` — every substrate contract
  (D-02 idempotency key, D-03 retry, D-06 charge-per-deliberate-run, dormancy flags, recovery hook).
- `supabase/functions/_shared/analysis-lifecycle.ts` (executor), `_shared/llm-validation.ts` (strict
  no-masking validation the LinkedIn validator plugs into), `get-analysis-run-status`,
  `src/hooks/useAnalysisRun` (recovery), `src/lib/analysisError.ts` — the machinery both features flip
  onto. Per-feature flags + `ANALYSIS_LIFECYCLE_ENABLED` global kill-switch.

### Research (the WHY — line-cited)
- `.planning/research/PITFALLS.md` — **primary design input.** Pitfall 8 (L167-188: ~52 clustering =
  central-tendency anchoring + cache key mutated by saving → D-02; the total is *already* honest
  math-from-sections, the SECTION scores regress to the mean), Pitfall 9 (L192-197: strict validation
  must not regress into fixed-default/empty/generic masking → D-04), Pitfall 2/3 (refund-after-save /
  settle-before-save — the `grade-linkedin` throw-after-save + `persistLinkedInAnalysis`-returns-null
  bugs the lifecycle fixes), Pitfall 7 (L149: 401-without-CORS class for Recruiting Lens re-proof).

### LinkedIn Grader — current code (being rebuilt)
- `supabase/functions/grade-linkedin/index.ts` (886L) — handler; `correctedScore = Σ sections`
  reconciliation (L320-338, 735-783); cache read/write + `prior_grade_id` in key (L212-282, L419-429
  — the save-mutated key to fix); follow-up context injection (L413-416, 676-679 — to remove);
  `storeAndNotify`/`persistLinkedInAnalysis` (the throw-after-save / returns-null Merit bugs).
- `supabase/functions/grade-linkedin/prompts.ts` (317L) — 4-section rubric (Headline 20 / Experience
  30 / Skills 25 / Completeness 25) → expand to 11; **prompt-example numeric anchoring to remove**
  (L71-78, 196-205); `buildUserMessage` follow-up block (L283-301).
- `supabase/functions/grade-linkedin/validation.ts` (203L) — `clampLinkedInSectionScores` (L183-203,
  bounds-only, keep), score-sum reconciliation (L97-108, keep — math-from-sections). Rework for 11
  sections + per-section evidence/strengths/weaknesses/improvements + context-aware max.
- `src/pages/LinkedInGrader.tsx` (1245L) — inline logic (no hook); binds `result.rawScore` +
  `sectionBreakdown[4]` (→ dynamic 11); hardcoded UI band labels (L535-540, 852-902 → recalibrate,
  D-03); `LOCKED_FIXES_PLACEHOLDERS` teaser (L82-111 → remove, D-05); History/cache hydration
  (`?id=`, `isV3Grade` gate, billing-cycle rows).
- DB: `linkedin_grades` (`overall_score int 0-100 CHECK`, `grading_data jsonb`, `profile_identifier`,
  `user_id`, `archive_path`) + mirror into `analysis_results` (`primary_score`,
  `analysis_type='linkedin_grading'`). **`grading_data` is jsonb** → the 11-section restructure fits
  without a schema migration; `overall_score` range unchanged. Model = **Haiku 4.5 all tiers**,
  temp 0.3 (keep model; determinism comes from anchoring, not temp).

### Recruiting Lens — current code (preserve-exactly)
- `supabase/functions/recruiting-lens/index.ts` (779L) — `withCors(req,'user',...)` wrapper (L779,
  preserve); `withMerits` branch (L545-650) **passes NO idempotency key** (gap to close); dual
  merit/legacy paths (L545-650 / L652-760, consolidate); `persistRecruitingLensResult` →
  `analysis_results` + `applications` upsert + `analysis_cache` (variant `recruiting-lens:v37-04`);
  `precheck_cache` wired (L638-646); Elite-only Free-403 (L493-498, preserve); 3 parallel calls
  (`CALL_CONFIGS` L33-41, `executeParallelCalls` L367-437).
- `supabase/functions/_shared/recruiting-lens-merger.ts` — `mergeRecruitingLensResults` +
  `RecruitingLensOutput` schema + `applyRecruitingLensTierShape` (PRO_ALLOWED_FIELDS — preserve exact).
- `supabase/functions/_shared/recruiting-lens-prompts.ts` — 3-call field split (preserve).
- `src/pages/RecruitingLens.tsx` — `invokeWithTimeout('recruiting-lens', ...)` (non-streaming, direct
  invoke → triggers CORS preflight); `useAnalysisGuard`/`useMerits` optimistic settle; History via
  `analysis_results` + `?id=`. Tests: `RecruitingLens.phase22.test.ts`, `AnalysisHistory.phase22.test.ts`.

### Shared layer + CORS
- `supabase/functions/_shared/cors.ts` — `withCors`/`corsHeaders`/`handleOptionsRequest`,
  `ALLOWED_ORIGINS` allowlist, `mergeCors` (Origin reflection only when `req` supplied + allowlisted),
  `Vary: Origin`. `auth.ts` — `requireAuth`, `unauthorizedResponse` (now CORS-attached — keep).
- `supabase/functions/_shared/merit-gateway.ts` — `withMerits`, 4-arg `check_and_deduct_merits`
  (`p_idempotency_key`), `MeritRefundable`, `refundMeritsForJob`, `MERIT_SYSTEM_ENABLED`.
- `TESTING-STRATEGY.md` + `deno.json` `test:ci` allowlist — where VER-03 + repeated-run guards fold
  into `verify:baseline` (a green baseline only proves pre-existing behavior — new guards mandatory).

### Operator / DB gate
- `CLAUDE.md` (Supabase MCP rules): Claude read-only on prod (`zjpjapgraoxdukdvpjes`); test preview
  (`cimjltzovkahkqecpwgi`) first; operator applies prod migrations; pause for operator checkpoint on
  any RLS / DB-function / realtime / grant change; rollback SQL per migration; advisor floor must not
  increase. (The 11-section restructure is jsonb-only → likely no schema migration, but any
  cache/grant/index touch is operator-gated.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The whole Phase 3 lifecycle** (`analysis-lifecycle.ts` executor + `llm-validation.ts` +
  `useAnalysisRun` + `get-analysis-run-status` + per-feature flags) — dormant, waiting to be flipped.
- **LinkedIn's existing math-from-sections** (`rawScore = Σ section.score`, validator L97-108) — the
  aggregation is already correct; Phase 4 rebuilds the *section* scoring + expands 4→11, not the total.
- **`grade-linkedin/validation.ts` clamp + reconciliation** — keep clamp as bounds-only defense; keep
  sum-reconciliation; extend for 11 sections + evidence fields + context-aware max.
- **Recruiting Lens `withCors` wrapper + merger + tier shaping** — CORS-correct and product-approved;
  preserve verbatim, add only the idempotency key + lifecycle-driven persistence.
- **`withMerits` 4-arg idempotent seam** — supports the key; Recruiting Lens just needs to pass it.
- **`analysis_cache` + `analysis_results` + `linkedin_grades` (jsonb `grading_data`)** — persistence
  targets that accommodate the new shapes without schema churn.

### Established Patterns
- **`withCors(req, 'user', handler)` wrapper** — the CORS contract both features already use; the
  Recruiting Lens re-proof is "keep this intact + `ALLOWED_ORIGINS` has apex+www," not a code fix.
- **Math-from-sections total** (never model-invented) — already enforced; extend, don't replace.
- **Strict no-masking validation** (Phase 3) — LinkedIn's new validator plugs in; honest low scores
  for absent sections (D-04) are NOT masking; fabricated defaults/empties/generics ARE (forbidden).
- **Operator-gated preview→prod** with rollback SQL; byte-identical legacy path behind a flag (dormancy).
- **Per-feature flag flip in ascending blast-radius order** — Recruiting Lens (smaller) then LinkedIn.

### Integration Points
- Per-feature lifecycle flags (Recruiting Lens, LinkedIn) + `ANALYSIS_LIFECYCLE_ENABLED` kill-switch.
- `withMerits(ctx, feature, fn, { idempotencyKey, precheck_cache })` — the reserve/settle seam; Phase 4
  supplies each feature's **input-identity** (profile content-hash for LinkedIn; resume/JD/linkedin
  hash for Recruiting Lens) — **never `prior_grade_id`**.
- `analysis_jobs` lifecycle row + `get-analysis-run-status` + `useAnalysisRun` recovery hook.
- `deno.json` `test:ci` + `verify:baseline` — VER-03 distribution/differentiation + repeated-run +
  idempotency + refresh-recovery guards register here.

</code_context>

<specifics>
## Specific Ideas

- **LinkedIn scoring is the product work of this phase; Recruiting Lens is a preserve-exactly wiring
  job.** Weight planning effort accordingly.
- **The ~52 clustering is model-behavioral, not a code bug** (scout-confirmed: no hardcoded/default/
  normalization/broken-weight source). The fix is **evidence-anchored band definitions + removing
  prompt-example anchoring + removing follow-up context + a stable cache key** — NOT lowering
  temperature. Prove the fix with a distribution test across four quality bands (VER-03), not by
  eyeballing.
- **"Everything to everyone" for LinkedIn** (D-05): Free and Elite both get the full 11-section
  output; remove the `LOCKED_FIXES_PLACEHOLDERS` teaser; the paid differentiator is Merit budget.
  Tier model is **Free/Elite (no Pro)**.
- **Context-aware max (D-01) is the anti-artificial-range mechanism**: a section that doesn't apply
  gets a reduced/excluded max and the total normalizes — distinct from an absent section (D-04, honest
  low score). Get this distinction right or strong senior profiles cluster low.
- **Recruiting Lens CORS = re-prove live for apex + www**, guard the `withCors` wrapper and
  `ALLOWED_ORIGINS` env; the "failure" was Phase-1-fixed centrally.
- Fix the two known Merit-accounting bugs on the LinkedIn path as part of the migration: the
  throw-after-save (`MeritRefundable` on a persisted+emailed grade → refund-on-success lie) and
  `persistLinkedInAnalysis` returning null on insert failure (settle-on-unsaved risk) — the lifecycle
  executor's "settle only on verified durable save" makes these structural.

</specifics>

<deferred>
## Deferred Ideas

- **Resume Analysis + Onboarding "Taking Longer" hang** (FEAT-01, FEAT-02) → **Phase 5** (next
  feature migration; higher blast radius, dual path).
- **Career Compass full-pipeline migration** (FEAT-05) → **Phase 6**.
- **Dashboard intelligence reading stored analysis data** (DASH-01..06, incl. Recruiter First
  Impression / Profile Alignment) → **Phase 7** (after features store genuine data).
- **Any new LinkedIn/Recruiting-Lens product capability** (new sections beyond the 11, new output
  types, new tiers) — out of scope; this phase is migration + scoring-correctness, not new features.
- **Free identical-input cache-reuse policy** stays a per-feature `precheck_cache` concern (Phase 3
  D-06) — the substrate charges per deliberate run; Phase 4 wires each feature's stable cache identity.

### Reviewed Todos (not folded)
None — `todo.match-phase 4` returned 0 matches.

</deferred>

---

*Phase: 04-feature-migration-a-recruiting-lens-linkedin-grader*
*Context gathered: 2026-07-03*
