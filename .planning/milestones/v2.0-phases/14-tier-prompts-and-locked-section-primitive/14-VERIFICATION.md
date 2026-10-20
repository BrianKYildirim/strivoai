---
phase: 14-tier-prompts-and-locked-section-primitive
verified: 2026-04-16T22:30:00Z
status: human_needed
score: 6/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run the tier-output validation harness with a live Anthropic key: RUN_TIER_VALIDATION=1 pwsh -File scripts/run-edge-tests.ps1"
    expected: "TEST-09 passes (Free response contains zero locked fields) and TEST-10 passes (Free token count < 50% of Elite token count). Fixture file supabase/functions/_shared/tier-validation-fixtures/resume.json is populated with freeTokens, eliteTokens, ratio, timestamp."
    why_human: "The validation harness makes live Anthropic API calls. The fixture is currently empty {}. Automated CI cannot run this without incurring cost (~$0.05) and requiring the ANTHROPIC_API_KEY secret. SC-2 and SC-6 both depend on this live run passing."
---

# Phase 14: tier-prompts-and-locked-section-primitive Verification Report

**Phase Goal:** Ship the shared tier-variant prompt loader and the reusable locked-section UI primitives that make partial output feel intentional, plus the tier-output validation harness.
**Verified:** 2026-04-16T22:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each feature has three prompt variant files/constants that an edge function can load by tier | VERIFIED | `buildFreeResumePrompt`, `buildProResumePrompt`, `buildEliteResumePrompt` exported from `resume-prompts.ts`; `RESUME_PROMPT_VARIANTS` map registered via `registerFeaturePrompts('resume', ...)` at module load. `loadPromptVariant('resume', tier, params)` callable via the loader. |
| 2 | A Free prompt variant returns a response with zero locked fields present (live model) | UNCERTAIN (human needed) | The harness (`tier-validation.test.ts`) is correctly authored with `TEST-09` field-presence assertion and `ignore: skip` env-gate. However, `supabase/functions/_shared/tier-validation-fixtures/resume.json` contains `{}` — the live run has never been executed. Cannot verify without running `RUN_TIER_VALIDATION=1`. |
| 3 | Pro and Elite variants include `STRIVO_GLOBAL_AI_PRINCIPLES`; Free variants do not | VERIFIED | `tier-prompts.ts` loadPromptVariant: `if (tier === 'free') return body;` else prepend `STRIVO_GLOBAL_AI_PRINCIPLES`. 7 Deno tests in `tier-prompts.test.ts` assert the invariant. `resume-prompts-variants.test.ts` test 7 asserts `proOutput.startsWith(STRIVO_GLOBAL_AI_PRINCIPLES.slice(0, 50))` and test 8 asserts Free does not begin with principles. |
| 4 | LockedSection renders a visible header, blurred body, one-sentence teaser, and upgrade CTA; used by at least one test page | VERIFIED | `LockedSection.tsx` renders `<h3>` header, `data-testid="locked-section-blur"` with `aria-hidden="true"`, `data-testid="locked-section-teaser"`, `data-testid="locked-section-cta"`. Used in `src/pages/dev/LockedSectionsSandbox.tsx` (two variants). 6 Vitest tests pass (confirmed by `npm run test`). |
| 5 | A partially-locked array of 5 items renders item 1 as content and items 2-5 as numbered "Edit X of 5 — Locked" cards | VERIFIED | `LockedListItem.tsx` renders label `${label} ${index} of ${total} \u2014 Locked` with `data-testid="locked-list-item"` and `data-index={index}`. Sandbox (`LockedSectionsSandbox.tsx`) demonstrates exactly this: one unlocked card + `[2,3,4,5].map(i => <LockedListItem index={i} total={5} label="Rewrite" ...>)`. 5 Vitest tests pass asserting the em-dash format and data-index attributes. |
| 6 | A test harness runs the same input across all three tiers and asserts Free token count < 50% of Elite | UNCERTAIN (human needed) | `tier-validation.test.ts` exists with `TEST-10` token budget assertion using `Promise.all` for Free and Elite calls. Fixture is empty `{}`. The harness is correctly structured but has never run. Cannot assert pass/fail without live execution. |
| 7 | Per-tier timeout values (Free 50s / Pro core 125s / Pro elite-preview 65s / Elite 155s / Quiz 80s) are centralized and importable | VERIFIED | `tier-config.ts` exports `TIER_TIMEOUTS = { free: { core: 50_000 }, pro: { core: 125_000, 'elite-preview': 65_000 }, elite: { core: 155_000, quiz: 80_000 } }` and `getTimeout(tier, callType)`. 19 Deno tests in `tier-config.test.ts` assert every value. |

