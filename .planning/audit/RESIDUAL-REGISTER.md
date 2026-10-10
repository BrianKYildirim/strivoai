# RESIDUAL REGISTER — Documented-but-Deferred Cleanup Items

**Phase:** 04 — Dead Code & Refactor Cleanup
**Created by:** Plan 04-01 (CLEAN-02 safe-baseline removal) — the first plan to find a residual
**Created:** 2026-06-14
**Branch / HEAD at creation:** `staging`

---

## Purpose

Per decision **D-01** ("remove what clears, document what genuinely cannot be cleared"), this register records
audit candidates that were classified `safe` (or otherwise expected to be removable) but which, on attempted
removal, **failed the multi-signal removability bar (D-09)** because a live consumer was discovered. Each entry
records *why* the item could not be cleared and the *concrete clearance criterion* that, once met, makes it
removable in a follow-up plan.

This is an **append-only** register. Plan 04-01 creates it with the first residual; later plans (e.g. 04-04 /
04-05 / the CLEAN-05 sweep) append their own residuals as they are discovered. Removing nothing here — this file
records paths, signals, and rationale only.

---

## Residuals

### R-01 — `src/components/MinimalHero.tsx` (deferred from Plan 04-01)

| Field | Value |
| ----- | ----- |
| **File** | `src/components/MinimalHero.tsx` |
| **Discovered by** | Plan 04-01 (CLEAN-02), 2026-06-14 |
| **Audit verdict (origin)** | `DEAD-CODE.md` row 2 → **`safe`** (knip flagged it a dead file; the audit's only non-self hit was a code COMMENT in `RecruitingLens.tsx`) |
| **Residual signal (why it did NOT clear)** | **Live, non-co-located test consumer:** `src/pages/__tests__/document-extraction-secondary.test.ts` reads this component's source via a `readFileSync`-backed `source('src/components/MinimalHero.tsx')` helper (string path) and asserts on its content — references at **lines ~14, ~84, ~94, ~95** (and the helper definition ~line 108). Deleting the file makes `readFileSync` throw **ENOENT**, turning `npm run verify:baseline` **RED**. This is a **KEEP-LIST Class 4 dynamic-reference** (string-path consumer) that the audit's bare-word, test-excluded importer grep did not surface. |
| **Why deferred (not removed in 04-01)** | The audit mis-classified it `safe`: the multi-signal removability bar (**D-09**) does **not** clear — it has a live **dynamic string-path consumer** that the original four-signal sweep missed (the sweep excluded `*.test.*`/`__tests__` and only looked for bare-word JSX/import references, so a `readFileSync('…/MinimalHero.tsx')` string was invisible). Under D-01, what genuinely cannot be cleared is documented rather than forced. Per the approved checkpoint **Option A**, MinimalHero is left in place and **no test was edited**. |
| **Clearance criterion** | Reconcile the 4 `MinimalHero.tsx` references in `src/pages/__tests__/document-extraction-secondary.test.ts` — either point those assertions at a different *live* file that legitimately carries the asserted extraction-payload shape (`documentType: 'resume'`, `resumeId: resume.id`), **or** confirm the test should assert a different live consumer entirely. Once that test no longer reads `src/components/MinimalHero.tsx` via `readFileSync`, the multi-signal gate clears and MinimalHero can be removed in a follow-up (the **CLEAN-05** sweep or a dedicated plan), gated by a green `verify:baseline` before and after. |
| **Status** | **DEFERRED** — documented, not removed. Still appears on the `audit:deadcode` dead-list as the known deferred residual. |

---

## Kept-by-Signal Exports & Files (Plan 04-05, D-09 conservative-by-signal — NOT removed)

Per **D-09** the unused-export prune is conservative-by-signal: an export is removed ONLY when **every** signal
clears (no ambient/`import type` consumer, no string/dynamic consumer, no cross-layer edge consumer, no deliberate
public-API/parity/test seam). Plan 04-05 swept every row of `DEAD-CODE.md`'s "Unused EXPORTS / TYPES" table.
**Every candidate had at least one signal that did NOT clear → ZERO exports were pruned.** Each KEPT verdict is
recorded below so a future plan can re-evaluate if the blocking consumer is later removed.

| Export / symbol | File | Signal that fired (why KEPT) |
| --------------- | ---- | ---------------------------- |
| `getMaxOutput`, `getMaxInputTokens`, `getMaxInputChars`, `getMeritCost` (+ types) | `src/config/pricing-config.ts` | **Cross-layer edge consumer (knip FALSE POSITIVE).** `supabase/functions/_shared/tier-config.ts` (L130–142) imports all four across three `../` levels on the business-critical analyze-resume / analyze-career / grade-linkedin / recruiting-lens tier-cap paths. MANDATORY KEEP. `git diff src/config/pricing-config.ts` is EMPTY. |
| `makeQueryBuilder` | `src/test/supabaseMock.ts` | **In-file consumer + test seam.** Consumed at L114 (`from: () => makeQueryBuilder()`); deliberate test-infra export. |
| `useFeatureGate`, `FeatureType` | `src/hooks/useTierAccess.ts` | **In-file consumer + preserved-by-design seam.** `FeatureType` is used in-file (L41/52/86/99); the file header (L19) explicitly states `useFeatureGate` "is preserved"; a co-located test references it. |
| `ScoreRing` (barrel re-export) | `src/components/career-compass/index.ts` | **Barrel-stability re-export of a LIVE symbol.** `ScoreRing` is heavily consumed via the direct path `./ScoreRing` (ReadinessTab.tsx + its own tests). The barrel line is an API-stability re-export, not dead code. |
| `InterviewPrepPayloadSchema`, `InterviewPrepResponseSchema` | `src/types/interviewPrep.ts` | **Gated Interview-Prep zod schemas (KEEP-LIST Class 1).** MANDATORY KEEP. |
| `reducer`, `toast` | `src/hooks/use-toast.ts` | **shadcn `ui/**` parity export.** MANDATORY KEEP. |
| `DOCUMENT_EXTRACTION_VERSION`, `ACCEPTED_RESUME_DOCUMENT_EXTENSIONS` (+ types `DocumentType`/`ExtractionProvider`) | `src/lib/document-extraction.ts` | **In-file consumers + test-string assertion.** Used in-file throughout; `document-extraction-primary.test.ts` (L47/L53) asserts on the literal `export const ACCEPTED_RESUME_DOCUMENT_EXTENSIONS …` source string — removing the `export` keyword turns the test RED (D-09 string-consumer signal fires). |
| `GRADUATION_YEARS`, `YEAR_OPTIONS` | `src/components/profile/EducationTargetsSection.tsx` | **In-file consumers.** Used at L138/L159; the `export { }` (L307) is an authored module seam — narrowing it is API reshaping, not dead-code removal. |
| `extractResumeInsights`, `extractLinkedInInsights`, `getAnalysisHistory` (+ type `AnalysisInsight`) | `src/lib/analysisHelpers.ts` | **Live consumer = `MinimalHero.tsx` (R-01).** `MinimalHero.tsx` (still in the repo as deferred residual R-01) imports + uses `extractResumeInsights` / `AnalysisDisplayResult` (L17/L214/L235). While R-01 is unresolved this is a LIVE consumer → KEEP. (Re-evaluate when R-01 clears.) |
| types `RoleRoadmapStep`, `SkillGap`, `ResumeImprovement` | `src/components/career-compass/types.ts` | **In-file consumers.** Composed by sibling types in the same file (L35/L85/L86). |
| types `CareerTargetsRow`, `ProfileTargetFields` | `src/hooks/useUserTargets.ts` | **In-file consumers.** Used in the hook's return shape (L14/L15). |
| types `LinkedInNextBestAction`, `LinkedInResult` | `src/pages/LinkedInGrader.tsx` | **In-file consumers + cross-component type import.** Used throughout the page (L62/L72/L116/…); `AnalysisComparisonModal.tsx` imports sibling LinkedIn types from this module (`import type { LinkedInSection, LinkedInTopFix }`). |

**Clutter (D-10) outcome:** the in-scope `src/**` tree was scanned for commented-out code and dead TODOs/FIXMEs.
**None found that is not load-bearing.** The only `//`-prefixed code-like comments are deliberate "why"/trade-off
notes (PostgREST null semantics in `useMerits.ts`, PDF-OCR fallback rationale in `extract-pdf-text.ts`, the
412 `linkedin_prior_missing` semantics in `CareerCompass.tsx`, the env-var debug note in
`StripePaymentElementModal.tsx`) — all PRESERVED per D-10. Zero production TODO/FIXME/XXX markers exist. No clutter
commit was made (forcing removals would have deleted load-bearing comments or caused reformat churn).

## CLEAN-06 Lint Scope + Tracked Baselines (Plan 04-06, D-12 config-scope decision — TRACKED, not newly suppressed)

The operator ratified **Option 1 (config-scope)** from `04-RESEARCH.md` Open Question 1 for the
CLEAN-06 lint gate: scope the flat config to the frontend project surface, apply the cheap wins
(remove genuinely-stale `eslint-disable` directives), and treat the pre-existing `no-explicit-any`
baseline as a **tracked known-state** rather than undertaking a behavior-risky ~248-`any` purge across
Stripe/Anthropic payload handlers (which would itself risk behavior on typed-as-`any` external
payloads and violates the zero-functional-change spirit). `npm run lint` exits **0** under this scope.

### Lint config scope (eslint.config.js `ignores`, Plan 04-06)

| Ignored path | Why it is out of the frontend lint surface |
| ------------ | ------------------------------------------- |
| `dist` | Build output (was already ignored). |
| `.claude/**` | GSD tooling (`get-shit-done` runner + patches), NOT project source. Was emitting "Unused eslint-disable directive" parse warnings from `state.cjs`. |
| `supabase/functions/**` | Deno runtime code with its own `deno.json` / strict checking. Never part of this frontend (browser-target, ES2020) flat config; its ~140 `no-explicit-any` are on the Deno lint surface (`deno lint`), not the frontend one. |
| `src/integrations/supabase/types.ts` | Generated typegen output (treated as a binary/generated artifact; ESLint had reported it "appears to be binary"). |

### Tracked rule baselines (downgraded error→warn at config level — `npm run lint` exit 0)

These are **pre-existing failures at the phase-start HEAD**, not introduced by Plan 04-06. Downgrading
a rule that was *already* failing to `warn` is the D-12-sanctioned "explicitly tracked known-state"
mechanism — it is **NOT a new inline suppression** (`git diff` adds zero `@ts-ignore` / `as any` /
`eslint-disable` directives in the phase). Counts are the post-scope frontend (`src/` + root configs)
surface measured at Plan 04-06 close:

| Rule | Tracked count | Nature / why not purged |
| ---- | ------------- | ----------------------- |
| `@typescript-eslint/no-explicit-any` | **99** (frontend surface; 248 total at HEAD = 99 frontend + ~140 Deno [now out-of-scope] + a few collapsed by file deletions in 04-02..05) | Purging would retype Stripe-event / Anthropic-response / Postgrest payloads — behavior-adjacent on external typed-as-`any` data. Out of the zero-functional-change spirit; deferred to a dedicated typing pass. |
| `react-refresh/only-export-components` | 9 (warnings) | Already `warn` pre-existing; non-blocking. |
| `react-hooks/exhaustive-deps` | 8 (warnings) | Pre-existing deliberate dep-array omissions (the stale `eslint-disable-line` overrides were removed by 04-06 `--fix` since eslint reported them unused; the underlying advisory warnings remain). |
| `@typescript-eslint/no-empty-object-type` | 2 | In shadcn `src/components/ui/**` (`command.tsx`, `textarea.tsx`) — KEEP-LIST parity files, must not be edited. |
| `@typescript-eslint/ban-ts-comment` | 2 | Pre-existing `@ts-ignore` in `src/lib/pdf-worker.ts` + `src/lib/supabaseClient.ts` (advises switching to `@ts-expect-error`). Not from this phase; tracked rather than touched. |
| `no-control-regex` | 1 | Legitimate `\x00` control-char match in `src/lib/document-extraction.ts:449` (DOCX byte-scan) — a real, intended pattern, not a defect. |
| `@typescript-eslint/no-require-imports` | 1 | `tailwind.config.ts:155` `require("tailwindcss-animate")` — the standard shadcn/Tailwind CJS config pattern in a Node-context build config; converting to ESM `import` is a behavior-adjacent build-config change. Zero `src/` occurrences. |

### NEW tracked warn-baselines — eslint-plugin-react-hooks v7 React-Compiler rules (Plan 06-03, DEP-03, D-12 mechanism)

The Plan 06-03 eslint-tooling coupled bump (eslint 9→10 + eslint-plugin-react-hooks **5→7** +
eslint-plugin-react-refresh 0.4→0.5 + typescript-eslint 8.61.1 + globals 15→17, commit
`1848f728`) expanded the react-hooks plugin's `recommended` config from **2 rules**
(`rules-of-hooks` + `exhaustive-deps`) to **16** — newly enabling the React-Compiler-style rules below
as `error`. They fire on **pre-existing shipped code** (synchronous `setState` in effects, render-phase
impurity, manual-memoization patterns, ref-access-before-declare) that was **never linted before** the
plugin major. Fixing them is a **behavior-risky multi-component refactor** that is OUT OF SCOPE for a
zero-functional-change dependency bump. Per the **identical D-12 tracked-baseline mechanism** used for
`no-explicit-any` etc. above, each newly-enabled rule is **downgraded `error`→`warn`** in
`eslint.config.js` so `npm run lint` stays **exit 0** without editing any source (`git diff src/` is
EMPTY for this bump — ZERO new inline `eslint-disable`/`@ts-ignore` added). `rules-of-hooks` is KEPT at
`error` (genuine hook-order violations still fail the gate); `exhaustive-deps` stays `warn` (its
pre-bump severity). These are **tracked known-state, not new suppressions.** Counts measured at the
06-03 eslint-set commit (post-scope frontend surface): the lint total moved 122 → **155 problems
(0 errors / 155 warnings)** — the +33 warnings are these newly-enabled rules; `no-explicit-any` stays
**99 (unpurged)** and the `ignores` scope (`.claude/**`, `supabase/functions/**`, generated `types.ts`)
is **intact**.

| Rule (react-hooks v7, newly enabled) | Severity in 06-03 | Nature / why tracked-as-warn not purged |
| ------------------------------------ | ----------------- | --------------------------------------- |
| `react-hooks/set-state-in-effect` | warn (was n/a → v7 `error`) | Pre-existing synchronous `setState` inside `useEffect` across many components — the React Compiler advises against it (cascading renders) but it is the long-shipped, working pattern here; rewriting effect flows is a behavior-risky refactor. |
| `react-hooks/set-state-in-render` | warn | Render-phase `setState` patterns the v7 rule newly flags; pre-existing. |
| `react-hooks/purity` | warn | "Cannot call impure function during render" — pre-existing render-phase calls (e.g. date/id helpers); behavior-adjacent to touch. |
| `react-hooks/refs` | warn | Ref-access ordering rules ("Cannot access variable before it is declared"); pre-existing. |
| `react-hooks/immutability` | warn | v7 immutability checks on pre-existing mutation patterns. |
| `react-hooks/static-components` | warn | Component-definition-stability checks newly enabled. |
| `react-hooks/use-memo` | warn | `useMemo` usage advisories newly enabled. |
| `react-hooks/preserve-manual-memoization` | warn | Flags manual memoization the compiler would manage; pre-existing. |
| `react-hooks/error-boundaries` / `globals` / `config` / `gating` | warn | The remaining v7 `recommended` additions, tracked as warn for parity; zero/low current hits. |

> **Clearance criterion:** a dedicated **React-Compiler-readiness pass** that resolves (or per-file
> justifies) the flagged patterns and re-tightens these rules to `error`, validated by `npm run lint`
> exit 0 with the rules back at `error` + a green `verify:baseline`. Out of scope for v4.0 dependency
> hygiene (zero-functional-change).

### Stale directives REMOVED by Plan 04-06 (`eslint src --fix`, removals only — allowed under D-12)

| File | Removed directive | Why stale (eslint verdict) |
| ---- | ----------------- | -------------------------- |
| `src/lib/supabaseClient.ts` (×2) | `// eslint-disable-next-line no-console` | "no problems were reported from 'no-console'" — `no-console` is not even enabled in this config. |
| `src/pages/LinkedInGrader.tsx` | `// eslint-disable-line react-hooks/exhaustive-deps` | "no problems were reported" at that line. |
| `src/pages/RecruitingLens.tsx` | `// eslint-disable-line react-hooks/exhaustive-deps` | "no problems were reported" at that line. |
| `src/pages/Results.tsx` | `// eslint-disable-line react-hooks/exhaustive-deps` | "no problems were reported" at that line. |

(The 3 `.claude/**/state.cjs` "Unused eslint-disable" warnings are resolved by the `.claude/**` ignore,
not by editing GSD tooling.) The `CareerCompass.tsx` exhaustive-deps directive was also dropped by
`--fix`. No directive was **added** anywhere — `git diff` shows zero net new suppressions in the phase.

### Test-globals type-gap closed (Plan 04-06 — ONE config addition, not 109 edits)

`tsconfig.app.json` `compilerOptions.types` was set to `["vitest/globals", "node", "vite/client"]`.
`vitest/globals` injects the `describe`/`it`/`expect` ambient types (vitest runs with
`globals: true`), closing the ~108 TS2304/TS2582 "Cannot find name 'describe/it/expect'" errors in
one change; `node` + `vite/client` were re-added because specifying an explicit `types` array
otherwise drops the auto-included `@types/node` (`node:fs`/`process`/`__dirname`/`NodeJS`) and
`vite/client` (`?url` import) ambient types. These tests already PASS under vitest (457/457) — this is
a behavior-preserving types-config fix.

## Closed / Resolved Items (recorded for the audit trail, NOT deferred)

### CLEAN-06-Navbar — `src/pages/SkillsGapAnalysis.tsx` 3 stray `<Navbar />` renders (D-11 latent-bug deviation, Plan 04-06)

| Field | Value |
| ----- | ----- |
| **Item** | A shipped latent **runtime bug**: `SkillsGapAnalysis.tsx` rendered `<Navbar />` in three live branches — `L405` (the every-mount `if (checkingAccess)` branch), `L420` (the `subscriptionTier === 'free'` branch), and `L516` (the primary render return) — but **never imported `Navbar`**. `tsc` flagged this as 3× TS2304 "Cannot find name 'Navbar'"; `vite build` SUCCEEDS (it is a runtime `ReferenceError`, not a build error), so the page shipped a render-time crash. The page is routed + live (`/skills-gap-analysis`, a Pro/Elite feature, App.tsx L71). |
| **Why a D-11 deviation (not a silent fix)** | Per **D-11**, when a type error exposes a latent runtime bug, the fix is a **behavior change** that must be surfaced as an operator-acknowledged deviation — never silently applied, never suppressed. This plan was `autonomous: false` for exactly this gate. |
| **Investigation (what determined the correct fix)** | `SkillsGapAnalysis.tsx` is a **dashboard page**. Its sibling dashboard pages — `CareerCompass`, `LinkedInGrader`, `Upload` — do **NOT** render `<Navbar />` (the dashboard nav is the `AppSidebar`, mounted by the routing layout, not a marketing `Navbar`). `Navbar` is a **named** export (`export const Navbar`) used by marketing/public pages. The three `<Navbar />` lines were **stray copy-paste** referencing an unimported symbol → the shipped crash. The behaviorally-correct fix is therefore to **remove** the three stray lines so the page matches its sibling dashboard pages, NOT to add an `import Navbar` (which would render a wrong, marketing-style nav on a dashboard page). |
| **Operator resolution (D-11)** | **FIX-WITH-ACKNOWLEDGEMENT, via REMOVING the 3 stray `<Navbar />` JSX lines** (not adding an import, not suppressing). This is an **acknowledged behavior change**: the page now **renders** (previously it threw a `ReferenceError` on every mount of those three branches). The forbidden resolutions (silent import-add, `@ts-ignore`/`as any` suppression) were NOT used. |
| **Action taken (Plan 04-06 Task 3)** | Deleted the three `<Navbar />` JSX lines (L405/L420/L516; the enclosing `<div className="min-h-screen bg-background">` wrappers + all sibling JSX preserved). **No `import Navbar` added. No suppression added.** The 3 TS2304 errors disappear because the references are gone → `npm run type-check` exits **0** (fully clean, no tracked exception). `rg "Navbar" src/pages/SkillsGapAnalysis.tsx` → zero matches. `rg "@ts-ignore|as any" <the 3 changed lines>` → none added. `verify:baseline` green AFTER (vitest 457/457, deno 284/0, Playwright 5+1skip). |
| **Post-merge confirmation owed (manual, no e2e coverage)** | There is **no e2e test** covering `/skills-gap-analysis`. The operator must **manually load `/skills-gap-analysis`** (as a Pro/Elite user) post-merge to confirm the page renders cleanly without the (now-removed) Navbar — this is the human confirmation that the acknowledged behavior change is correct. |
| **Status** | **RESOLVED (D-11 fix-with-acknowledgement)** — latent runtime crash removed; behavior change acknowledged; never silently fixed, never suppressed. |


### CLEAN-02-AuthCallback — `src/pages/AuthCallback.tsx` (operator-confirmed REMOVE, Plan 04-05)

| Field | Value |
| ----- | ----- |
| **Item** | `src/pages/AuthCallback.tsx` — a `/auth/callback`-class OAuth landing page, knip dead-file candidate (DEAD-CODE.md row 18; the redirect-string trap). Forward-cross-referenced here by Plan 04-04 as owned by 04-05. |
| **Operator gate (D-07, Task 2 of Plan 04-05)** | This plan was `autonomous: false` precisely because the Supabase dashboard auth redirect URL allow-list is EXTERNAL to the repo — if it listed a `/auth/callback` URL, an OAuth flow could navigate there and the page would have to stay. The gate was presented to the operator and **resolved = REMOVE.** |
| **Operator confirmation evidence (verbatim, recorded as the gate outcome)** | The operator checked the Supabase production dashboard (Authentication → URL Configuration → Redirect URLs) for the canonical prod project `zjpjapgraoxdukdvpjes` and confirmed there is **NO `/auth/callback` URL in the redirect allow-list**. AuthCallback.tsx is therefore dead (repo-side already clear) and removal is authorized. |
| **Repo-side clearance (re-confirmed at Plan 04-05, 2026-06-14)** | (a) `rg "/auth/callback" src` → **zero matches** (no redirect string anywhere). (b) `rg "from '…AuthCallback'" src` → **zero importers**. (c) `rg "AuthCallback" src/App.tsx` → **not routed**. All Supabase auth redirects target `${origin}/` or `${origin}/auth` (Auth.tsx), never `/auth/callback`. |
| **Action taken (remove path, Plan 04-05 Task 3, commit `319f385`)** | `git rm src/pages/AuthCallback.tsx` (specific path). `verify:baseline` green AFTER (vitest 457/457, deno 284/0, Playwright 5+1skip); `audit:deadcode` drops AuthCallback.tsx from the React dead-file list, no new findings. No auth/redirect surface weakened (the page was never reachable). |
| **Status** | **REMOVED (operator-confirmed dead)** — the forward cross-reference from Plan 04-04 is resolved with no deferred residual owed. |

### CLEAN-03-close — `interview-prep-coach` edge function (no-op close, Plan 04-04)

| Field | Value |
| ----- | ----- |
| **Item** | The retired `interview-prep-coach` edge function (a v3.0 carried-forward CLEAN-03 removal target). |
| **Verdict** | **CLEAN-03 CLOSED as a NO-OP.** There is nothing to remove. |
| **Evidence (re-confirmed at Plan 04-04, 2026-06-14)** | (1) **Absent from repo:** `rg "interview-prep-coach" supabase/` → **zero matches** (no `supabase/functions/interview-prep-coach/` directory, no `config.toml` registration, no reference anywhere under `supabase/`). (2) **Absent from the live deploy list:** the 41-function `supabase functions list` snapshot folded into `DATABASE.md` Source C (operator-run against PROD, 2026-06-13) does **not** include `interview-prep-coach` → already retired in prod. (3) The STATE/CONCERNS "never deleted in staging/prod" note was **STALE** (corrected by 03-05 Source C). |
| **CRITICAL distinction** | This is the **retired** coach — NOT the **gated-but-live** `interview-prep-analyze` / `interview-prep-evaluate` pair (KEEP-LIST Keep-Class 1, `VITE_FEATURE_INTERVIEW_PREP`-gated, v52 deployed). The live pair was **not** touched. |
| **Action taken** | None required (`supabase functions delete` is a no-op against a function that is not deployed and has no repo source). Recorded closed. |
| **Status** | **CLOSED (no-op)** — CLEAN-03 satisfied for this item with zero source/deploy change. |

### CLEAN-03-Ollama — Ollama extraction leg (operator-confirmed REMOVE, Plan 04-04)

| Field | Value |
| ----- | ----- |
| **Item** | The obsolete Phase-50 Ollama vision extraction leg: `_shared/ollama-client.ts` + its test, plus the `cheapProviders[0]` ollama entry / imports / `ollamaVision?` param in `_shared/document-extraction.ts`. |
| **Operator gate (D-07, Task 2 of Plan 04-04)** | This plan was `autonomous: false` precisely because the Ollama-leg liveness is a live-prod fact unknowable from the repo. The gate was presented to the operator and **resolved = REMOVE**. |
| **Operator confirmation evidence (verbatim, recorded as the gate outcome)** | The operator confirmed, against the real production project, that: (a) the **canonical production Supabase project is `zjpjapgraoxdukdvpjes`**; (b) **`OLLAMA_BASE_URL` is UNSET** in that project's edge-function secrets — verified via `supabase secrets list`, **no `OLLAMA_*` secret present at all** — so the Ollama leg (`cheapProviders[0]`, which is `null`/skipped whenever `readOllamaConfig()` finds no `OLLAMA_BASE_URL`) is **inert and dead in prod**; (c) the operator **authorized removal** of the Ollama extraction leg. |
| **Action taken (remove path, Plan 04-04 Task 3, commit `48e583f`)** | Deleted `_shared/ollama-client.ts` + `_shared/ollama-client.test.ts`; removed the ollama imports, the `ollamaVision?` param, and the `cheapProviders[0]` ollama entry from `_shared/document-extraction.ts`. **No other behavioral change.** The `mistral → textract → claude_ocr` fallback chain that feeds Resume Analysis / Career Compass extraction is **intact and verified** (`rg "provider: 'mistral'\|provider: 'textract'"` returns both after). `test:edge` 284/0 and `verify:baseline` green AFTER; `audit:deadcode` Deno reachable-set dropped **only** by `ollama-client.ts` (36 → 35). |
| **Status** | **REMOVED (operator-confirmed dead)** — CLEAN-03 obsolete-extraction-path retirement satisfied. Not deferred. |

---

## Forward Cross-References (owned by a later plan — recorded here, not resolved here)

- **`src/pages/AuthCallback.tsx` (React, knip dead-file candidate) — owned by Plan 04-05 (CLEAN-02 React half). ✅ RESOLVED 2026-06-14 (Plan 04-05) = REMOVED (operator-confirmed).** At Plan 04-04's `audit:deadcode` run (2026-06-14) `src/pages/AuthCallback.tsx` was still listed by knip as an unused FILE; it was out of scope for 04-04 (the Deno `_shared` half). Plan 04-05's operator gate (Task 2) resolved = REMOVE — the operator confirmed NO `/auth/callback` URL in the prod project `zjpjapgraoxdukdvpjes` redirect allow-list. AuthCallback.tsx was removed (commit `319f385`); **no deferred residual is owed.** Full gate-outcome record under "Closed / Resolved Items → CLEAN-02-AuthCallback" above.

---

## Code-Review Closeout (Phase 04) — Acknowledged Behavior Changes & Reconciliations

### CLEAN-06-Upload-paywall — `src/pages/Upload.tsx:330` handler wrap (acknowledged latent-bug fix, D-11)

| Field | Value |
| ----- | ----- |
| **Item** | The Plan 04-06 Task-1 "type cleanup" wrap `onClick={triggerPaywall}` → `onClick={() => triggerPaywall()}` at `src/pages/Upload.tsx:330` (commit `cc55ee9`). |
| **Discovered by** | Phase 04 code review (`04-REVIEW.md`, WR-01), 2026-06-14 — flagged as NOT runtime-equivalent. |
| **Why it is a behavior change** | `usePaywallGuard.ts:60` defines `triggerPaywall = (args?) => openModal(args ?? { feature:'Analysis', cost:0, balance:0 })`. The OLD bare `onClick={triggerPaywall}` forwarded the React `MouseEvent` as `args` (truthy) → `openModal(mouseEvent)` → the out-of-merits modal rendered `feature/cost/balance = undefined`. The NEW wrapped form calls `triggerPaywall()` → `openModal(default)` → the modal renders the default `{feature:'Analysis', cost:0, balance:0}`. This **silently fixed a latent paywall-modal display bug** (payment-adjacent surface) that had shipped. |
| **Decision (operator-acknowledged, 2026-06-14)** | **KEEP the fix** — the new behavior is correct and matches the sibling no-arg call-sites at `Upload.tsx:96` / `:381`. Recorded here as an **acknowledged behavior change** rather than reverted (parallel to the SkillsGapAnalysis Navbar D-11 fix-with-acknowledgement). It is NOT a silent or suppressed change — it is surfaced and signed off. |
| **Scope note** | The analogous `CareerCompass.tsx:1127` wrap WAS traced and is genuinely a runtime no-op (that handler does not forward its argument); only `triggerPaywall` forwarded its whole argument, so only `Upload.tsx` carried real behavior. |
| **Verification** | `verify:baseline` green after (vitest 457/457, deno 284/0, Playwright 5+1skip). No e2e covers the Upload paywall modal's rendered values — the corrected default display is the intended outcome. |
| **Status** | **KEPT — acknowledged behavior change (latent-bug fix).** |

### CLEAN-03-Ollama-test — `_shared/document-extraction.test.ts` reconciled (code-review closeout)

| Field | Value |
| ----- | ----- |
| **Item** | The co-located `_shared/document-extraction.test.ts` still asserted the removed Ollama leg (provider chain + `ollamaVision` param) after Plan 04-04. |
| **Discovered by** | Phase 04 code review (`04-REVIEW.md`, WR-02/WR-03), 2026-06-14 — 4 failing tests + an `ollamaVision` excess-property type error, **invisible to the gate** because the file is NOT in the `deno.json` `test:ci` allowlist. |
| **Action taken (commit `377c8ec`)** | Reconciled the 6 cases to the post-04-04 chain (`pdf_parser → mistral → textract → claude_ocr`); removed every `ollamaVision` mock/assert and the stale `ollama` provider-chain entries. Runs **6 passed / 0 failed** under the gate's `--no-check --allow-all`. |
| **Carry-forward** | Wiring this orphaned suite INTO the `test:ci` allowlist (so it cannot silently rot again) is deferred to **Phase 5 (Deep Test Coverage Expansion, TEST-03/05/08)**. |
| **Status** | **RECONCILED — green + type-clean; gate-wiring deferred to Phase 5.** |

---

## DEP-03 / Framework Majors Deferred (Phase 06, D-01/D-02)

**Appended by:** Plan 06-01 (Wave 1, 2026-06-20) — the bump ledger's `deferred` rows land here so a future
migration milestone inherits them without re-discovery. Append-only; no prior entry edited.

These are major-version bumps that are **documented-outdated, not dropped.** Each is left on its current
(working, shipped) major behind a recorded breaking reason + clearance criterion. None is taken in Phase 6
because the `verify:baseline` net cannot *prove* no behavior change across them under the zero-functional-change
constraint. Cross-references the `deferred` rows in
[`../phases/06-dependency-hygiene/06-DEP-CHANGES.md`](../phases/06-dependency-hygiene/06-DEP-CHANGES.md).

### DEP-03 DEFER flips — contained majors where the D-02 escape hatch FIRED (breaking runtime/visual, no codemod)

| Package | From → To | Breaking reason (D-02 escape hatch) | Clearance criterion |
| ------- | --------- | ----------------------------------- | ------------------- |
| `lucide-react` | 0.462.0 → 1.21.0 | **v1 REMOVES brand icons, including `Linkedin`** — the repo renders the lucide `Linkedin` component in 6 files (`FeatureCards.tsx`, `LinkedInGrader.tsx`, `RecruitingLensTutorialModal.tsx`, `HowItWorksFeatureCards.tsx`, `Celebrations.tsx`, `Profile.tsx`), incl. the business-critical LinkedIn Grader. v1 also drops UMD and flips icons to `aria-hidden` by default. Breaking *runtime/visual* change with **no clean codemod** for the removed brand icon (requires hand-supplying an SVG / alternate icon); ~95 lucide-importing files = high blast radius. | A dedicated future task that takes lucide-react v1 **and** replaces the removed `Linkedin` brand icon with a custom SVG / alternate across the 6 render sites, gated by a manual icon-render smoke on the LinkedIn Grader + FeatureCards surfaces + a green `verify:baseline`. |
| `react-day-picker` | 8.10.1 → 10.0.1 | **2-major jump that rewrites the shadcn `ui/calendar.tsx` API** — v9 removed `IconLeft`/`IconRight` (replaced by a single orientation-aware `Chevron`), renamed classNames keys, and moved `date-fns` peer→dep. The current `ui/calendar.tsx` uses the **v8** `IconLeft`/`IconRight` + v8 classNames → it would not compile/render without a rewrite of this KEEP-LIST `ui/**` parity file. De-risk: `ui/calendar.tsx` has **zero live consumers** (no app surface renders `<Calendar/>`) → there is no live surface a smoke could validate, which strengthens the DEFER (changelog flags breaking behavior + no codemod + nothing to prove-safe). | A future task that rewrites `ui/calendar.tsx` to the v10 `Chevron` + renamed-classNames API (re-vendoring the current shadcn calendar parity file), validated by `npm run type-check` + `npm run build` + a green `verify:baseline` (and a manual calendar-render smoke if/when a live `<Calendar/>` consumer is added). |
| `tailwind-merge` | 2.6.1 → 3.6.0 | **v3 DROPS Tailwind CSS v3 support and REQUIRES Tailwind CSS v4.** Tailwind 3→4 is explicitly deferred (D-01, framework-grade — config-system rewrite). tailwind-merge 2→3 is therefore **coupled to a deferred framework**: taking it against the live Tailwind 3 would silently mis-merge `cn()` classes app-wide (broad blast radius — `cn()` is used everywhere). | Moves **with** the Tailwind v4 migration milestone (the deferred framework below). When Tailwind v4 is taken, take tailwind-merge v3 in the same coupled set, gated by a visual smoke of `cn()`-composed surfaces + a green `verify:baseline`. |
| `react-resizable-panels` | 2.1.9 → 4.11.2 | **NEW DEFER (Plan 06-03, 2026-06-20).** Initially TAKEN in research (zero live consumers ⇒ "ride baseline"), bumped to ^4.11.2 (commit `b1edf22a`) and reverted to ^2.1.9 (commit `5f59ac4f`). v4 is a **breaking API overhaul** of the shadcn `ui/resizable.tsx` parity surface: `PanelGroup`→`Group`, `PanelResizeHandle`→`Separator`, and the prop model reworked (`direction`→`orientation`, `defaultLayout`, imperative `groupRef`/`panelRef`). `vite build`/vitest/deno all passed (the file has **ZERO live consumers** — nothing renders a resizable panel — so it transpiles without exercising the API), which is why the break slipped the deterministic gate; but `npm run type-check` surfaced **5 `TS2339` errors** in `ui/resizable.tsx` (`Property 'PanelGroup'/'PanelResizeHandle' does not exist on type …react-resizable-panels`). Taking v4 faithfully needs a non-mechanical re-vendor of the shadcn parity file to the v4 `Group`/`Separator`/`orientation` API — exactly the same class of deferred parity-rewrite as react-day-picker@10's `ui/calendar.tsx`. Since there is no live surface to prove-safe and the rewrite would be a hand-rolled non-canonical parity file, **DEFER** under the same D-02-escape-hatch logic. | A future task that re-vendors `ui/resizable.tsx` to the react-resizable-panels v4 `Group`/`Separator`/`orientation` API (from the current shadcn registry once it tracks v4), validated by `npm run type-check` exit-clean (for the resizable file) + `npm run build` + a green `verify:baseline` (and a manual resize-panel render smoke if/when a live `<ResizablePanelGroup/>` consumer is added). |

### D-01 Deferred Framework Majors — migration-grade, documented-outdated (dedicated future migration milestone)

| Package (coupled set) | From → To | Why deferred (migration-grade, D-01) | Clearance criterion |
| --------------------- | --------- | ------------------------------------ | ------------------- |
| `react` 18→19 (+ coupled `react-dom`, `@types/react` 18→19, `@types/react-dom` 18→19, `@testing-library/react` 14→16) | React 18.3.1 → 19.x (coupled set moves together) | React 19 is a *migration, not a bump* — new JSX transform behaviors, ref/`act`/effect-timing changes, and the coupled testing-library 14→16 rewrite; conflicts head-on with zero-functional-change and the `verify:baseline` net (unit suite + 3 E2E flows) cannot *prove* no behavior change across it. | A dedicated React-19 migration milestone (the whole coupled set moves as one gated migration), out of v4.0 scope. |
| `tailwindcss` 3→4 | 3.4.19 → 4.x | Config-system rewrite (the `tailwind.config.ts` theme → CSS-first `@theme` model); behavior-/visual-risky across every styled surface. Couples `tailwind-merge` 2→3 (above). | The Tailwind v4 migration milestone (takes `tailwind-merge` v3 in the same set), out of v4.0 scope. |
| `zod` 3→4 | 3.25.76 → 4.x | Cross-layer (frontend forms + Deno edge validation); v4 changes error/issue shapes and inference. Weakly validated on the Deno side (`--no-check` offline). | A dedicated cross-layer zod-4 migration (frontend + the 27+ edge functions), out of v4.0 scope. |
| `typescript` 5→6 | 5.9.3 → 6.x | Compiler major; new strictness / lib changes can surface latent type errors across the whole tree. | A dedicated TypeScript-6 upgrade pass, out of v4.0 scope. |
| `react-router-dom` 6→7 | 6.30.x → 7.x | Routing major (data-router defaults, API shifts) across 86 importing files. Its DEP-04 open-redirect advisory is taken as an **in-6.x** `6.30.4` patch instead (D-03, Wave 3) — the 6→7 major stays deferred. | A dedicated react-router-7 migration milestone, out of v4.0 scope. |

> **Coupling notes (do NOT mis-classify these as contained):** `@hookform/resolvers` 3→5 is **NOT** here — it is
> taken in Wave 2 (its `/zod` Standard-Schema path is satisfied by the live zod 3.25.76, so it does not couple to
> the deferred zod 4). `tailwind-merge` 2→3 **is** deferred above precisely because it *does* couple to the
> deferred Tailwind v4. `pdfjs-dist` 6.0 is also not taken (couples to a `react-pdf` major out of scope) but is a
> minor/patch-line decision recorded in the bump ledger, not a framework defer.

---

## DEP-04 Accepted-Risk Residue (Phase 06, D-03 — dev-only transitive vulns, OFF the verify:baseline gate)

**Appended by:** Plan 06-05 (Wave 3 — DEP-04 vuln remediation, 2026-06-20). Append-only; no prior entry edited.

After taking the targeted direct/production-path fixes this phase — `vite@8.0.16` (`3659e04f`, cleared GHSA-fx2h-pf6j-xcff
HIGH + GHSA-v6wh-96g9-6wx3 mod), `react-router-dom@6.30.4` (`cb2821e2`, cleared GHSA-2j2x-hqr9-3h42), and the **`ws`
override `8.20.1 → ^8.21.0`** (`3b887498`, cleared the production-path HIGH GHSA-96hv-2xvq-fx4p **plus** the cascading
engine.io / engine.io-client / socket.io-adapter HIGHs the old pin forced onto `@supabase/realtime-js`; high count
dropped 16 → 6) — the **remaining `npm audit` surface is 20 packages, ALL inside the dev-only `promptfoo` subtree**
(adversarial-eval tooling). Measured totals at the Plan-06-05 ws-override HEAD: **1 low / 13 moderate / 6 high / 0 critical = 20**.

**`promptfoo` was MEASURED-then-NOT-taken (measure-then-bump, D-03 / Pitfall 2).** A throwaway `npm install
promptfoo@0.120.19 --save-dev` was run and `npm audit` re-measured: it cleared only 3 packages (`@azure/msal-node`,
`hono`, `uuid`) **but ESCALATED `protobufjs` from HIGH to a NEW CRITICAL** (it pulls protobufjs into the `8.0.0–8.5.0`
arbitrary-code-execution range — GHSA-xq3m-2v4x-88gg + prototype-injection cluster). That is *churning the dev tree in
the wrong direction* (introducing a critical advisory class), so per D-03 it does **NOT cleanly clear moderates** and was
**DISCARDED** (`git checkout package.json package-lock.json`; promptfoo stays `0.120.13`; the residue grows, which is the
explicitly-acceptable dev-only/off-gate outcome). The `git diff package-lock.json` showed **zero** rolldown/napi/emnapi
wasm churn either way. **`npm audit fix --force` was NEVER run** (Pitfall 3 guardrail).

**Why FORMALLY ACCEPTED (off-gate / dev-only / zero prod-runtime exposure):** `promptfoo` is adversarial-eval tooling run
**scheduled / by-label** (the `test:adversarial*` npm scripts), **never on the per-PR `verify:baseline` gate** (D-09 —
`verify:baseline` = vitest + deno + Playwright only; promptfoo calls the real Anthropic-backed endpoint and is off-gate per
`TESTING-STRATEGY.md`), and **never in the shipped frontend bundle** (it is a devDependency; `vite build` does not include it).
None of these 20 packages is reachable from any production runtime path. The clearance criterion for the whole subtree is a
**future promptfoo-major bump** (a separate scheduled task) that re-vendors its transitive tree past these advisories without
introducing a worse one — out of scope for v4.0 zero-functional-change dependency hygiene.

| Package | Severity | Advisory(s) | Subtree (dev-only) | Accept rationale | Clearance criterion |
| ------- | -------- | ----------- | ------------------ | ---------------- | ------------------- |
| axios | HIGH | GHSA-pjwm-pj3p-43mv, GHSA-hfxv-24rg-xrqf, GHSA-777c-7fjr-54vf, GHSA-p92q-9vqr-4j8v, GHSA-j5f8-grm9-p9fc, GHSA-35jp-ww65-95wh, GHSA-898c-q2cr-xwhg, GHSA-654m-c8p4-x5fp | ibm-cloud-sdk-core ← promptfoo | dev/test-only adversarial-eval tooling; OFF verify:baseline (D-09); zero prod-runtime exposure; not in shipped bundle | future promptfoo-major bump that clears the subtree (separate scheduled task) |
| ibm-cloud-sdk-core | HIGH | (via axios + form-data; transitive) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| form-data | HIGH | GHSA-hmw2-7cc7-3qxx | ibm-cloud-sdk-core ← promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| hono | HIGH | GHSA-wwfh-h76j-fc44, GHSA-j6c9-x7qj-28xf, GHSA-88fw-hqm2-52qc, GHSA-rv63-4mwf-qqc2, GHSA-wgpf-jwqj-8h8p | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| protobufjs | HIGH | GHSA-f38q-mgvj-vph7, GHSA-wcpc-wj8m-hjx6, GHSA-94rc-8x27-4472 | promptfoo | dev-only; off-gate (D-09); zero prod exposure. (NOTE: promptfoo@0.120.19 was MEASURED and would ESCALATE this to CRITICAL — discarded; staying on 0.120.13 keeps protobufjs at HIGH.) | future promptfoo-major bump that does NOT escalate protobufjs |
| undici | HIGH | GHSA-vmh5-mc38-953g, GHSA-pr7r-676h-xcf6, GHSA-p88m-4jfj-68fv, GHSA-vxpw-j846-p89q, GHSA-hm92-r4w5-c3mj, GHSA-35p6-xmwp-9g52, GHSA-g8m3-5g58-fq7m | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| @opentelemetry/core | MODERATE | GHSA-8988-4f7v-96qf (W3C Baggage unbounded alloc) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| @opentelemetry/exporter-trace-otlp-http | MODERATE | (via @opentelemetry/core; transitive GHSA-8988-4f7v-96qf) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| @opentelemetry/otlp-exporter-base | MODERATE | (via @opentelemetry/core; transitive) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| @opentelemetry/otlp-transformer | MODERATE | (via @opentelemetry/core; transitive) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| @opentelemetry/resources | MODERATE | (via @opentelemetry/core; transitive) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| @opentelemetry/sdk-logs | MODERATE | (via @opentelemetry/core; transitive) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| @opentelemetry/sdk-metrics | MODERATE | (via @opentelemetry/core; transitive) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| @opentelemetry/sdk-trace-base | MODERATE | (via @opentelemetry/core; transitive) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| @opentelemetry/sdk-trace-node | MODERATE | (via @opentelemetry/core; transitive) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| js-yaml | MODERATE | GHSA-h67p-54hq-rp68 (merge-key DoS) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| @azure/msal-node | MODERATE | (via-chain; would clear on a promptfoo bump) | promptfoo | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| uuid | MODERATE | GHSA-w5hq-g745-h8pq | promptfoo (← @azure/msal-node) | dev-only; off-gate (D-09); zero prod exposure | future promptfoo-major bump |
| promptfoo | MODERATE | (root dev tool; via its own subtree) | (root devDependency) | dev/test-only adversarial-eval tool; OFF verify:baseline (D-09); never in shipped bundle | future promptfoo-major bump |
| esbuild | **LOW** | GHSA-g7r4-m6w7-qqqr (Win dev-server file read) | tsx ← promptfoo | dev-only; off-gate (D-09); zero prod exposure; severity dropped HIGH→LOW vs the 06-RESEARCH snapshot | future promptfoo-major bump (or a tsx/esbuild devDep bump) |

> **Audit-surface snapshot (Plan 06-05, ws-override HEAD `3b887498`):** `1 low / 13 moderate / 6 high / 0 critical = 20`,
> down from the 06-04-HEAD `1 low / 14 moderate / 17 high = 32` (the vite + react-router-dom + ws fixes cleared the 3
> direct/production advisories + the ws cascade). **All 20 remaining are the dev-only promptfoo subtree above** — auditable,
> not hidden; no production-runtime exposure; no secret value recorded (advisory IDs only). Cross-references the
> `accepted-risk` rows in [`../phases/06-dependency-hygiene/06-DEP-CHANGES.md`](../phases/06-dependency-hygiene/06-DEP-CHANGES.md).

---

## DEP-05 Deferred — Deno Edge Consolidation (Phase 06, D-04)

**Appended by:** Plan 06-06 (Wave 4 — DEP-05 lockfile reconcile + reproducibility proof, 2026-06-20). Append-only;
no prior entry edited. This is a **documented/gated** finding — NOT planned or executed this phase.

The DEP-05 core (lockfile reconcile + reproducible install) was completed in Plan 06-06: the root `deno.lock` was
regenerated via `deno install --lockfile-only` to mirror the final `package.json`, `package-lock.json` was confirmed
already in sync (`npm install` reported "up to date"), and reproducibility was proven by a clean
`rm -rf node_modules && npm ci` (exit 0 — it hard-fails if `package.json`/`package-lock.json` are out of sync) plus a
clean-install deterministic gate (build 0 / vitest 457 / deno 699/0/11) and a Playwright confirm of only the 1 known
env-red. Per **D-04**, the broader **Deno edge consolidation across the 27+ live edge functions is DEFERRED** (documented
here, not taken) — it is a maintainability/currency win, not a DEP-05 reproducibility requirement.

### What is deferred (the edge std/zod consolidation surface)

| Item | Current drifted state (recorded 03-03 / 06-RESEARCH) | What a consolidation would do |
| ---- | --------------------------------------------------- | ----------------------------- |
| **Deno `std` version unification** | Production pins split across **`std@0.168.0` ×27** functions / **`std@0.190.0` ×4** / **`std@0.224.0` ×2**; tests add **`std@0.208.0`** (a 4+-minor spread of `https://deno.land/std@<ver>/` HTTP-server + crypto imports) | Unify the 27+ live functions onto a single `std` minor (and the test surface alongside). |
| **`zod` import-style normalization** | Split import style across functions — **`https://esm.sh/zod@3.25.76`** (CDN/ESM style) vs **`npm:zod@3.25`** (npm-spec style) for the same logical dependency | Normalize all edge functions to one `zod` import style. |
| **Optional central `deno.json` import map** | Each function inlines its own absolute specifiers; there is no shared edge import map | Introduce a central `deno.json` import map so specifiers are declared once. |

> The **edge `supabase/functions/deno.lock` stays ABSENT by design** (`supabase/functions/deno.json` has
> `"lock": false`, `"imports": {}`). DEP-05 regenerates only the **root** `deno.lock` + `package-lock.json`. No edge
> lock is created or touched by this phase.

### Why DEFERRED (record verbatim-equivalent rationale, D-04)

Offline `deno test:ci` runs with **`--no-check`** and therefore **does not exercise an `http/server` API change** — so
a green offline gate is **not** proof that a `std`/`zod` bump is behavior-safe on the edge. The only real proof a Deno
dependency change is safe is to **deploy each of the 27+ live payment / AI / webhook functions to staging and smoke
them** individually (per-function staging deploy-smoke). That blast radius — touching business-critical payment, AI, and
webhook paths simultaneously for a *currency/style* win — is **out of proportion** to the benefit and conflicts head-on
with the zero-functional-change governing constraint. This work sits **closer to Phase 9 (maintainability)** than to the
DEP-05 lockfile-reproducibility goal, and is best done as a dedicated, gated edge-consolidation task.

### Clearance criterion

A **dedicated edge-consolidation task** that (a) unifies the `std` pins + normalizes the `zod` import style (and
optionally introduces the central `deno.json` import map) across the 27+ live edge functions, and (b) validates each
changed function via a **per-function staging deploy-smoke** of the live payment/AI/webhook path — not just the offline
`--no-check` gate — plus a green `verify:baseline`. Until then the edge surface stays on its current (working, shipped)
mixed pins, and the edge `deno.lock` stays absent. Cross-references the (now-`taken`) DEP-05 row in
[`../phases/06-dependency-hygiene/06-DEP-CHANGES.md`](../phases/06-dependency-hygiene/06-DEP-CHANGES.md).

---

## ENV-02 Operator Un-Set List (Phase 07, D-04 — names only, operator-confirmed)

**Appended by:** Plan 07-01 (ENV-02 doc/code side, 2026-06-20). Append-only; no prior entry edited.

ENV-02's net **code diff is ZERO** — Phase 4 (04-04, commit `48e583f`) already deleted the only
code-dead env *reads* (the 5 `OLLAMA_*` via the `ollama-client.ts` deletion). The edge literal
`Deno.env.get` distinct-name count is **52** at HEAD (was 57 pre-Phase-4; the delta is exactly the 5
`OLLAMA_*`). ENV-02 here is therefore **reference-exclusion** (the names below are excluded from
`.env.example` + `docs/ENVIRONMENT.md`) **plus this operator un-set list**. We never write live secret
stores (prod is MCP read-only; the secrets store is not MCP-reachable) — actual store cleanup is an
operator action, names only.

### Orphaned-on-doubt — operator un-set candidates (names only)

| Name | Code state at HEAD | Live-store state | Operator action |
| ---- | ------------------ | ---------------- | --------------- |
| `OLLAMA_BASE_URL` | code-dead (post-Phase-4) | prod `zjpjapgraoxdukdvpjes` = UNSET (operator-confirmed Phase 4) | confirm preview/test `cimjltzovkahkqecpwgi` has no `OLLAMA_*`; un-set if present |
| `OLLAMA_MODEL` | code-dead | (verify on both refs) | un-set if present |
| `OLLAMA_AUTH_HEADER_NAME` | code-dead | (verify on both refs) | un-set if present |
| `OLLAMA_AUTH_SECRET` | code-dead | (verify on both refs) | un-set if present |
| `OLLAMA_TIMEOUT_MS` | code-dead | (verify on both refs) | un-set if present |

> **Clearance criterion:** the operator runs `supabase secrets list` against **both** the prod ref
> `zjpjapgraoxdukdvpjes` (already confirmed no `OLLAMA_*` in Phase 4) **and** the preview/test ref
> `cimjltzovkahkqecpwgi`, and un-sets any `OLLAMA_*` found. Names only — no value recorded.

> **Placeholder for ENV-04 (Plan 07-03):** any additional orphaned name surfaced by the ENV-04
> cross-surface audit (a live-store name with no code/CI consumer — e.g. `RAPIDAPI_KEY` if set
> anywhere) **appends to this same un-set list**, names only. `RAPIDAPI_KEY` itself is a doc-ghost
> (zero code consumers; never a real secret) and is a doc-cleanup item (NFR-03), not an un-set item
> unless the ENV-04 audit finds it actually set in a live store.

### ENV-04 (Plan 07-03) live-pass additions (2026-06-23, names only)

**Appended by:** Plan 07-03 (ENV-04 cross-surface separation audit) after the operator ran the four
names-only listings (Supabase prod/preview, GitHub Actions, Vercel). These are the orphaned / misplaced
live-store names the reconciliation surfaced. Names only — no value recorded. Cross-ref
`.planning/audit/ENV-SEPARATION.md` Section 5 operator fix list.

| Name | Live-store surface | Class | Operator action |
| ---- | ------------------ | ----- | --------------- |
| `AI_TEST_MODE` | prod `zjpjapgraoxdukdvpjes` | misplaced (test seam on prod) | verify value != `'true'` first (read by `_shared/anthropic.ts`; `'true'` stubs all AI), then un-set from prod |
| `GOOGLE_GEMINI_API_KEY` | prod `zjpjapgraoxdukdvpjes` | orphaned | zero code consumer (no Gemini integration); confirm no out-of-repo consumer, then un-set |
| `AI_PROVIDER` | prod `zjpjapgraoxdukdvpjes` | orphaned | zero code consumer (no provider-switch read); confirm, then un-set |
| `SERVICE_ROLE_KEY` (bare) | preview `cimjltzovkahkqecpwgi` | orphaned / redundant | un-set pending remote-deno-test-harness confirm (edge reads `SUPABASE_SERVICE_ROLE_KEY`, already present) |

**Vercel (Production) integration-injected prune (operator action, not an edge un-set):** the
Supabase->Vercel integration auto-injected ~16 unprefixed/`NEXT_PUBLIC_` names into the Vercel
Production env store —
`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` / `SUPABASE_JWT_SECRET` / `POSTGRES_*`
(`POSTGRES_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` / `POSTGRES_USER` / `POSTGRES_HOST` /
`POSTGRES_PASSWORD` / `POSTGRES_DATABASE`) / `NEXT_PUBLIC_SUPABASE_*` / unprefixed `SUPABASE_URL` /
`SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`. The Vite SPA reads ONLY the four `VITE_*` names, and Vite
does NOT bundle unprefixed vars, so these are **NOT browser-exposed** — the finding is blast-radius, not
active client exposure. Remove them from the Vercel frontend host (or disable the integration's env sync),
keeping only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_STRIPE_PUBLISHABLE_KEY` /
`VITE_FEATURE_INTERVIEW_PREP`.

> **Clean confirmations (ENV-04):** `OLLAMA_*` (x5) and `RAPIDAPI_KEY` are **absent on ALL four surfaces**
> (prod + preview Supabase, GitHub Actions, Vercel) — the Phase-4 prod-unset holds and no live-store
> residue exists; `RAPIDAPI_KEY` stays a doc-cleanup item (NFR-03 / 07-04), not an un-set item. No
> cross-environment leakage: no prod-live secret in any test/CI/preview surface; GitHub Actions = exactly
> the 5 TEST-project gate secrets.

> **RESOLVED — operator remediation pass (2026-06-23):** the operator un-set all four names above
> (`AI_TEST_MODE`, `GOOGLE_GEMINI_API_KEY`, `AI_PROVIDER` from prod; bare `SERVICE_ROLE_KEY` from preview)
> AND pruned the Vercel integration-injected cluster to the four `VITE_*` names (adding
> `VITE_FEATURE_INTERVIEW_PREP` to Vercel Preview — missing-required gap closed). Also un-set the
> preview-only merit config (`MERIT_SYSTEM_ENABLED` + `STRIPE_PRICE_MERIT_3/10/25/50` — behavior-neutral,
> the gate already ran the false/legacy path) and the prod `PADDLE_WEBHOOK_SECRET` (Paddle remnant —
> confirm in-flight subs expired, since `paddle-webhook` now fail-closes). `STRIPE_PRICE_PRO_*`/`PAID_*`
> confirmed intentionally absent (Free + Elite only, no Pro). Re-listing all four surfaces shows a clean,
> well-separated topology. Full delta + resolution table: `.planning/audit/ENV-SEPARATION.md` Section 6.

## ENV-05 Central Required-Env Assertion Helper — Deferred (Phase 07, D-08 / `<deferred>`)

**Appended by:** Plan 07-01 (2026-06-20). Append-only; no prior entry edited.

A central startup fail-closed helper (`assertRequiredEnv()` / `getRequiredEnv()` in `_shared`, wired
into all 27+ live edge functions) is a genuine maintainability candidate but is **DEFERRED on
blast-radius grounds**. Today each critical secret already fails closed via its own per-function guard
(`APP_URL` in `_shared/cors.ts`; `ANTHROPIC_API_KEY` in `_shared/anthropic.ts`;
`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL` in `_shared/supabase-client.ts`; `STRIPE_SECRET_KEY` in
`_shared/stripe-client.ts`; `STRIPE_WEBHOOK_SECRET` in `stripe-webhook-handler`; `INTERNAL_JOB_SECRET`
in `_shared/auth.ts`), so a central helper is a refactor, not a missing-guard fix.

| Item | Current state | Why deferred | Clearance criterion |
| ---- | ------------- | ------------ | ------------------- |
| Central `assertRequiredEnv()` / `getRequiredEnv()` helper | Each function fails closed via its own `if (!x) throw/return` guard | Wiring one helper into 27+ business-critical payment/AI/webhook functions is a blast-radius change; offline `--no-check` cannot prove an edge change safe (Phase 4/6 lesson) — each function would need a staging deploy-smoke; conflicts with zero-functional-change | A dedicated edge task that introduces the helper and validates each touched function via a per-function staging deploy-smoke + a green `verify:baseline`. Phase-9-adjacent (maintainability). |

## Phase 07.1 - Runtime Reliability Residuals (RUN-07 / D-06, 2026-06-23)

### R-02 - Deferred live deploy-smoke for the 7.1-touched edge functions (RUN-07 / D-06)

| Field | Value |
| ----- | ----- |
| **Touched function(s)** | `interview-prep-analyze`, `recruiting-lens`, `compare-jobs` (all three landed at the Plan 07.1-03 RUN-04 operator checkpoints; commits `6d4ab14d` / `cd095a15` / `aba65395`) |
| **Discovered by** | Phase 07.1 (RUN-07), 2026-06-23 |
| **Residual signal (why it did NOT clear)** | The preview/test project `cimjltzovkahkqecpwgi` (preview = staging = test) is PAUSED, so offline `--no-check` cannot exercise the deployed HTTP/server path. Same paused-project root cause as **DI-06-05-01** (Phase 06). |
| **Smoke to run when cleared** | Deploy each touched function to preview; invoke each with a missing/invalid `Authorization` header and assert the response is **401 `{error:'Unauthorized'}`** (the propagated thrown Response), NOT a swallowed 500. Confirm a valid request still succeeds (success path byte-identical). |
| **Clearance criterion** | preview/test project `cimjltzovkahkqecpwgi` un-paused -> run the per-function bad-token -> 401 deploy-smoke; all three return 401 and their success paths are unchanged. |
| **Status** | **DEFERRED** - the offline `test:edge` gate (704-0-11, incl. the new in-gate guard tests) + the byte-identical-success-path scoped diff carry the per-change proof; the live deploy-smoke is the deferred confirmation. |

### R-03 - Pre-existing vitest failure: `AnalysisHistory.interviewPrep.test.tsx` (NOT 7.1-03)

| Field | Value |
| ----- | ----- |
| **File** | `src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx` (2 cases) |
| **Discovered by** | Phase 07.1 (RUN-07 baseline re-run), 2026-06-23 |
| **Residual signal** | The two cases assert `getByText(/career compass/i)` / `getByText(/interview prep/i)` synchronously after a single `waitFor(/resume analysis/i)` - a frontend async-render race. They fail at HEAD; `git diff <phase-start e785da10>..HEAD -- src` is EMPTY (zero frontend change this phase); they fail in isolation; an edge-function change cannot affect a React component test. PRE-EXISTING (flaky / baseline drift), NOT caused by 7.1-03. |
| **Clearance criterion** | Stabilize the test (await each item via `findByText`/`waitFor`) or quarantine it per TESTING-STRATEGY.md; restore vitest to 457 green. |
| **Status** | **DEFERRED** - documented pre-existing; out of 7.1 runtime-reliability scope (frontend test, not an edge reliability finding). Recommended follow-up. |

### R-04 - Inside-`serve`-arrow `throw error` auth guards may not propagate 401 (follow-up)

| Field | Value |
| ----- | ----- |
| **Site(s)** | `analyze-skills-gap/index.ts:287` (the research-cited analog) and any other edge function using `if (error instanceof Response) throw error;` INSIDE a `serve(async (req)=>{...})` arrow rather than a named handler. |
| **Discovered by** | Phase 07.1 (07.1-03), 2026-06-23 |
| **Residual signal** | 07.1-03 verified that a thrown Response from a NAMED handler propagates as an exception; `std@0.168.0` serve MAY route a thrown Response through `onError` to a 500 (unverified at runtime here). If so, inside-`serve`-arrow `throw error` guards are ineffective (same SB-05-04 swallow class). The three 7.1 fixed sites all use the named-handler `return` idiom and are provably correct. |
| **Clearance criterion** | Verify the auth-failure status of each inside-`serve`-arrow guard at runtime; convert to the named-handler `return` idiom where it 500s. |
| **Status** | **DEFERRED / needs-operator** - OUT of 7.1's three named swallow sites; fixing would be scope creep needing its own operator checkpoint. Cross-ref `RUNTIME-RELIABILITY.md` Platform / non-code findings. |

> **Notes (Phase 07.1):** (1) the Playwright `stripe :56` documented env-red is the SAME `cimjltzovkahkqecpwgi` pause as R-02 / DI-06-05-01 - the established baseline state, not a new red. (2) The recruiting-lens runtime auth-rethrow test was moved OFF the `test:ci` gate (operator decision 2026-06-23) due to a pre-existing shared-process test-isolation fragility; in-gate coverage is the static source-string assertion in `recruiting-lens/handler-config.test.ts`. See `RUNTIME-RELIABILITY.md` "Plan 07.1-03 disposition + deviations".

---

## Phase 08 - Database Cleanup & Migrations Residuals (DB-04 gated, 2026-06-24)

**Appended by:** Plan 08-01 (DB-01 prod re-pull + DB-04 gated disposition). Append-only; no prior
entry edited. Source evidence: the 2026-06-24 read-only prod re-pull in
[`queries/db-introspection-results.md`](./queries/db-introspection-results.md) (canonical prod
`zjpjapgraoxdukdvpjes`) + the DB-02 reconciliation block in [`DATABASE.md`](./DATABASE.md). NO DDL,
NO `src/**`/`supabase/functions/**` edit (the two FE call sites below stay BYTE-IDENTICAL, D-06).

### R-DB-04 - `usage_tracking` table + `can_perform_ai_action` RPC cluster (GATED, DB-04)

| Field | Value |
| ----- | ----- |
| **Structure** | `public.usage_tracking` table + the `can_perform_ai_action` RPC cluster (the legacy credit/usage gate: `can_perform_ai_action`, `check_and_record_ai_usage`, `get_usage_limit`, `get_user_usage`, `get_user_usage_breakdown`, `admin_set_user_credits` — all tied to the legacy `usage_tracking` system). |
| **Discovered by** | Plan 03-05 (DB-02, `DATABASE.md`); re-confirmed against true prod by Plan 08-01 (D-01 re-pull), 2026-06-24. |
| **Audit verdict (origin)** | `DATABASE.md` DB-02 -> **`needs-investigation` (heavily live)**. The Phase-3 "294 rows / 3295 idx_scan" reading was PREVIEW-sourced; the 2026-06-24 canonical-prod re-pull shows **4 rows, n_tup_ins 4, idx_scan 54 — still actively written**. Low count = low total traffic on a 1-user prod (D-11), NOT disuse. Verdict UNCHANGED: GATED. |
| **Residual signal (why it did NOT clear)** | **TWO live frontend `can_perform_ai_action` RPC call sites** — `src/components/Navbar.tsx:109` and `src/pages/SkillsGapAnalysis.tsx:108` (both `supabase.rpc('can_perform_ai_action', { p_user_id })`) — **PLUS 7+ live writers** of `usage_tracking` via `record_ai_usage` (TWO overloads: 4-arg incl `p_analysis_id` + 3-arg) / `check_and_record_ai_usage`. The 2026-06-24 prod stats (4 rows, still inserting; `can_perform_ai_action` is a live `authenticated`-EXECUTE SECURITY DEFINER RPC) confirm the cluster is live, not dormant. |
| **Why deferred (D-06)** | Editing live paywall-gate code is a **functional-change risk** — out of the v4.0 zero-functional-change constraint. The paywall hooks `usePaywallGuard` / `useTierAccess` already MIGRATED OFF `can_perform_ai_action` (their tests assert a NEGATIVE: `usePaywallGuard.test.tsx:243`, `useTierAccess.test.tsx:235` "never invokes `can_perform_ai_action`"), but the two page-level call sites above remain. The RPC + table can be retired ONLY if **fully migrated AND unreferenced**. |
| **Clearance criterion** | (1) Migrate the two FE call sites off `can_perform_ai_action` (to `usePaywallGuard` / `useTierAccess`, matching the already-migrated hooks); (2) retire the 7+ `usage_tracking` writers (`record_ai_usage` x2 overloads + `check_and_record_ai_usage` + the credit/usage RPC cluster); THEN the `can_perform_ai_action` RPC + the `usage_tracking` table can be dropped (forward+rollback) in a follow-up. This FE migration is itself functional-change work, OUTSIDE the zero-change envelope. |
| **Status** | **GATED / backlog** — documented, NO live-code surgery this phase. `git diff -- src/components/Navbar.tsx src/pages/SkillsGapAnalysis.tsx` is EMPTY (byte-identical, D-06). Cross-ref `DATABASE.md` usage_tracking dual read/write call map + the Phase-8 DB-02 reconciliation block. |

### DB-1-cron - prod cron jobs invoke the PREVIEW functions host (needs-operator, NOT a Phase-8 DDL target)

| Field | Value |
| ----- | ----- |
| **Finding** | On canonical prod `zjpjapgraoxdukdvpjes`, two `cron.job` `net.http_post` URLs are hardcoded to the **PREVIEW** project's functions host `https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/...`: job 1 `keep-warm-ping` (-> `/keep-warm`) and job 6 `extract_catchup_nightly` (-> `/extract-analysis-structure`). Job 5 `reset-subscription-merits-sweep` uses `current_setting('app.functions_base_url', true)` (GUC) instead. |
| **Discovered by** | Plan 08-01 D-01 prod re-pull (Section 6 cron-host check), 2026-06-24. |
| **Why it is a finding** | Prod cron jobs invoking PREVIEW edge functions is a prod-config drift (the keep-warm + extract-catchup sweeps hit the wrong project). It is NOT a user-facing leak and NOT a DB-03..06 DDL target. |
| **Why NOT a Phase-8 migration** | This is a cron/config fix (operator re-points the URLs to the prod functions host or the GUC), not a public-schema DDL change. Per CONTEXT Claude's-Discretion (document-and-route, like LOG-1) it is surfaced, not migrated. |
| **Status** | **needs-operator** — operator re-points jobs 1 & 6 to the prod functions host (or the `app.functions_base_url` GUC). No Phase-8 migration authored. |

---

## Phase 08-05 - EXECUTE-grant GATED set + Phase-9-routed advisories + document-and-route (2026-06-25)

**Appended by:** Plan 08-05 (the LAST DB-05 wave — the x60 `_security_definer_function_executable`
EXECUTE-grant read-map + the perf-class routing + the phase close-out). Append-only; no prior entry
edited. Source: the per-function read-map in
[`RUNTIME-RELIABILITY.md`](./RUNTIME-RELIABILITY.md) "DB-05 Plan 08-05 EXECUTE-grant read-map" +
[`queries/db-introspection-results.md`](./queries/db-introspection-results.md) DB-05 advisor sets.
NO `src/**`/`supabase/functions/**` edit (D-06).

### R-DB-05 - SECURITY DEFINER RPCs whose `authenticated` EXECUTE STAYS (load-bearing / RLS-context, GATED)

| Field | Value |
| ----- | ----- |
| **Structures** | 11 SECURITY DEFINER public RPCs whose `authenticated` EXECUTE is KEPT (NOT revoked): `can_perform_ai_action(uuid)`, `has_role(uuid, app_role)`, `record_feature_usage(text, text)`, `record_recommendations_shown(uuid[])`, `get_merit_balance(uuid)`, `admin_upgrade_user(uuid, text, uuid)`, `admin_set_user_merits(uuid, integer)`, `get_admin_usage_stats()`, `get_pending_upgrade_requests()`, `get_user_usage_breakdown(uuid)`, `auth_owns_version(uuid, text)`. |
| **Discovered by** | Plan 08-05 read-map (`rg "\.rpc\('<fn>'" src supabase/functions`), 2026-06-25. |
| **Audit verdict (origin)** | `authenticated_security_definer_function_executable` [WARN] x30 (the authenticated half of the x60). 19 of the 30 are revoked (`20260608000011_*`); these 11 are GATED. |
| **Residual signal (why authenticated EXECUTE did NOT clear)** | **10 are live frontend RPCs** invoked by the user's authenticated supabase client (anon/publishable client, post-auth): `can_perform_ai_action` (`Navbar.tsx:109`, `SkillsGapAnalysis.tsx:108` — the HEADLINE: revoking authenticated EXECUTE breaks the navbar credit display + the skills-gap entitlement check), `has_role` (`AdminUsage.tsx:78`, `Dashboard.tsx:220`), `record_feature_usage` (`useFeatureUsage.ts:31`), `record_recommendations_shown` (`CareerCompass.tsx:469`, `LinkedInGrader.tsx:192`, `RecruitingLens.tsx:543`, `Results.tsx:320`), `get_merit_balance` (`useMerits.ts:59`), `admin_upgrade_user` / `admin_set_user_merits` / `get_admin_usage_stats` / `get_pending_upgrade_requests` / `get_user_usage_breakdown` (`AdminUsage.tsx:112/222/101/102/193`). The **11th**, `auth_owns_version`, is evaluated inside an RLS `USING (public.auth_owns_version(...))` clause in the authenticated caller's context — conservative KEEP (its anon EXECUTE is still revoked; it already carries `REVOKE ALL FROM PUBLIC` + `GRANT TO authenticated` in `20260525000002`). |
| **Why deferred (D-03 / Pitfall 5)** | The dominant risk of this wave is the INVERSE of over-permissiveness: revoking a LIVE caller's grant breaks the feature. The bar is "revoke ONLY where a live caller is provably absent." For these 11 a live (or RLS-context) authenticated caller is PRESENT, so authenticated EXECUTE is load-bearing and KEPT. The companion anon revoke (`20260608000010_*`) still removes anon EXECUTE on these (anon never reaches an auth-gated page). |
| **Clearance criterion** | For the 10 FE-called RPCs: clearing the authenticated EXECUTE warning requires migrating the FE off the RPC (e.g. `can_perform_ai_action` -> `usePaywallGuard`/`useTierAccess`, cross-ref R-DB-04) — functional-change work OUTSIDE the zero-change envelope. For `auth_owns_version`: a longer-observation confirmation that no authenticated path other than the RLS `USING()` evaluation needs the grant, then a scoped revoke. Both are backlog. |
| **Status** | **GATED / backlog** — these 11 authenticated EXECUTE grants are INTENTIONALLY retained and documented. The advisor `authenticated_security_definer_function_executable` count remains at the KEPT-count (11) after the 08-05 revokes; this is the documented-intentional residual. `can_perform_ai_action` authenticated EXECUTE is NEVER revoked. |

### Phase-9-routed advisories (perf-class / index / storage / always-true — DOCUMENTED, NOT applied)

**Appended by Plan 08-05 (D-02 — security-only appetite; these are out-of-scope for Phase 8 and routed to Phase 9 / backlog).** Names + counts only; NO migration authored for any of these in Phase 8.

| Advisory | Class | Affected objects (names only) | Why deferred | Clearance phase |
| -------- | ----- | ----------------------------- | ------------ | --------------- |
| `auth_rls_initplan` x62 | PERFORMANCE | 29 tables — `auth.uid()` / `auth.<fn>()` re-evaluated per-row in RLS quals | Perf-class (wrap `auth.<fn>()` in a scalar subselect `(select auth.uid())`); behavior-neutral but out of the security-only D-02 appetite; reversible | **Phase 9** (Performance & Maintainability) |
| `multiple_permissive_policies` x48 | PERFORMANCE | improvement_checklist, linkedin_grades, resumes, upgrade_requests, user_roles (overlapping permissive policies per role/cmd) | Perf-class (consolidate overlapping policies); the linkedin_grades entry already shrank 2->1 SELECT via 08-04; the rest are perf-only | **Phase 9** |
| `unindexed_foreign_keys` x8 | PERFORMANCE (INFO) | 8 FK columns lacking a covering index | Index hygiene; reversible `CREATE INDEX`/`DROP INDEX`; longer-observation; out of security scope | **Phase 9** |
| `unused_index` x41 | PERFORMANCE (INFO) | 41 public indexes with `idx_scan = 0` | **D-11 caveat: idx_scan=0 on a 1-user prod is LOW TRAFFIC, NOT disuse** — NOT a removal target on this evidence; needs a real-traffic observation window | **Phase 9** (longer-observation) |
| `public_bucket_allows_listing` x1 | SECURITY (WARN) | storage bucket `public-assets` (anon listing) | Storage config (not a public-schema DDL migration); confirm intended-public vs restrict | **operator / Phase 9** |
| `rls_policy_always_true` x2 | SECURITY (WARN) | `paddle_webhook_events` ("Service role can manage webhook events"), `scheduled_emails` ("Service role can manage all scheduled emails") — both ALL, role public, USING(true)/WITH CHECK(true) | Service-role management tables BY DESIGN (not user-facing leaks); `paddle_webhook_events` is a gated Paddle remnant (KEEP-LIST Class 2). Documented, not tightened this phase | **backlog / Phase 9** (paddle remnant gated on last in-flight sub) |
| `auth_leaked_password_protection` x1 | SECURITY (WARN) | Auth (GoTrue) leaked-password protection disabled | Non-DB; HaveIBeenPwned check requires a **paid Supabase Auth tier** — project on **free tier** (operator-confirmed 2026-07-02), cannot enable | **ACCEPTED RESIDUAL** (accepted-with-justification; clearance = enable on upgrade to a paid Auth tier) |

### Document-and-route (non-DB-migration items — operator/cron-config + edge-function orphans)

**Appended by Plan 08-05 (CONTEXT Claude's-Discretion — surfaced, NOT treated as DB migrations).**

| Item | Class | Disposition |
| ---- | ----- | ----------- |
| `http_request_queue` NULL-url recurring cron ERROR (LOG-1) | cron/config (operator) | **needs-operator / cron-config fix** — a recurring postgres-log ERROR from a cron `net.http_post` with a NULL url; operator fixes the cron job definition. NOT a DB-03..06 DDL target. (Cross-ref RUNTIME-RELIABILITY.md LOG-1.) |
| prod cron jobs 1 (`keep-warm-ping`) + 6 (`extract_catchup_nightly`) -> PREVIEW functions host | cron/config (operator) | **needs-operator** — re-point off the `cimjltzovkahkqecpwgi` preview host (see DB-1-cron row above). NOT a Phase-8 migration. |
| `analyze-career-v2` (stale v9) + `chat-agent` deploy-drift function orphans | edge functions (Phase 4 CLEAN-03) | **document-and-route** — these are EDGE FUNCTIONS, not DB structures; routed to Phase 4 CLEAN-03 (deploy-list cleanup). NOT a Phase-8 DB migration. (Cross-ref `db-introspection-results.md` superseded-block.) |

---

## Cross-References

- **[`DEAD-CODE.md`](./DEAD-CODE.md)** — origin catalog (R-01 = the `MinimalHero.tsx` `safe` row 2 there). The `safe` verdict is now corrected by this register: MinimalHero is a deferred residual, not a 04-01 removal.
- **[`KEEP-LIST.md`](./KEEP-LIST.md)** — Keep-Class 4 (dynamic / string-keyed references) is the class R-01 belongs to; the `readFileSync` string-path consumer is exactly the blind spot that class exists to catch.
- **Plan 04-01 SUMMARY** `.planning/phases/04-dead-code-refactor-cleanup/04-01-SUMMARY.md` — records the approved deviation (−4 actual vs −5 planned; MinimalHero deferred) and the green-before/green-after baseline evidence.

*This file records paths, classifications, signals, and rationale only — no secret value is pasted anywhere in it.*

---

## Phase 9 (Plan 09-03) -- DB perf-class outcome (PERF-02)

The Phase-8 "Phase 9" routing rows above are now dispositioned. Preview-applied + verified 2026-06-25; prod operator-gated (pending). Names-not-values.

| Advisory (Phase-8 routed) | Phase-9 disposition |
| ------------------------- | ------------------- |
| `auth_rls_initplan` x62 | **RESOLVED** -- `20260608000013_perf_auth_rls_initplan_wrap.sql` wraps `auth.uid()` -> `(select auth.uid())` (zero-observable; SELECT-as-role proven). Preview 62->0. |
| `unindexed_foreign_keys` x8 | **RESOLVED** -- `20260608000014_perf_unindexed_fk_indexes.sql` adds 8 covering indexes (additive; `DROP INDEX` rollback). Preview 8->0. |
| `multiple_permissive_policies` (x42 live) | **36 RESOLVED / 6 DEFERRED** -- `20260608000012_perf_dedup_permissive_policies.sql` drops the EXACT-DUPLICATE subset (improvement_checklist/resumes/user_roles). The 6 deferred are `upgrade_requests` SELECT (`Admins can view all` OR `Users can view their own`) across 6 roles -- a DIFFERENT-qual OR-merge that needs a DROP-both + CREATE-merged; deferred (higher-risk grant change, conservative per Phase-8 D-03). See "Phase-9 deferred" row below. |
| `unused_index` x41 | **DEFERRED (unchanged)** -- D-11: `idx_scan=0` on a low-traffic prod is NOT disuse. The 8 new additive FK indexes are now also "unused-until-scanned" (benign). No drops on this evidence; needs a real-traffic observation window. |
| `public_bucket_allows_listing` x1 | **DEFERRED / operator** -- storage bucket config (anon listing), not a public-schema DDL migration; confirm intended-public vs restrict. |
| `rls_policy_always_true` x2 | **DEFERRED (unchanged)** -- service-role-by-design (`scheduled_emails`); `paddle_webhook_events` gated on the last in-flight Paddle sub (KEEP-LIST Class 2). |
| `table_bloat` x1 (`net._http_response`) | **DEFERRED / out-of-scope** -- extension-owned (`net` schema) bloat; VACUUM/autovacuum maintenance, not a public-schema migration. |

**Phase-9 deferred (new):** `upgrade_requests` SELECT multiple_permissive OR-merge. Forward (if ever taken): `DROP POLICY "Admins can view all upgrade requests"` + `DROP POLICY "Users can view their own upgrade requests"` then `CREATE POLICY "View own or admin upgrade requests" ... FOR SELECT USING ((select auth.uid()) = user_id OR has_role((select auth.uid()),'admin'::app_role))`. Provably OR-equivalent but requires a CREATE; deferred to keep the zero-change set to DROP-of-superseded only. Reversible (re-create the two originals).

---

## Phase 2 — Security Audit & Remediation Residuals (SEC-15 closure, 2026-07-02)

**Appended by:** Plan 02-08 (the SEC-15 final security record + phase closure). Append-only; no prior entry
edited. Source: `.planning/phases/02-security-audit-remediation/SECURITY-RECORD.md` §6 + the three sweep docs
(`audit/CODE-EDGE-FINDINGS.md`, `audit/DB-BILLING-WEBHOOK-FINDINGS.md`,
`audit/ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md`). Per D-01 only `Low` becomes a tracked residual; every confirmed
`Critical/High/Medium` was remediated in-phase with a green in-gate guard (SECURITY-RECORD §4). Names-not-values.

### PENDING-OPERATOR (the ONE MEDIUM carried at Phase-2 closure — NOT resolved)

### SEC-02-08-CRON — prod cron jobs 1 & 6 → PREVIEW functions host (Phase-2-closure disposition of DB-1-cron)

| Field | Value |
| ----- | ----- |
| **Finding** | Domain-17 cron-host drift: prod cron jobs **1 `keep-warm-ping` (`*/5 * * * *`)** + **6 `extract_catchup_nightly` (`*/15 * * * *`)** `net.http_post` URLs target the PREVIEW functions host `https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/...`. (Same finding as §"Phase 08 → DB-1-cron"; re-confirmed live 2026-07-01 in `audit/ENV-SUPPLYCHAIN-ISOLATION-FINDINGS.md` §17b.) |
| **Discovered by** | Plan 08-01 (v4.0); LIVE-re-confirmed by Plan 02-04 read-only prod `cron.job` pull, 2026-07-01. |
| **Audit verdict (origin)** | Severity **MEDIUM** (impact Medium cross-env availability/dependency × exploit Moderate: a standing live misconfiguration, no external attacker vector). Above the D-01 Low threshold, but its remediation is a **live prod `cron.alter_job`/`UPDATE cron.job`** — Claude is read-only on prod, and it is a cron/config URL re-point, NOT a public-schema DDL / repo migration. |
| **Residual signal (why it did NOT clear in Phase 2)** | Remediation requires an operator-applied live-prod cron change; no repo artifact clears it. Phase 2 authored code + docs only (no DB/store mutation). |
| **Clearance criterion** | Operator re-points jobs 1 & 6 URL host `cimjltzovkahkqecpwgi.supabase.co` → `zjpjapgraoxdukdvpjes.supabase.co` (or an `app.functions_base_url` GUC) via live `cron.alter_job`; NO repo migration, NO DDL. |
| **Status** | **PENDING OPERATOR ACTION / open** — recorded MEDIUM with remediation defined; carried out of Phase 2, not marked resolved. |

### Low residuals (tracked, accepted with justification)

### SEC-07-low — 3 low-traffic AI ingesters not enrolled in the sanitizer

| Field | Value |
| ----- | ----- |
| **File** | `supabase/functions/analyze-skills-gap/index.ts`, `supabase/functions/compare-jobs/index.ts`, `supabase/functions/chat-agent/index.ts` |
| **Discovered by** | Plan 02-02 (SEC-07 coverage table, 3/8 covered at HEAD); final disposition Plan 02-07. |
| **Verdict** | **Low residual, NOT remediated** (D-01). The 02-07 remediation scopes the sanitizer + `_shared/sanitizer-coverage.test.ts` (`=== 5` length guard) to the high-traffic five. |
| **Residual signal** | Defense-in-depth prompt-injection gap on lower-traffic / more-tightly-bounded ingesters: each applies hard input slice caps (domain 6); `chat-agent` additionally forces `role:'user'` + a 2000-char per-message cap + forwards only the last message; robust system prompts + off-gate promptfoo cover the primary features. Impact Low × exploit Moderate → Low. |
| **Clearance criterion** | Enroll into `_shared/sanitizer-coverage.test.ts` (bump the `=== N` length guard) + add `sanitizeUserContent` before the Anthropic invoke, if/when any of the three moves to a high-traffic surface. |
| **Status** | **ACCEPTED (Low)** — resolves RESEARCH Open Question 2. |

### SEC-02-08-RUN03 — `error.message` echoed into client 500 bodies (~8 prod-active fns)

| Field | Value |
| ----- | ----- |
| **File** | `analyze-resume` (index.ts:1076 + SSE :822/:933), `analyze-career:1810`, `grade-linkedin:876`, `get-analysis-job-status:174`, `submit-resume-analysis-job:270`, `submit-career-analysis-job:262`, `analyze-skills-gap:290`, `notify-upgrade-request:120`, `test-email:180` |
| **Discovered by** | Plan 02-02 (the one NEW finding beyond the known set — Open Q5), 2026-07-01. |
| **Verdict** | **LOW-MEDIUM → Low residual.** Internal error text, NOT a secret/PII/cross-user datum (secrets are never in these strings); the RUN-03 taxonomy already retired the identical `compare-jobs` case. Not crit/high → no forced 02-05 split. |
| **Residual signal** | A client 500 body carries `error.message` (DB/implementation detail) instead of a generic reason code — a defense-in-depth info-leak class, live in ~8 functions. |
| **Clearance criterion** | Apply the RUN-03 generic-body pattern (reason code → structured log; generic `{ error }` to caller) to the remaining ~8 sites in a dedicated defense-in-depth pass. |
| **Status** | **ACCEPTED (Low)** — tracked for a follow-up error-message-safety consolidation. |

### SEC-02-08-INPUT — fixed-slice trio not on the shared `getMaxInputChars` helper

| Field | Value |
| ----- | ----- |
| **File** | `analyze-skills-gap`, `compare-jobs`, `chat-agent` (use `MAX_*_SIZE` / `MAX_MESSAGE_LENGTH` fixed slice caps) |
| **Discovered by** | Plan 02-02 (domain 6), 2026-07-01. |
| **Verdict** | **Low.** Every AI text-ingester bounds its input; the two forms (per-tier `getMaxInputChars` helper vs fixed slice) are a consistency difference, not a DoS gap. |
| **Residual signal** | Input-cap consistency: the trio does not route through the shared per-tier helper. |
| **Clearance criterion** | Route the fixed-slice trio onto `getMaxInputChars`. |
| **Status** | **ACCEPTED (Low)** — hardening/consistency item. |

### SEC-02-08-OCR — ocr-pdf content-type/max-bytes assertion at the boundary, not in document-extraction.ts

| Field | Value |
| ----- | ----- |
| **File** | `supabase/functions/ocr-pdf/index.ts` (the raw-upload boundary) vs `_shared/document-extraction.ts` |
| **Discovered by** | Plan 02-02 (domain 7), 2026-07-01. |
| **Verdict** | **Low.** No active exposure; parser-first `mistral→textract→claude_ocr` chain + tier-gating + downstream slice caps bound the blast radius. |
| **Residual signal** | The content-type / max-bytes assertion for the raw upload lives at the ocr-pdf boundary rather than centrally. |
| **Clearance criterion** | Confirm/relocate an explicit ocr-pdf size + content-type guard. |
| **Status** | **ACCEPTED (Low)** — hardening item. |

### SEC-02-08-ADVISORS — the 15 intentional security advisors (do-not-weaken floor)

| Field | Value |
| ----- | ----- |
| **Structures** | 11× `authenticated_security_definer_function_executable` (R-DB-05 load-bearing EXECUTE grants — cross-ref R-DB-05 above) + 2× `rls_policy_always_true` (`paddle_webhook_events`, `scheduled_emails` — service-role manage-by-design) + `public_bucket_allows_listing` (`public-assets`) + `auth_leaked_password_protection`. |
| **Discovered by** | Plan 02-03 operator-delegated read-only advisor pull (floor = 15, all WARN, all intentional, 0 NEW); AFTER-floor re-confirmed 15 → 15 by the Plan 02-08 delegated read-only pull. |
| **Verdict** | **Intentional (do-not-weaken), accepted.** Re-examined individually under D-04; each retained by-design (§6c of SECURITY-RECORD.md). The operator-toggle pair (`auth_leaked_password_protection`, `public-assets` listing) is operator-optional Low hardening. |
| **Residual signal** | The security-advisor floor holds at 15 (0 increase, 0 new) after all remediations — the SEC-14 do-not-weaken proof. |
| **Clearance criterion** | Per-item: the 10 FE-called EXECUTE grants clear only when the FE migrates off the RPC (cross-ref R-DB-04/R-DB-05, functional-change work); `auth_leaked_password_protection` + `public-assets` are one-action operator toggles; the 2 always-true policies clear with the Paddle-remnant / service-role redesign (Phase 8 / backlog). |
| **Status** | **ACCEPTED (intentional floor)** — do-not-weaken baseline, carried unchanged. |

### SEC-02-08-DEP — supply-chain currency residues (Phase-2 re-confirmation)

| Field | Value |
| ----- | ----- |
| **Structures** | (a) the 20-pkg dev-only `promptfoo` vuln residue (cross-ref §"DEP-04 Accepted-Risk Residue" above); (b) SEC-10 Deno `std` multi-version drift (`0.168.0`×27 / `0.190.0`×4 / `0.224.0`×2) + zod import-style (now single-style) (cross-ref §"DEP-05 Deferred"). |
| **Discovered by** | Plan 02-04 domain-16 re-pull (`npm run audit:deps` = 1 low / 13 mod / 6 high / 0 crit = 20, all promptfoo subtree), 2026-07-01. |
| **Verdict** | **Accepted (Low).** promptfoo residue is dev-only / OFF `verify:baseline` / not in the shipped bundle / zero prod-runtime exposure (a measured bump escalated protobufjs→CRITICAL, discarded). SEC-10 std/zod drift is `re-scoped/accepted` — currency, not a vuln. |
| **Residual signal** | Dev-tooling transitive advisories (off-gate) + edge std/zod version spread. |
| **Clearance criterion** | promptfoo: a future promptfoo-major bump that clears the subtree without a worse advisory. SEC-10: a dedicated edge-consolidation task with per-function staging deploy-smoke (DEP-05). |
| **Status** | **ACCEPTED (Low)** — re-confirmed at Phase-2 closure; both cross-referenced to their existing DEP-04/DEP-05 sections. |

### SEC-02-08-PERF — performance advisors (non-security; not part of the do-not-weaken floor)

| Field | Value |
| ----- | ----- |
| **Structures** | ~48× `unused_index` + `multiple_permissive_policies` on `upgrade_requests` SELECT (returned by the delegated advisor pull). |
| **Discovered by** | Plan 02-03 delegated read-only pull, 2026-07-01. |
| **Verdict** | **NOT a security finding.** Recorded so Phase-2 does not mistake them for a security delta: `unused_index` on a near-empty 1-user prod is D-11 low-traffic (≠ droppable); the `multiple_permissive` pair are both correct least-privilege (perf nudge, not over-exposure). |
| **Clearance criterion** | Dispositioned in Phase-9 DB-perf routing (§"Phase 9 (Plan 09-03)" above — most RESOLVED preview-side / prod operator-gated; `unused_index` deferred on D-11). |
| **Status** | **DEFERRED-PERF (non-security)** — out of the security floor. |

### Code-Review Remediation Wave — no NEW residuals (Plan 02-09, 2026-07-02)

**Appended by:** Plan 02-09 (the code-review gap-closure). After Phase-2's 8 plans + `verify:baseline` 4/4, the
required code-review gate (`02-REVIEW.md` R1 + `02-REVIEW-R2.md` R2) found the audit had under-scoped the
refund-after-save class and a latent IDOR, plus further hardening items. **All were REMEDIATED in-phase with
RED→GREEN guards (code + guards + docs only; ZERO DB changes; advisor floor 15 → 15 unchanged)** — see
`SECURITY-RECORD.md` §7 and `02-09-SUMMARY.md`. **No new residual is owed by the wave**, and the code-review-wave
low findings (**WR-03** merit-gateway `transaction_id` null-guard, **IN-01** paddle-webhook missing-signature body)
are **CLOSED / remediated, NOT residual**.

| Code-review-wave item | Severity | Disposition | Commit / guard |
| --------------------- | -------- | ----------- | -------------- |
| CR-01 / CR-02 refund-after-save extension (analyze-resume + analyze-career) | HIGH | **REMEDIATED** (log-and-continue) — not residual | `d7c9a521` / `dfe1591c` · refund-after-save.test.ts ×2 |
| IN-02 IDOR (analyze-resume `resumes.update` owner-scope) | HIGH | **REMEDIATED** (`.eq('user_id', …)`) — not residual | `d7c9a521` · refund-after-save.test.ts IN-02 assertion |
| WR-01 merit-gateway replay-refund suppression | MED | **REMEDIATED** — not residual | `4e03f39b` · merit-gateway.replay-refund.test.ts |
| WR-02 multi-role `roles` + `existingAnalysis.*` sanitize | MED | **REMEDIATED** — not residual | `ccb7691c` / `0dce0ed9` · sanitizer-coverage.test.ts (`minSanitizeCalls 6`) |
| WR-04 paddle-webhook PII/log hygiene | MED | **REMEDIATED** — not residual | `acd2bd73` / `b7b86e3b` · replay-window.test.ts |
| **WR-03** merit-gateway `transaction_id` null-guard | LOW-MED | **CLOSED (fixed, NOT residual)** | `4e03f39b` · merit-gateway.replay-refund.test.ts |
| **IN-01** paddle-webhook missing-signature generic body | LOW | **CLOSED (fixed, NOT residual)** | `acd2bd73` · replay-window.test.ts |

**Re-affirmed:** the ONE MEDIUM carried at Phase-2 closure — **SEC-02-08-CRON** (prod cron jobs 1 & 6 →
PREVIEW functions host) — is **STILL PENDING OPERATOR ACTION / open** (the code-review wave did not touch prod
cron; no repo artifact clears it). It remains the single open operator item exiting Phase 2 (see the
PENDING-OPERATOR row above). The optional operator Auth `auth_leaked_password_protection` toggle
(one-click, no migration) also remains available (see SEC-02-08-ADVISORS).

---

### R-06-01 — Internal-worker Career Compass tier resolution locked to `free` (deferred from Plan 06-01, FEAT-05)

| Field | Value |
| ----- | ----- |
| **Component** | `supabase/functions/analyze-career/index.ts` (auth/tier resolution :814–851) + `submit-career-analysis-job/index.ts` (:106 payload `tier`) |
| **Discovered by** | Plan 06-01 Task 1 (RESEARCH Open Question 1 live-path investigation), 2026-07-07 · see `06-01-LIVE-PATH-FINDING.md` §"SEPARATE finding" |
| **Finding** | The LIVE main Career Compass path (submit → process worker → `analyze-career` internal) processes **every subscriber tier at `free`**, regardless of the user's actual Pro/Elite subscription. Root cause: the worker fetch carries `x-internal-job-secret` → `requireInternalAuth` returns `null` → `userContext` null → `resolvedTier` derives to `'free'` (:831–834), AND `body.tier`/`payload.tier` is never destructured (:815). A queued Pro/Elite run is thus analyzed with free-tier model + shape (`getModel('free','career')`, `applyCareerTierShape(…, 'free')`). |
| **Evidence basis** | Static call-graph (HIGH confidence); operator-approved. No live rows inspected (Supabase MCP not reachable from the executor tool surface; static basis explicitly permitted by the plan). |
| **Why deferred (NOT fixed in 06-01)** | Out of FEAT-05 scope. FEAT-05 foregrounds **Free-tier correctness + byte-preservation**; silently "fixing" tier resolution inside the lifecycle migration would CHANGE behavior (paid users would suddenly receive richer paid output + different model cost) and violate the byte-identical-dormancy hard constraint. Recorded as a separate finding rather than scheduled as a fix. |
| **Clearance criterion** | A dedicated decision/plan (candidate: Phase 7 dashboard or a follow-up) that either (a) forwards a server-trusted tier onto the internal path (e.g. `process-career-analysis-job` re-resolves the submitter's tier server-side and the worker/analyze-career honors it), or (b) explicitly ratifies free-tier-for-all-queued-career as intended product behavior. Any change must preserve the merit-deduction-at-submit contract and re-prove byte-preservation for the free path. |
| **Status** | **DEFERRED** — documented, not fixed. Executor attaches around the confirmed live free-tier legacy branch (06-01 Task 3); this tier limitation is orthogonal to the lifecycle adoption. |
