---
phase: 05-deep-test-coverage-expansion
plan: 06
subsystem: testing
tags: [promptfoo, adversarial, prompt-injection, off-gate, real-ai, analyze-resume, analyze-career, grade-linkedin, recruiting-lens, TEST-05, TEST-07, negative-invariant]

# Dependency graph
requires:
  - phase: 01-testing-strategy-regression-baseline
    provides: "interview-prep-analyze promptfoo injection pattern (http provider + ${ANALYZE_URL}/${TEST_JWT} env injection + 20-attack-class fixtures.yaml + 4 defaultTest.assert contracts); verify:baseline gate composition; regression-gate.yml; TEST-07 fixture taxonomy (13->20)"
  - phase: 05-deep-test-coverage-expansion
    plan: 01
    provides: "05-SUSPECTED-BEHAVIOR.md D-08 register; grown deno test:ci offline allowlist (587 passed | 0 failed baseline this wave)"
provides:
  - "Four off-gate real-AI promptfoo injection suites (analyze-resume, analyze-career, grade-linkedin, recruiting-lens) replicating the interview-prep pattern"
  - "Per-feature package.json scripts: test:adversarial:{resume,career,linkedin,recruiting} mirroring test:adversarial"
  - "Re-verified NEGATIVE invariant: neither verify:baseline (package.json) nor regression-gate.yml references promptfoo / test:adversarial (D-04/D-07)"
affects: [05-07, dependency-hygiene]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Off-gate real-AI adversarial twin: promptfoo http-provider injection suite kept OFF verify:baseline/regression-gate (D-04/D-07, costed Anthropic) — the deliberate counterpart to 05-05's on-gate deterministic sanitizer layer (never conflate, Pitfall 6)"
    - "Per-feature body-shape replication: copy the interview-prep injection trio, swap only the body: to each function's ACTUAL intake field(s), keep the 4 leak/JSON contracts byte-identical, adjust the 5th no_variant_escalation per feature"
    - "T-05-12 fixture-secret-hygiene: committed YAML carries ONLY ${ANALYZE_URL}/${TEST_JWT} placeholders + synthetic payloads; live secrets injected at invocation, never committed"

key-files:
  created:
    - "supabase/functions/analyze-resume/__tests__/fixtures/injection/promptfooconfig.yaml"
    - "supabase/functions/analyze-resume/__tests__/fixtures/injection/fixtures.yaml"
    - "supabase/functions/analyze-resume/__tests__/fixtures/injection/noop.txt"
    - "supabase/functions/analyze-career/__tests__/fixtures/injection/promptfooconfig.yaml"
    - "supabase/functions/analyze-career/__tests__/fixtures/injection/fixtures.yaml"
    - "supabase/functions/analyze-career/__tests__/fixtures/injection/noop.txt"
    - "supabase/functions/grade-linkedin/__tests__/fixtures/injection/promptfooconfig.yaml"
    - "supabase/functions/grade-linkedin/__tests__/fixtures/injection/fixtures.yaml"
    - "supabase/functions/grade-linkedin/__tests__/fixtures/injection/noop.txt"
    - "supabase/functions/recruiting-lens/__tests__/fixtures/injection/promptfooconfig.yaml"
    - "supabase/functions/recruiting-lens/__tests__/fixtures/injection/fixtures.yaml"
    - "supabase/functions/recruiting-lens/__tests__/fixtures/injection/noop.txt"
  modified:
    - "package.json"

key-decisions:
  - "Feature-adjusted no_variant_escalation: unlike interview-prep (whose user-facing response carries a `variant` field), these four features resolve tier server-side and never echo a user-facing tier/variant. The 5th assert was adjusted to guard that NEITHER `tier` NOR `variant` in the response escalates to 'elite'/'elite_taste' — the feature-correct form of 'tier cannot be overridden by body content'."
  - "Body shapes pinned from each index.ts request parsing: analyze-resume=resumeText (+stream:false); analyze-career=resumeTextContent (+allowResumeOnly:true); grade-linkedin=profileContent; recruiting-lens=resumeSummary + jobDescription (+ required company/roleTitle; Elite-gated → TEST_JWT must be Pro/Elite or every fixture hits the 403 gate, still valid-JSON/no-leak)."
  - "test:adversarial (interview-prep) left UNCHANGED as the canonical name; four NEW per-feature scripts added alongside it rather than renaming."
  - "Negative invariant is the central control-verification deliverable (T-05-13): re-asserted that verify:baseline and regression-gate.yml carry zero promptfoo/test:adversarial reference. Folding a costed real-AI call into the per-PR gate would risk a fail-open if Anthropic is down."

requirements-completed: [TEST-05, TEST-07]

# Metrics
duration: 12min
completed: 2026-06-19
---

# Phase 05 Plan 06: Off-Gate Real-AI Injection Suites for the Four High-Risk Ingesters Summary

**Extended the interview-prep promptfoo injection pattern to the four high-risk user-text ingesters (analyze-resume, analyze-career, grade-linkedin, recruiting-lens) as OFF-gate real-AI suites with per-feature body shapes + per-feature scripts, while re-proving the negative invariant that the per-PR gate carries no promptfoo reference — zero functional change.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files:** 13 (12 created injection-fixture files + 1 modified `package.json`)