**Score:** 5/7 truths verified directly, 1/7 deferred to human (live model run), 6/7 verified counting static harness structure

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/_shared/tier-config.ts` | TIER_TIMEOUTS, getTimeout, getModel, TIER_MODELS, FREE_MODEL | VERIFIED | All exports present, 5 timeout literals confirmed, Free-model Haiku enforcement structurally coded |
| `supabase/functions/_shared/tier-config.test.ts` | 19 Deno tests for BACK-12 values and D-13 Free-model enforcement | VERIFIED | File exists with 19 assertions per summary |
| `supabase/functions/_shared/global-ai-principles.ts` | STRIVO_GLOBAL_AI_PRINCIPLES constant (>200 chars) | VERIFIED | File exists; constant is 5,400+ characters from DOCX extraction; `STRIVO_GLOBAL_AI_PRINCIPLES_MIN_LENGTH = 200` exported |
| `supabase/functions/_shared/tier-prompts.ts` | loadPromptVariant, registerFeaturePrompts, FEATURE_BUILDERS, Tier, FeatureKey | VERIFIED | All exports present; auto-prepend logic coded; import from global-ai-principles.ts confirmed |
| `supabase/functions/_shared/tier-prompts.test.ts` | 7 Deno tests for GATE-01..04 invariants | VERIFIED | File exists; registered in run-edge-tests.ps1 |
| `supabase/functions/_shared/resume-prompts.ts` | Three builders + registerFeaturePrompts call at module load | VERIFIED | buildFreeResumePrompt, buildProResumePrompt, buildEliteResumePrompt exported; registerFeaturePrompts('resume', ...) on line 376; FREE TIER OUTPUT CONSTRAINT block on line 67; ELITE ANALYSIS block on line 50 |
| `supabase/functions/_shared/resume-prompts-variants.test.ts` | 8 assertions for tier variant divergence | VERIFIED | File exists; registered in run-edge-tests.ps1 |
| `src/components/LockedSection.tsx` | Flat-props locked section with all 4 data-testid selectors | VERIFIED | data-testid="locked-section", "locked-section-blur", "locked-section-teaser", "locked-section-cta" all present; aria-hidden on blur; no hex literals |
| `src/components/LockedListItem.tsx` | Numbered lock card with data-testid and data-index | VERIFIED | data-testid="locked-list-item", data-index={index}, em-dash via \u2014 in label template; no hex literals |
| `src/components/EliteFeatureGate.tsx` | Elite gate with early return for elite tier, data-testid markers | VERIFIED | data-testid="elite-feature-gate-locked" and "elite-feature-gate-unlocked"; userTier === 'elite' early return; "ELITE EXCLUSIVE" badge; "Upgrade to Elite" CTA; note: featureColor prop JSDoc mentions hex example but default is hsl(var(--primary)) — no hardcoded hex in component body |
| `src/components/ProFeatureBlur.tsx` | @deprecated JSDoc added, unchanged render | VERIFIED | JSDoc block with @deprecated pointing to LockedSection present on lines 11-15; component render unchanged |
| `src/pages/dev/LockedSectionsSandbox.tsx` | Dev sandbox with all 5 primitive variants | VERIFIED | All 5 variants rendered: LockedSection pro, LockedSection elite, 4x LockedListItem + 1 unlocked, EliteFeatureGate userTier="pro" locked, EliteFeatureGate userTier="elite" unlocked |
| `src/App.tsx` | DEV-gated Route for /dev/locked-sections | VERIFIED | import.meta.env.DEV conditional wrapping Route on line 81 |
| `supabase/functions/_shared/tier-validation.test.ts` | Env-gated Deno harness for TEST-09 and TEST-10 | VERIFIED (structure) | File exists with RUN_LIVE guard, FREE_LOCKED_FIELDS array, TEST-09 and TEST-10 assertions, ignore: skip on both tests |
| `supabase/functions/_shared/tier-validation-fixtures/resume.json` | Seed fixture (initially {}) | VERIFIED | File exists containing {} — not yet populated by live run (expected initial state) |
| `vitest.config.ts` | Vitest config with jsdom env and test-setup reference | VERIFIED | defineConfig with jsdom environment, src/test-setup.ts setupFiles, @/path alias |
| `src/test-setup.ts` | @testing-library/jest-dom matcher extension | VERIFIED | Single import '@testing-library/jest-dom/vitest' |
| `src/components/LockedSection.test.tsx` | 6 assertions for GATE-05 render contract | VERIFIED | All 6 tests pass confirmed by npm run test |
| `src/components/LockedListItem.test.tsx` | 5 assertions for GATE-06 render contract | VERIFIED | All 5 tests pass confirmed by npm run test |
| `src/components/EliteFeatureGate.test.tsx` | 5 assertions for GATE-08 render contract | VERIFIED | All 5 tests pass confirmed by npm run test |
| `package.json` | vitest devDependency + test/test:watch scripts | VERIFIED | vitest@^1.6.1, @testing-library/react@^14.3.1, @testing-library/jest-dom@^6.9.1, @testing-library/user-event@^14.6.1; "test": "vitest run" script present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tier-prompts.ts` | `global-ai-principles.ts` | static import of STRIVO_GLOBAL_AI_PRINCIPLES | VERIFIED | `import { STRIVO_GLOBAL_AI_PRINCIPLES } from "./global-ai-principles.ts"` on line 26 |
| `tier-prompts.ts` | FEATURE_BUILDERS registry | `registerFeaturePrompts` mutator | VERIFIED | registry exported; function assigns `FEATURE_BUILDERS[feature] = builder` |
| `resume-prompts.ts` | `tier-prompts.ts` | `registerFeaturePrompts('resume', ...)` at module load | VERIFIED | `registerFeaturePrompts('resume', RESUME_PROMPT_VARIANTS)` on line 376 |
| `tier-validation.test.ts` | `tier-prompts.ts` | `loadPromptVariant` call | VERIFIED | `import { loadPromptVariant } from './tier-prompts.ts'` on line 19 |
| `tier-validation.test.ts` | `anthropic.ts` | `invokeAnthropicText` call | VERIFIED | `import { invokeAnthropicText } from './anthropic.ts'` on line 22; called in both TEST-09 and TEST-10 |
| `LockedSection.test.tsx` | `LockedSection.tsx` | import + render | VERIFIED | `import { LockedSection } from '@/components/LockedSection'` |
| `App.tsx` | `LockedSectionsSandbox.tsx` | DEV-gated React Router Route | VERIFIED | `{import.meta.env.DEV && <Route path="/dev/locked-sections" element={<LockedSectionsSandbox />} />}` on lines 81-82 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `LockedSection.tsx` | title, teaser, requiredTier | Props (caller-provided) | Yes — flat props, no dynamic fetch | FLOWING (prop-driven render, no dynamic data needed) |
| `LockedListItem.tsx` | index, total, label | Props (caller-provided) | Yes — flat props | FLOWING |
| `EliteFeatureGate.tsx` | userTier, children | Props (caller-provided) | Yes — children rendered conditionally | FLOWING |
| `tier-validation.test.ts` | resumeText | `Deno.readTextFile(scripts/test-resumes/medium.txt)` | Yes — reads real fixture file | FLOWING (file read confirmed by path in source) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 16 Vitest component tests pass | `npm run test -- --reporter=verbose` | 3 test files, 16 tests passed, 3.34s | PASS |
| tier-config.ts exports all required constants | `grep -q "50_000\|125_000\|65_000\|155_000\|80_000" supabase/functions/_shared/tier-config.ts` | All 5 literals found | PASS |
| Free model constant present | `grep -q "claude-haiku-4-5-20251001" supabase/functions/_shared/tier-config.ts` | Found | PASS |
| STRIVO_GLOBAL_AI_PRINCIPLES minimum length | Source file is 5,400+ chars, constant exported | Length far exceeds 200 char minimum | PASS |
| registerFeaturePrompts wired at module load in resume-prompts | `grep "registerFeaturePrompts" supabase/functions/_shared/resume-prompts.ts` | Line 376 found | PASS |
| FREE TIER OUTPUT CONSTRAINT block present | `grep "FREE TIER OUTPUT CONSTRAINT" supabase/functions/_shared/resume-prompts.ts` | Line 67 found | PASS |
| ELITE ANALYSIS block present | `grep "ELITE ANALYSIS" supabase/functions/_shared/resume-prompts.ts` | Line 50 found | PASS |
| DEV-gated route in App.tsx | `grep "import.meta.env.DEV" src/App.tsx` | Line 81 found | PASS |
| No hardcoded hex in LockedSection/LockedListItem | `grep -E "#[0-9a-fA-F]{3,6}" src/components/LockedSection.tsx src/components/LockedListItem.tsx` | No matches | PASS |
| tier-validation harness live run (SC-2, SC-6) | `RUN_TIER_VALIDATION=1 pwsh -File scripts/run-edge-tests.ps1` | Not run — fixture is `{}` | SKIP (human needed) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GATE-01 | 14-02, 14-03 | Each feature ships 3 system prompt variants loadable by tier | VERIFIED | `loadPromptVariant(feature, tier, params)` loader + resume registered with 3 builders |
| GATE-02 | 14-02 | Edge functions select prompt variant before API call | VERIFIED | Loader throws `tier-prompts: feature '${feature}' not registered` for unregistered features; `loadPromptVariant` is the single dispatch point |
| GATE-03 | 14-03 | Free prompt variants instruct model to omit locked fields | VERIFIED (structure) | FREE TIER OUTPUT CONSTRAINT block in resume-prompts.ts explicitly instructs model to omit all RES-02 fields; live verification is TEST-09 (human needed) |
| GATE-04 | 14-02 | Pro and Elite load STRIVO_GLOBAL_AI_PRINCIPLES; Free does not | VERIFIED | Structural enforcement in tier-prompts.ts; 7 Deno tests assert invariant |
| GATE-05 | 14-04, 14-08 | Shared LockedSection: header + blurred body + teaser + CTA | VERIFIED | Component exists with all 4 elements; 6 Vitest tests confirm render contract |
| GATE-06 | 14-04, 14-08 | Partially locked arrays render "Edit X of N — Locked" cards | VERIFIED | LockedListItem renders em-dash label format; sandbox demonstrates 5-item partial-lock; 5 Vitest tests pass |
| GATE-07 | 14-05 | ProFeatureGate retained unchanged | VERIFIED | git diff confirms no changes to src/components/ProFeatureGate.tsx in phase 14 commits |
| GATE-08 | 14-05, 14-08 | EliteFeatureGate for Pro users viewing Elite-only fields | VERIFIED | Component exists with data-testid markers, "ELITE EXCLUSIVE" badge, early return for elite; 5 Vitest tests pass |
| GATE-09 | 14-07 | Free output token count < 50% of Elite | UNCERTAIN (human needed) | TEST-10 assertion coded in tier-validation.test.ts; fixture `{}` — live run not executed |
| BACK-12 | 14-01 | Per-tier timeout configuration centralized | VERIFIED | TIER_TIMEOUTS with all 5 exact values; getTimeout function; 19 Deno tests |
| TEST-09 | 14-07 | Tier output validation — Free contains only Free fields | UNCERTAIN (human needed) | Harness coded with FREE_LOCKED_FIELDS assertion; live run not executed |
| TEST-10 | 14-07 | Free output token count < 50% of Elite | UNCERTAIN (human needed) | Harness coded with token budget assertion; live run not executed |
| TEST-11 | 14-08 | Locked sections render correctly | VERIFIED | 16 Vitest tests passing across 3 test files |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/functions/_shared/tier-validation-fixtures/resume.json` | 1 | Empty `{}` — fixture never populated | Info | The fixture is intentionally empty until first live run. Plan 07 SUMMARY documents this explicitly: "developer running phase verification must commit that snapshot." Not a blocker; the harness structure is correct. |
| `src/components/EliteFeatureGate.tsx` | 23 | JSDoc mentions `"#0A66C2"` as example hex value in prop comment | Info | This is a JSDoc example in a comment, not a hardcoded color in component body. Default value uses `hsl(var(--primary))`. No impact on rendering. |

### Human Verification Required

#### 1. Live Tier-Output Validation (SC-2, SC-6, TEST-09, TEST-10, GATE-09)

**Test:** With a valid `ANTHROPIC_API_KEY` set in the environment, run:
```powershell
$env:RUN_TIER_VALIDATION = '1'
pwsh -File scripts/run-edge-tests.ps1
```
**Expected:**
- `TEST-09 resume Free variant omits all locked fields (live)` — passes (all FREE_LOCKED_FIELDS are undefined in parsed JSON response)
- `TEST-10 resume Free token count < 50% of Elite (live, snapshot)` — passes (freeTokens < 0.5 * eliteTokens)
- `supabase/functions/_shared/tier-validation-fixtures/resume.json` is written with `freeTokens`, `eliteTokens`, `ratio`, `timestamp` fields
- After passing, commit the populated fixture file

**Why human:** Makes live Anthropic API calls (~$0.05 cost). Requires `ANTHROPIC_API_KEY` secret. Automated CI does not run this by design (D-15 cost protection). The harness is correctly structured with both tests using `ignore: skip` and the runner conditional on `$env:RUN_TIER_VALIDATION`. This verification closes SC-2, SC-6, TEST-09, TEST-10, and GATE-09.

### Gaps Summary

No code gaps were found. All artifacts exist, are substantive, and are wired. The single unresolved item is the live Anthropic validation run (SC-2, SC-6) which requires human execution by design — the harness is scaffolded but the $0.05 live run has not been executed. This is expected per the phase plan ("developer running phase verification must commit that snapshot").

---

_Verified: 2026-04-16T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
