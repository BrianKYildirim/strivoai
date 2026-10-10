# Phase 4: Feature Migration A — Recruiting Lens + LinkedIn Grader - Research

**Researched:** 2026-07-03
**Domain:** Adopting the dormant Phase 3 analysis lifecycle for two sync features + rebuilding LinkedIn scoring (11 evidence-anchored sections, math-from-sections total, context-aware-max normalization) on Supabase Edge (Deno) + Anthropic Haiku 4.5 + React.
**Confidence:** HIGH for the code-grounded integration mechanics (executor contract, merit seam, cache/idempotency, CORS, current LinkedIn/Recruiting-Lens code); MEDIUM for the exact rubric weighting + recalibrated band cutoffs (Claude's-discretion design, to be proven by VER-03 fixtures, not asserted here).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — 11 sections with context-aware max.** Score Headline, About, Experience, Education, Skills, Projects, Certifications, Achievements, Completeness, Career positioning, Recruiter discoverability. A section that legitimately doesn't apply is scored out of a **reduced (or excluded) max** and the **total is normalized to the applicable sections**. Each section carries **earned / max / evidence / strengths / weaknesses / improvements**. The **total is math-from-sections** (`rawScore = Σ section.score`, reconciled server-side) — the model NEVER invents the headline number. Legitimately-absent (D-04, honest low score) ≠ non-applicable (reduced/excluded max).
- **D-02 — fully deterministic; drop follow-up context; stable cache key.** Identical input converges to the same total via **explicit evidence-anchored band definitions** (NOT lower temperature). **Remove** the follow-up-context injection of the prior grade's JSON. **Fix the cache key** to stable input identity (profile content-hash + feature + tier + variant); **exclude `prior_grade_id`**. **Eliminate all fixed-score sources** (FEAT-03): remove prompt-example numeric anchoring ("20-40"/"70-90"), no hardcoded/default/placeholder total, no DB-default-as-score, no frontend placeholder rendered as real (remove `LOCKED_FIXES_PLACEHOLDERS`), keep section clamping as bounds-only defense (must fire rarely).
- **D-03 — recalibrate score bands** to where genuinely weak/avg/strong/exceptional profiles actually land under the new rubric; the VER-03 suite asserts against them (no ~52 clustering, real spread). Current UI cutoffs (Top 5% ≥90 / Excellent ≥80 / Good ≥70 / Average ≥55 / Needs Work <55) get recalibrated.
- **D-04 — no-evidence handling = honest low score with stated reason (anti-masking).** When the model cannot cite specific evidence for an *applicable* section, that section earns a genuinely low score with the weakness/improvement explaining what's missing. Absence is real signal, never mid-range filler. This differs from the Phase-3 strict no-masking contract, which still **fails the run** (terminal error + refund) for genuinely malformed/truncated/unparseable model output.
- **D-05 — LinkedIn: everything to everyone; Free + Elite only.** Both tiers see the full 11-section output (all scores, evidence, strengths, weaknesses, improvements, complete prioritized fix list). **No depth gating.** Tier differentiator is **Merit budget (runs), not output depth.** Tier model collapses to **Free/Elite (NO Pro)** — Pro and Elite already share one prompt variant. Remove the `LOCKED_FIXES_PLACEHOLDERS` teaser cards.
- **D-06 — Recruiting Lens: preserve-exactly migration + CORS re-proof; stays Elite-only.** Byte-preserve the approved product experience + output quality (3-call parallel merge, `RecruitingLensOutput` schema, tier shaping, Elite-only Free-403 gate). Add ONLY shared reliability: route through the **`inline` lifecycle driver**, thread the **edge-derived idempotency key** (currently NOT passed — the concrete gap), consolidate the **dual merit/legacy persistence paths** onto one lifecycle-driven path. CORS is a **re-proof, not a new code fix**: keep the `serve((req) => withCors(req, 'user', () => handler(req)))` wrapper, ensure deployed `ALLOWED_ORIGINS` includes both `strivoai.net` and `www.strivoai.net`, re-verify live, guard against the 401-without-CORS class.

### Claude's Discretion

- **Exact point allocation across the 11 sections** (each section's max, reduced-max / normalization math for D-01) — apply a defensible documented weighting; the invariant is math-from-sections + a real spread, not specific per-section numbers.
- **Evidence-anchored band definitions per section** (0→max descriptors tied to quoted evidence) and the **exact recalibrated band cutoffs** (D-03) — grounded in the four VER-03 quality bands.
- **Stable input-identity hash + canonical serialization** for LinkedIn (and Recruiting Lens) cache/idempotency identity (order-independent, collision-resistant, excludes save-mutated fields).
- **Plan sub-ordering** (ROADMAP sketch 04-01 Recruiting Lens → 04-02 LinkedIn → 04-03 tests is a starting point) — provided Recruiting Lens proves idempotency/refund/refresh on the simpler path first, LinkedIn scoring lands with its validator, and the VER-03 + repeated-run suite folds into `verify:baseline` last.
- **Frontend rendering rewrite** for LinkedIn (today hard-depends on `rawScore` + `sectionBreakdown[4]` with fixed maxScores) → dynamic 11-section render, honest N/A / absent-section display, recalibrated bands, teaser removal — shape is Claude's, the contract is "11 evidence sections, everything to everyone, no fabricated placeholders."

### Deferred Ideas (OUT OF SCOPE)

- Resume Analysis + Onboarding "Taking Longer" hang (FEAT-01, FEAT-02) → Phase 5.
- Career Compass full-pipeline migration (FEAT-05) → Phase 6.
- Dashboard intelligence reading stored analysis data (DASH-01..06) → Phase 7.
- Any new LinkedIn/Recruiting-Lens product capability (new sections beyond the 11, new output types, new tiers) — out of scope.
- Free identical-input cache-reuse policy stays a per-feature `precheck_cache` concern (Phase 3 D-06).
</user_constraints>

## Summary

This phase is **two very different jobs sharing one substrate**. Recruiting Lens is a *wiring* job: it already has a correct 3-call-merge product output, a stable order-independent cache key (`buildRecruitingLensCacheKey` → `computeCacheKey`), and the correct `withCors(req,'user',handler)` wrapper — the only real gaps are (a) it calls `withMerits` with **no idempotency key**, (b) it has **two persistence paths** (a `MERIT_SYSTEM_ENABLED` merit branch and a byte-identical legacy branch) that must collapse onto one lifecycle-driven path, and (c) the CORS "failure" is a *re-proof* obligation, not a code change. LinkedIn Grader is the *product* work: rebuild the rubric from 4 self-scored sections (Headline 20 / Experience 30 / Skills 25 / Completeness 25) to **11 evidence-anchored sections with a context-aware max and server-computed normalized total**, eliminate every fixed-score source (prompt anchoring, follow-up-context re-injection, the `prior_grade_id` cache-key mutation, the `LOCKED_FIXES_PLACEHOLDERS` teaser), and prove weak/avg/strong/exceptional differentiation (VER-03).

The **Phase 3 executor (`runAnalysisLifecycle`) is the load-bearing integration point** and it already encodes every financial invariant this phase needs: single-source idempotency key, refund-exactly-once-pre-`saving`, settle-on-verified-durable-save, transient-only bounded retry, strict no-masking validation via `validateModelOutput(raw, zodSchema, { semanticCheck })`. Both features become thin adapters that supply `inputIdentity`, `attemptNonce`, `extract`, `generate`, a **zod `schema`**, a `semanticCheck`, and a throwing `save`. The two known LinkedIn Merit bugs (throw-after-save in `storeAndNotify`+usage-write, `persistLinkedInAnalysis` returning null on insert failure) are **fixed structurally** by moving the durable write into `save()` (throws only pre-`saving`) and demoting email/usage/mirror to post-`saving` log-and-continue.

**Primary recommendation:** Land Recruiting Lens first (thread `idempotencyKey`, collapse to one lifecycle path, re-prove CORS — output byte-identical), then rebuild LinkedIn scoring behind its own flag with an 11-section **discrete-band evidence rubric** + a zod schema whose `semanticCheck` enforces `rawScore = Σ clamped sections` and normalization, then fold the VER-03 differentiation proof into the promptfoo/live layer and the deterministic scoring-math + no-fixed-source guards into `verify:baseline`. The ~52 clustering is model-behavioral — the fix is discrete evidence-anchored bands + removing anchoring/follow-up + a stable key, proven by a distribution test, **not** lower temperature.

## Standard Stack (the substrate this phase builds on — all in-repo, Phase 3)

### Core integration points
| Asset | Location | Purpose | Contract this phase must honor |
|-------|----------|---------|-------------------------------|
| `runAnalysisLifecycle<T,E>` | `_shared/analysis-lifecycle.ts` | The ordered executor (the `inline` driver) | Supply `feature`, `meritFeature`, `ctx{userId,tier,corsType}`, `jobType`, `inputIdentity`, `attemptNonce`, `validateInputs?`, `extract`, `generate(txId,extracted)→raw string`, `schema: z.ZodTypeAny`, `validationOpts{semanticCheck}`, `save(value)→throws-on-failure`. Returns discriminated union incl. `{ok:false,dormant:true}`. |
| `validateModelOutput` | `_shared/llm-validation.ts` | Strict no-masking validation (empty/parse/truncation/generic/zod/semantic) | Feature supplies the **zod schema** + optional `semanticCheck`; failures return typed `AnalysisErrorCode`, NEVER a substituted body. Truncation is REJECTED not repaired. |
| `withMerits` | `_shared/merit-gateway.ts` | Reserve/settle seam; 4-arg `check_and_deduct_merits(p_idempotency_key)` | Executor sets `meritCtx.idempotencyKey = idempotencyKey` and calls it; a repeated key → `already_deducted` → one deduction. `precheck_cache` runs before rate-limit and returns sentinel `transactionId:'cache-hit'`. |
| `deriveIdempotencyKey` | `_shared/idempotency-key.ts` | SHA-256(canonical(userId,feature,tier,inputIdentity,attemptNonce)) | Feature supplies `inputIdentity` (opaque stable content-hash) + `attemptNonce`. **Never** a save-mutated field. Sorted-key JSON → order-independent. |
| `isAnalysisFeatureEnabled(feature)` | `_shared/analysis-flags.ts` | Two-level dormancy gate | Master `ANALYSIS_LIFECYCLE_ENABLED` AND per-feature `ANALYSIS_LIFECYCLE_LINKEDIN` / `ANALYSIS_LIFECYCLE_RECRUITING_LENS` (feature keys: `'linkedin'`, `'recruiting_lens'`). Fail-closed exact-lowercase-`'true'`. |
| `withCors(req,'user',handler)` | `_shared/cors.ts` | Origin-aware allowlist CORS + `Vary: Origin` on all responses incl. 401/4xx/5xx | Recruiting Lens already uses this at `serve()`. Re-proof only. |
| `useAnalysisRun()` | `src/hooks/useAnalysisRun.ts` | Frontend recovery hook (subscribe-first/poll-fallback, `run_id` URL+localStorage persistence, `previousResult` latch, `canRetry`) | Gated by VITE flag. Exposes `startRun(runId)`, `retry()`, `clear()`, `state`, `isCompleted`, `isFailed`, `errorMessage`, `previousResult`. LinkedIn frontend must adopt this (currently inline, no hook). |
| `classifyFailure` | `_shared/analysis-lifecycle.ts` | Transient/permanent partition | Validation failures are permanent (no retry); provider timeout/rate-limit/network transient. Fail-closed = permanent. |

### Feature-specific current code
| Asset | Location | Role in this phase |
|-------|----------|--------------------|
| `validateLinkedInGrade` + `clampLinkedInSectionScores` | `grade-linkedin/validation.ts` | Rework: 4→11 sections, per-section evidence/strengths/weaknesses/improvements, context-aware max, normalized total. Keep sum-reconciliation (`correctedScore`) and clamp as bounds-only. |
| `buildProSystemPrompt`/`buildFreeSystemPrompt`/`buildUserMessage` | `grade-linkedin/prompts.ts` | Rebuild: 11-section discrete-band rubric; **remove** calibration numeric anchoring (L71-78, L196-205) and the `followUpContext` block (L296-297). Collapse to Free/Elite variants (Pro→Elite behavior). |
| `mergeRecruitingLensResults` + `applyRecruitingLensTierShape` (`PRO_ALLOWED_FIELDS`) + `RecruitingLensOutput` | `_shared/recruiting-lens-merger.ts` | Preserve verbatim. The merged object is the byte-preserved product output. |
| `buildRecruitingLensCacheKey` | `recruiting-lens/index.ts` L305 | Already order-independent (sha256 field hashes → `computeCacheKey` sorted). Reuse as `inputIdentity` source. |
| `LinkedInGrader.tsx` | `src/pages/` | Dynamic 11-section render, recalibrate bands (L890-893), remove `LOCKED_FIXES_PLACEHOLDERS` (L82-111, L1176), drop the hardcoded `maxScore: 20|30|25` type (L38), adopt `useAnalysisRun`. |

**No new packages.** Deno-only (`crypto.subtle`), zod already imported (`esm.sh/zod@3.25.76`). Model unchanged: Haiku 4.5 all tiers, temp 0.3.

## Architecture Patterns

### Pattern 1: Both features become executor adapters (the `inline` driver)

Each feature's handler collapses to: authenticate → parse/validate inputs → compute `inputIdentity` (content hash) → read `attemptNonce` from the frontend "new run" signal → call `runAnalysisLifecycle({...})` → map the discriminated result to an HTTP response (incl. `dormant:true` → fall through to the existing legacy path so the flag flip is reversible).

**Dormancy fall-through (mandatory):** when `isAnalysisFeatureEnabled` is OFF the executor returns `{ok:false,dormant:true}` and the handler must run the **existing byte-identical legacy path**. This is how the per-feature flag stays a safe rollback lever (mirrors Phase 3's `MERIT_SYSTEM_ENABLED` byte-identical legacy pattern).

### Pattern 2: LinkedIn scoring — discrete evidence-anchored bands + server-side normalization

**The generate/validate seam:** `generate()` returns the single Haiku raw text. `schema` (zod) validates 11 sections each with `{ name, applicable, max, score, evidence, strengths[], weaknesses[], improvements[] }` plus the top-level fields. A `.transform` on each section score does the **bounds-only clamp** (`Math.min(max, Math.max(0, score))`) so clamping happens *inside* validation (the current code clamps by mutating `parsed` before validation; under the executor that pre-parse hook doesn't exist, so move the clamp into the schema transform or the `semanticCheck` preface). `semanticCheck` recomputes the normalized total from the clamped applicable sections and enforces `rawScore === computedTotal` (reject on mismatch — never silently overwrite in a way that lets a nonsense body pass).

**Proposed defensible weighting (Claude's discretion — the numbers are a starting model, the invariants are load-bearing):**

Nominal maxes summing to 100 when every section applies, split into always-applicable "core" and reducible/excludable "contextual":

| Section | Base max | Class | Applicability rule |
|---------|---------|-------|--------------------|
| Experience | 18 | core | Always applies |
| Recruiter discoverability | 12 | core | Always applies |
| Headline | 11 | core | Always applies |
| About | 11 | core | Always applies |
| Skills | 11 | core | Always applies |
| Career positioning | 9 | core | Always applies |
| Completeness | 8 | core | Always applies |
| Achievements | 6 | contextual | Reduce/exclude if role/stage makes distinct achievements non-standard |
| Projects | 6 | contextual | Exclude for senior ICs/execs where portfolio projects aren't expected; full for early-career/eng/design |
| Education | 4 | contextual | Reduce for senior (10+ yrs) where education is background; full for new grad |
| Certifications | 4 | contextual | Exclude where no cert is standard for the field; full where certs are role-gating |

**Normalization math:** `finalScore = round(100 × Σ(section.score over applicable) / Σ(section.max over applicable))`. Excluding a contextual section drops its max from the denominator, so the remaining sections scale up — a strong senior IC with Projects excluded is scored out of ~94, not floored. `rawScore` stored 0-100 (existing `overall_score int 0-100 CHECK` unchanged).

**Critical D-01 vs D-04 distinction the model must apply deterministically:**
- **Non-applicable** (D-01): the section *doesn't belong* for this profile's stage/role → `applicable:false`, max excluded (or reduced), removed from the denominator. Decided by explicit stated rules (career-stage/role signals), not vibes.
- **Legitimately absent** (D-04): the section *applies* but the profile lacks content (e.g., a new grad with no Projects, an empty About) → `applicable:true`, honest low/zero `score` against full max, with `weaknesses`/`improvements` naming what's missing. It **drags the total down** — that is the correct signal.

Get this wrong (treating absent-but-applicable as non-applicable) and you re-inflate weak profiles → clustering returns.

### Pattern 3: Discrete-band rubric as the anti-clustering mechanism (Pitfall 8)

Replace "score 0-20, consider these sub-criteria" (which invites central averaging) with **explicit discrete bands per section, each tied to quoted-evidence descriptors**. Example (Headline, max 11):
- 0-1: empty / just a name
- 2-3: bare "Job Title at Company", no keywords
- 4-6: title + one keyword or weak value hint
- 7-9: keyword-rich, clear specialization, searchable
- 10-11: keyword-rich + differentiated value proposition + recruiter-search-optimized

The model must **quote the profile evidence** and match it to a band, then emit that band's point value. This forces discrimination (pick the matching descriptor) instead of estimation (guess a number near the middle). Do this for all 11 sections. This — plus removing the "20-40 / 70-90" calibration anchors and the follow-up-context re-injection — is the declustering fix. **Do not lower temperature** (low temp = consistently central = consistently wrong).

### Pattern 4: Recruiting Lens — multi-call merge inside `generate()`, zod-validate the merged shape

The executor's `generate()` returns raw text and `validateModelOutput` parses+validates it. Recruiting Lens produces a *merged object* from 3 parallel calls, not a single raw response. Adapter approach: `extract()` prepares sanitized inputs; `generate()` runs `executeParallelCalls` + `mergeRecruitingLensResults` + `applyRecruitingLensTierShape`, then returns `JSON.stringify(merged)`. `schema` is a zod mirror of `RecruitingLensOutput` (byte-preserve: the schema must ACCEPT every field the merger currently emits — validate presence/type, do not drop fields). Because `generate()` returns clean serialized JSON, truncation detection never false-positives. `save()` does the `analysis_results` + `applications` upsert + `analysis_cache` write; email/usage stay post-`saving` best-effort. **Output stays byte-identical** — validation is added around an unchanged product path.

### Anti-Patterns to Avoid
- **Lowering temperature to fix clustering** — treats the symptom's cousin; produces consistently-central scores.
- **Letting `save()` return null/no-op on failure** (`persistLinkedInAnalysis` today returns null on insert failure) — the executor settles Merits in `saving→completed`; `save()` MUST throw on any durable-write failure or you settle for an unsaved analysis (Pitfall 3).
- **`throw MeritRefundable` after the durable write** (`storeAndNotify`+usage-write today) — refunds a delivered analysis (Pitfall 2). Post-`saving` steps are log-and-continue only.
- **Composing the cache/idempotency key from `prior_grade_id`** — a save-mutated field → every rerun misses cache and re-anchors (Pitfall 8).
- **A zod schema that silently coerces missing sections to defaults** — that's masking (Pitfall 9). Missing required section → typed SCHEMA_VALIDATION_FAILED → refund.
- **Rejecting currently-passing Recruiting Lens outputs** with an over-strict schema — violates byte-preserve (D-06).
- **Patching CORS endpoint-by-endpoint** — the fix is central (`cors.ts` + `ALLOWED_ORIGINS`); Recruiting Lens only re-proves it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotency key derivation | A per-feature hash | `deriveIdempotencyKey` | Order-independent, save-stable, tested (`idempotency-key.test.ts`) |
| Reserve/settle/refund | Feature-local merit logic | `withMerits` + executor refund boundary | Exactly-once, refund-only-pre-saving already proven |
| Output validation | A bespoke parser + fallback | `validateModelOutput` + zod schema | Strict no-masking, truncation rejection, safe logging |
| State machine / recovery | New status columns | Executor + `analysis_jobs` + `useAnalysisRun` | Single source of truth, Pitfall-4 safe |
| CORS on errors | Manual header spreading | `withCors` wrapper + auth.ts CORS attach | 401/4xx/5xx already carry Origin-aware CORS |
| Recruiting Lens cache key | A new key builder | `buildRecruitingLensCacheKey` (reuse as inputIdentity) | Already order-independent + field-hashed |
| Score aggregation | Trusting the model's total | `rawScore = Σ sections` + `semanticCheck` | Math-from-sections is the existing correct pattern |

**Key insight:** Almost everything financial/structural is already built and tested in Phase 3. Phase 4's genuinely new code is (1) the LinkedIn 11-section rubric + zod schema + normalization + `semanticCheck`, (2) the frontend 11-section render, and (3) the VER-03 differentiation proof. The migration wiring is adapter plumbing over proven primitives.

## Common Pitfalls (phase-specific, from PITFALLS.md)

### Pitfall 8: ~52 clustering + second-run drift (PRIMARY design driver)
**What goes wrong:** Section scores regress to the mean (Haiku averages to "B-minus" under an unanchored rubric); `prior_grade_id` in the cache key mutates on every save so identical input never caches and each rerun re-injects the prior grade as context → drift.
**How to avoid:** Discrete evidence-anchored bands (Pattern 3) + remove numeric calibration anchors + remove `followUpContext` (prompts.ts L296-297; the fetch at index.ts L404-416) + stable input-identity cache key excluding `prior_grade_id`.
**Warning signs:** score histogram piling in 48-58; identical profile → different scores; LinkedIn cache hit-rate ~0; frequent `section-score-clamped` warnings (model fighting the rubric).

### Pitfall 2: Refund/error AFTER durable save (LinkedIn throw-after-save bug)
**What goes wrong:** `storeAndNotify` inserts `linkedin_grades` + `analysis_results` + emails, THEN a usage-write failure `throw MeritRefundable` → refund on a delivered analysis + 500 on a saved grade.
**How to avoid:** `save()` = the `linkedin_grades` durable insert (throws pre-`saving` only); usage/email/mirror move to post-`saving` best-effort (log-and-continue). The executor settles in `saving→completed`, below which there is no refund/throw.

### Pitfall 3: Settle before save (`persistLinkedInAnalysis` returns null)
**What goes wrong:** The `analysis_results` mirror insert returns null on failure instead of throwing; a lifecycle that settled on "AI returned" would charge for an unsaved analysis.
**How to avoid:** The authoritative durable write inside `save()` must throw on failure; secondary mirrors are either part of the same atomic write (throw) or explicitly best-effort post-`saving`. Executor already gates settle on a thrown-or-not `save()`.

### Pitfall 9: Validation masking (the top guardrail breach)
**What goes wrong:** Under pressure to "make it reliable," substituting a default/placeholder score, `{}`, a generic recommendation, or rendering `LOCKED_FIXES_PLACEHOLDERS` as real.
**How to avoid:** `validateModelOutput` returns typed error + refund on any invalid output; D-04 honest-low-score (for absent *applicable* sections) is NOT masking; fabricated defaults ARE. Remove the frontend teaser. Ensure no DB column has a non-null score default that could surface as real.

### Pitfall 7: 401 without CORS (Recruiting Lens re-proof)
**What goes wrong:** An auth 401 built without CORS headers is swallowed by the browser → looks like a CORS bug, hides the real "sign in again."
**How to avoid:** `auth.ts` now attaches CORS — keep it; the `withCors` wrapper covers thrown Responses. Re-prove with a status-matrix test (200/401/402/403/429/500 all carry ACAO from an allowed Origin).

### Pitfall 5/1: Window-dedup ≠ idempotency; key not forwarded (Recruiting Lens gap)
**What goes wrong:** Recruiting Lens `withMerits` passes NO idempotency key → concurrent/refresh resubmits each charge.
**How to avoid:** Thread `deriveIdempotencyKey({inputIdentity: buildRecruitingLensCacheKey-derived hash, attemptNonce})` through the executor; the partial-UNIQUE index makes a repeated key deduct once.

## Code Examples (verified from this repo)

### The executor contract (what each feature supplies)
```typescript
// Source: supabase/functions/_shared/analysis-lifecycle.ts:145-176
// generate() returns RAW model text; validateModelOutput parses+zod-validates it.
runAnalysisLifecycle<LinkedInGrade, ProfileInputs>({
  feature: 'linkedin',                 // dormancy key (analysis-flags.ts)
  meritFeature: 'linkedin_grading',    // withMerits deduct namespace
  ctx: { userId, tier, corsType: 'user' },
  jobType: 'linkedin_grading',
  inputIdentity,                        // sha256(canonical(profileContent + profileUrl)) — NO prior_grade_id
  attemptNonce,                         // fresh on deliberate "new run"; resubmit reuses → same key
  extract: async () => ({ profileContent, profileUrl }),
  generate: async (_txId, inp) => await callHaiku(buildSystemPrompt(tier), buildUserMessage(inp)),
  schema: linkedInGradeZodSchema,       // 11 sections + top-level; per-section score .transform clamp
  validationOpts: { semanticCheck: (v) =>
    v.rawScore === normalizeFromSections(v.sectionBreakdown)
      ? { ok: true }
      : { ok: false, detail: 'rawScore != normalized sum-of-applicable-sections' } },
  save: async (v) => { /* linkedin_grades insert — THROWS on failure (pre-saving) */ },
});
```

### The idempotency/cache-key stability contract
```typescript
// Source: supabase/functions/_shared/idempotency-key.ts:66-92
// Sorted-key JSON → order-independent; SHA-256 → collision-resistant.
// inputIdentity MUST be stable content identity, never a save-mutated field.
// LinkedIn:        sha256(canonical(profileContent_hash, profileUrl))         // drop prior_grade_id
// Recruiting Lens: buildRecruitingLensCacheKey(resume/JD/linkedin/company/role) // already stable
```

### The refund boundary already enforced by the executor
```typescript
// Source: supabase/functions/_shared/analysis-lifecycle.ts:289-372
// refundAndFail() is the ONLY refund path, reachable exclusively BEFORE saving->completed.
// merit_settled=true is written ONLY in the saving->completed CAS patch (settle-on-saved).
// Below saving->completed there is NO refund and NO throw — post-save steps log-and-continue.
```

## Validation Architecture

A `VALIDATION.md` (Nyquist) strategy derives from this map. The **hard constraint from CI**: `verify:baseline` runs `deno task test:ci` **offline** (`DENO_TEST_SUPABASE_REMOTE=0`, no live Anthropic, no live DB). So LLM-behavioral proof (does the model discriminate?) CANNOT run in the blocking gate — it belongs in the **promptfoo / live layer** (the existing `test:adversarial*` precedent) run against preview, operator-gated, non-blocking. The blocking gate proves the **deterministic scaffolding** around the model. Split every requirement accordingly.

| Requirement | Blocking (deno `test:ci` / vitest / Playwright — deterministic, offline) | Live / non-blocking (promptfoo eval vs preview Haiku — nondeterministic) |
|-------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|
| **FEAT-03** (evidence-based, no fixed-score sources) | (a) Feed canned 11-section model outputs → assert `rawScore = normalized Σ applicable sections`, clamp fires only out-of-range, `semanticCheck` rejects mismatch. (b) **Static-source guard** (cors-audit style): prompt strings contain NO numeric calibration anchors ("20-40"/"70-90"), NO `followUpContext` block; cache key has NO `prior_grade_id`; NO placeholder constants (`LOCKED_FIXES_PLACEHOLDERS` removed); NO DB non-null score default. (c) Truncated/empty/garbage model output → typed error + refund (never 200-with-body). | Real profiles → assert each section's `evidence` quotes actual profile text; scores track evidence. |
| **FEAT-04** (reliable repeated runs) | (a) Repeated same-`attemptNonce` → one deduction (extend `merit-idempotency` / `idempotency-key` tests). (b) Fresh `attemptNonce` → new run + History row, older preserved. (c) `save()` throws → `retryable_failed`, refund, no settle. (d) N-parallel identical submits → 1 deduction. (e) Playwright: refresh mid-run recovers via `useAnalysisRun`. | 1st/2nd/5th consecutive live runs converge (no second-run drift). |
| **FEAT-06** (Recruiting Lens CORS + full-standard, product preserved) | (a) CORS status matrix (200/401/402/403/429/500 carry ACAO from allowed Origin; `Vary: Origin`; wrapper intact) — extend `cors-audit`/`cors.test`. (b) **Byte-preserve test**: merged `RecruitingLensOutput` for fixed inputs is identical pre/post migration (schema accepts every current field; tier-shape unchanged). (c) idempotency key now threaded (was null). (d) single persistence path (dual branch collapsed). | Live curl OPTIONS+POST from `strivoai.net` AND `www.strivoai.net` against preview → both echoed; deployed `ALLOWED_ORIGINS` includes both. |
| **VER-03** (weak/avg/strong/exceptional differentiation) | **Deterministic scoring-math distribution test**: four canned section-score fixtures (one per band) → normalization → assert four totals land in four DISTINCT recalibrated bands, minimum inter-band gap, NONE in a ~52 window. Proves the math/normalization/cutoffs, no LLM. | **Live differentiation eval** (promptfoo, preview): four real fixture profiles (weak/avg/strong/exceptional) × N repeats → assert distinct bands + repeated-run convergence within tolerance + no ~52 pile-up. This is the true "model discriminates" proof; non-blocking, operator-run. |

**Fold-in:** add the new deterministic `.test.ts` files to `deno.json` `test:ci` (the allowlist is explicit — new files must be registered or they don't run) and any Playwright flows to `test:e2e`; the live promptfoo eval registers as a new `test:adversarial:linkedin-distribution`-style script, run against preview, NOT in `verify:baseline`. A green baseline proves pre-existing behavior only — the new guards are mandatory (Pitfall 12).

## State of the Art

| Old (current code) | New (this phase) | Impact |
|--------------------|------------------|--------|
| 4 self-scored sections (20/30/25/25) | 11 evidence-anchored sections, context-aware max, normalized total | Real spread across career stages; declusters |
| Prompt calibration anchors "20-40"/"70-90" | Discrete per-section evidence bands, no numeric anchors | Model discriminates instead of averaging |
| `followUpContext` re-injects prior grade JSON | Removed | Kills second-run drift |
| Cache key includes `prior_grade_id` (save-mutated) | Stable input-identity hash (profile content + url) | Reruns cache; no re-anchoring |
| `withMerits` (LinkedIn 3-arg legacy / Recruiting Lens no key) | Executor threads `deriveIdempotencyKey` (4-arg) | Exactly-once charging |
| `storeAndNotify` throw-after-save; `persistLinkedInAnalysis`→null | `save()` throws pre-saving; settle-on-saved; post-save best-effort | No refund-after-save, no settle-on-unsaved |
| Recruiting Lens dual merit/legacy branches | One lifecycle-driven path (legacy = dormancy fall-through) | Simpler, recoverable, idempotent |
| `LOCKED_FIXES_PLACEHOLDERS` teaser rendered | Removed; Free sees all fixes (D-05) | No fabricated placeholder as real |
| Free = 1 fix / minimal feedback; Free/Pro/Elite | Everything-to-everyone; Free/Elite (Pro→Elite behavior) | Merit budget is the differentiator |

**Deprecated/outdated in current code:** `buildSystemPrompt` alias, the 4-section `EXPECTED_SECTIONS` map, the `maxScore: 20|30|25` frontend union type, `isV3Grade` gate (needs a v4 shape gate for the 11-section structure — History hydration must handle both old v3 rows and new rows honestly, without fabricating missing sections for legacy rows).

## Open Questions

1. **Clamp placement under the executor.** Current clamp mutates `parsed` *before* validation; the executor calls `validateModelOutput` internally so there's no pre-parse hook. **Recommendation:** move the bounds-only clamp into the zod schema as a per-section `.transform`, OR run it as the first line of `semanticCheck` on the typed value. Either keeps "clamp fires rarely, bounds-only" while fitting the seam. Planner should pick one and state it.

2. **Exact recalibrated band cutoffs (D-03).** The four bands must match where fixtures actually land under the new normalization. **Recommendation:** start from a hypothesis (e.g., Weak <50 / Average 50-69 / Strong 70-84 / Exceptional 85-100), then let the VER-03 deterministic distribution test + live eval CONFIRM/adjust — do not freeze cutoffs before the fixtures exist. UI labels recalibrate to match.

3. **History hydration for mixed grade shapes.** Old `linkedin_grades` rows have `sectionBreakdown[4]`; new rows have 11 sections. **Recommendation:** a shape gate renders each row honestly by its own structure; NEVER back-fill missing sections for legacy rows (that would fabricate). Legacy rows display as-is or with an "older rubric" marker.

4. **`analysis_results` mirror atomicity.** Is the `linkedin_grades` insert alone the authoritative durable write, or must the `analysis_results` mirror also succeed before settle? **Recommendation:** make `linkedin_grades` the authoritative `save()` throw-point; treat the `analysis_results` mirror + email + usage as post-`saving` best-effort (Dashboard Phase 7 reads stored data, so the mirror should be reliable but its failure must not un-settle a delivered grade — a reaper/backfill can reconcile).

5. **Recruiting Lens zod schema strictness vs byte-preserve.** The schema must accept every field the merger currently emits (incl. optional `linkedinImprovements`, `_meta`, tier-shaped subsets). **Recommendation:** derive the schema from `RecruitingLensOutput` with `.passthrough()`/optional fields where the merger is lenient; validate presence+type of the required product fields only. Guard with the byte-preserve equality test.

6. **`attemptNonce` transport.** Phase 3 says "frontend sends an explicit new-run signal; edge computes the key." **Recommendation:** confirm the frontend contract (a per-submit nonce/flag) both features send; an accidental resubmit must reuse the nonce (same key), a deliberate "analyze again" mints a fresh one. This is the FEAT-04 "new analysis identifier on intentional start" mechanism.

## Sources

### Primary (HIGH — direct code read, 2026-07-03)
- `_shared/analysis-lifecycle.ts` — executor contract, refund boundary, settle-on-saved, classifyFailure.
- `_shared/llm-validation.ts` — strict no-masking validator + `semanticCheck` seam.
- `_shared/idempotency-key.ts` — `deriveIdempotencyKey`, canonical serialization, save-stable contract.
- `_shared/merit-gateway.ts` — `withMerits`, 4-arg idempotent deduct, `precheck_cache`, `already_deducted`.
- `_shared/analysis-flags.ts` — feature keys (`linkedin`, `recruiting_lens`), two-level dormancy gate.
- `_shared/recruiting-lens-merger.ts` — `RecruitingLensOutput`, `PRO_ALLOWED_FIELDS`, tier shape, field ownership.
- `grade-linkedin/index.ts` (L400-585) — cache key + `prior_grade_id`, `followUpContext`, `storeAndNotify` throw-after-save, `persistLinkedInAnalysis`, free-scan carve-out.
- `grade-linkedin/prompts.ts` — 4-section rubric, calibration anchors (L71-78, L196-205), follow-up block (L296-297).
- `grade-linkedin/validation.ts` — 4-section validator, sum-reconciliation, `clampLinkedInSectionScores`.
- `recruiting-lens/index.ts` (L480-779) — dual merit/legacy branches, no-idempotency-key gap, `withCors` wrapper, Elite-403 gate, `buildRecruitingLensCacheKey`.
- `src/hooks/useAnalysisRun.ts` — recovery hook contract (`startRun`/`retry`/`clear`, `previousResult` latch, `canRetry`).
- `src/pages/LinkedInGrader.tsx` — `rawScore`/`sectionBreakdown[4]` bindings, band labels (L890-893), `LOCKED_FIXES_PLACEHOLDERS` (L82-111), `isV3Grade`.
- `supabase/functions/deno.json` — `test:ci` explicit allowlist (new tests must register).
- `.planning/research/PITFALLS.md` — Pitfalls 2/3/5/7/8/9/12 (primary design input).
- `.planning/phases/03-.../03-CONTEXT.md`, `.planning/REQUIREMENTS.md` (FEAT-03/04/06, VER-03), `.planning/ROADMAP.md` (Phase 4).

### Secondary (MEDIUM)
- Inferred rubric weighting + band cutoffs — Claude's-discretion design grounded in recruiter-impact reasoning; to be confirmed by VER-03 fixtures, not asserted.

## Metadata

**Confidence breakdown:**
- Integration mechanics (executor, merit seam, idempotency, CORS, current code): HIGH — direct read of every load-bearing file.
- LinkedIn rubric weighting + normalization math: MEDIUM — defensible model, exact numbers are discretion + must be VER-03-confirmed.
- Recalibrated band cutoffs: MEDIUM — hypothesis pending fixture distribution.
- Validation architecture (offline-vs-live split): HIGH — grounded in `deno.json`/`verify:baseline`/promptfoo precedents.

**Research date:** 2026-07-03
**Valid until:** ~2026-08-03 (stable — internal-codebase-grounded; re-verify if Phase 3 substrate or the merger schema changes).