## Accomplishments
- **Task 1:** created the `analyze-resume` and `analyze-career` injection trios (promptfooconfig.yaml + fixtures.yaml + noop.txt each), each replicating the interview-prep http-provider pattern with the feature's actual intake body shape, the 4 leak/JSON `defaultTest.assert` contracts, and a feature-adjusted `no_variant_escalation` check.
- **Task 2:** created the `grade-linkedin` and `recruiting-lens` trios the same way; added four per-feature scripts to `package.json` (`test:adversarial:{resume,career,linkedin,recruiting}`); re-asserted the negative invariant (no promptfoo on the gate).
- All four configs parse via `npx promptfoo validate` (Configuration is valid). No real URL/JWT/key in any committed injection file (grep clean across all four trios). Deno gate green and unchanged at 587 passed | 0 failed.

## Task Commits

1. **Task 1: analyze-resume + analyze-career injection trios** — `bf9ea70` (test)
2. **Task 2: grade-linkedin + recruiting-lens trios + per-feature scripts + negative invariant** — `59a4277` (test)

## Per-Feature Body Shapes (pinned from each index.ts request parsing)

| Feature | Raw user-text field(s) embedding `{{resume}} {{injection}}` | Extra body keys | Notes |
| ------- | ----------------------------------------------------------- | --------------- | ----- |
| analyze-resume | `resumeText` | `targetRole`, `targetIndustry`, `previousSuggestions: []`, `stream: false` | tier resolved server-side from JWT; `rawBody.tier` never trusted |
| analyze-career | `resumeTextContent` | `allowResumeOnly: true` | resume-only path so a benign text fixture passes intake; tier server-side (D-14) |
| grade-linkedin | `profileContent` | — | accepts `profileData.profileContent` or top-level `profileContent`; min 50 chars |
| recruiting-lens | `resumeSummary` + `jobDescription` (both) | `company`, `roleTitle` (both required) | Elite-gated (Free → 403); TEST_JWT must be Pro/Elite or every fixture hits the 403 gate (still valid-JSON, no leak) |

## Escalation-Field Adjustment Per Feature

interview-prep's 5th assert checks `body.variant !== 'elite'` because its user-facing response carries a `variant`. These four features resolve tier server-side and do **not** echo a user-facing `variant`. The adjusted `no_variant_escalation` for all four guards that **neither** `body.tier` **nor** `body.variant` escalates to `'elite'`/`'elite_taste'` — the feature-correct expression of "tier cannot be overridden from body content." (Server-side `tier`/`variant` cache columns on `analysis_results`/cache rows are not in the user-facing response body, so the contract is conservative: any future leak of an escalated tier/variant into the response body would fail the assertion.)

## New package.json Scripts (off-gate)

```
test:adversarial:resume      → promptfoo eval --config supabase/functions/analyze-resume/__tests__/fixtures/injection/promptfooconfig.yaml
test:adversarial:career      → promptfoo eval --config supabase/functions/analyze-career/__tests__/fixtures/injection/promptfooconfig.yaml
test:adversarial:linkedin    → promptfoo eval --config supabase/functions/grade-linkedin/__tests__/fixtures/injection/promptfooconfig.yaml
test:adversarial:recruiting  → promptfoo eval --config supabase/functions/recruiting-lens/__tests__/fixtures/injection/promptfooconfig.yaml
```

Each relies on `ANALYZE_URL`/`TEST_JWT` injected at invocation time. The existing `test:adversarial` (interview-prep) is unchanged.

## Negative Invariant — Explicit Confirmation (T-05-13 / D-07)

- **`verify:baseline`** (package.json line 18) = `npm run test && npm run test:edge && npm run test:e2e` — contains **NO** `promptfoo` / `test:adversarial`. UNCHANGED in composition vs baseline.
- **`.github/workflows/regression-gate.yml`** — `grep promptfoo|test:adversarial` returns **NOTHING** (zero references).
- The only `promptfoo` references in `package.json` are the five off-gate `test:adversarial*` scripts (lines 19–23) and the `promptfoo` devDependency pin (line 113).

## Live Run = Operator-Scheduled

The four suites call a deployed endpoint with a real Anthropic model behind it (costed). Per VALIDATION.md / D-04, the live run is a **scheduled or label-triggered operator step** — NOT a per-PR or automated step. To run, the operator injects `ANALYZE_URL` (the deployed function URL) and `TEST_JWT` (a Pro/Elite-tier test JWT for recruiting-lens) and invokes the relevant `npm run test:adversarial:<feature>`. Nothing in this plan triggers a costed call automatically.

## Deviations from Plan

None — plan executed exactly as written. Both tasks, the per-feature body-shape pinning from each `index.ts`, the 4 retained contracts + feature-adjusted 5th assert, the placeholder-only secret hygiene, the off-gate scripts, and the negative-invariant re-assertion were all followed as specified. No D-08 escalation: this is a test-only, zero-product-source-change plan (the two commits touched only the 12 injection files + `package.json` off-gate scripts; `git diff bf9ea70~1 59a4277` shows 0 `index.ts`).

## Self-Check: PASSED

- All 13 claimed files verified present on disk (4 trios × 3 files + package.json).
- Both task commits verified in git history: `bf9ea70` (Task 1), `59a4277` (Task 2).
- All four promptfoo configs parse (`npx promptfoo validate` → "Configuration is valid" ×4).
- Secret-scan clean across all four injection dirs (no `https://*.supabase.co` / `Bearer <token>` / `sk-ant`).
- Negative invariant: `verify:baseline` + `regression-gate.yml` carry NO promptfoo/test:adversarial reference.
- Deno gate green & unchanged: `npm run test:edge` → 587 passed | 0 failed.
- Zero product source change: `git diff bf9ea70~1 59a4277` touches 0 `index.ts` (12 fixtures + package.json only).

---
*Phase: 05-deep-test-coverage-expansion*
*Completed: 2026-06-19*
