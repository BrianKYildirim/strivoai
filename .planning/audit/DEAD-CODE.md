# CLEAN-01 — Dead-Code / Unused-Export Audit

**Phase:** 03 — Cross-Domain Inventory & Audit
**Plan:** 03-02 (CLEAN-01)
**Audit run-date:** 2026-06-13
**Branch / HEAD at audit:** `staging` @ `2c407ca`
**Tooling (npx-driven, zero new devDeps — D-01):** `npx knip` 6.16.1 (React dead files / unused exports — `--reporter json`); `node scripts/audit/deno-reachability.mjs` → `deno info --json --no-lock` graph-union over all 38 deployed edge-function entrypoints (Deno `_shared` reachability); `rg` 14.x (dynamic/string-reference + external-caller sweeps). Runner versions: node 22.16.0, supabase CLI 2.100.1.
**Scope:** **READ-ONLY.** This audit reads source and writes ONLY this file. It removes nothing — removal is Phase 4 (CLEAN-02/CLEAN-03), which acts only on confirmed-`safe` rows. Records paths / classifications / concurring signals only; **no secret value is pasted anywhere.**

---

## Verdict / Summary

| Tier | React (knip) | Deno (`deno info` reachability) | D-08 named targets | Total |
| ---- | ------------ | ------------------------------- | ------------------ | ----- |
| **`safe`** | 3 | 2 | 0 | **5** |
| **`needs-investigation`** | 18 | 3 | 2 | **23** |
| **`unsafe` (gated/keep)** | 0 | 0 | 0 | **0** |

- **React dead-FILE candidates (knip):** 23 files flagged. 3 → `safe` (all four signals concur, inline-cited); 18 → `needs-investigation`; 2 are knip FALSE POSITIVES neutralized below (`HowItWorks.tsx` disambiguation, the Interview-Prep gated surface). Unused-EXPORT / unused-TYPE rows are listed separately (all `needs-investigation` — an unused export is not a dead file).
- **Deno `_shared` dead candidates (reachability union):** 5 of 41 `_shared/*.ts` are absent from every entrypoint graph. 2 → `safe` (`errors.ts`, `handler.ts` — zero references anywhere, no sibling test). 3 → `needs-investigation` (`resolve-tier.ts` + the two `test-helpers/stripe-*` — each backed by a LIVE deno test in the `verify:baseline` suite, so "unreachable from a deployed entrypoint" ≠ "removable").
- **D-08 re-verification:** Ollama extraction branch → `needs-investigation` (parser-first routing recorded with line anchors; live-ness unknown without prod logs / `OLLAMA_BASE_URL` presence). `interview-prep-coach` → no repo source / no `config.toml` block / no reference anywhere in `supabase/` → Phase-4 CLEAN-03 removal candidate, **pending the MARKED OPERATOR `supabase functions list` deployment check** (cannot be confirmed autonomously).
- **KEEP-LIST gate (D-07) applied after every static pass.** No KEEP-LIST class (Interview Prep `interview-prep-analyze`/`-evaluate`, Paddle remnants, name/webhook/cron-invoked functions, dynamic/template-literal keys, deprecated-but-imported lock primitives) is classed `safe`. The conservative bar (D-06): `safe` ONLY when **static-dead + no-dynamic-ref + no-external-caller + not-gated** all concur, inline-cited.

---

## Commands Run (each read-only; results are classifications/paths, never values)

### 1. React dead files / unused exports (knip)

```bash
# wired as: npm run audit:deadcode  (knip leg) — knip 6.16.1
npx --yes knip --reporter json
# knip exit 1 = "issues found" (a FINDING, not a tooling error). JSON captured below.
```

**Result:** 23 `files` (dead-file) entries + unused `exports`/`types` on ~13 live files + `dependencies`/`unlisted` (the dep legs are DEP-01 / `03-03 DEPENDENCIES.md`, NOT classified here). knip is correctly scoped (`project=src/**`, all test/e2e/config globs as `entry`, `ignore src/components/ui/**`, and it NEVER reads `supabase/functions/**` — Deno `https://`/`npm:`/`jsr:` imports are unresolvable to knip). No `supabase/functions/*` path appears in knip output (Pitfall-1 guard holds).

### 2. Deno edge-function `_shared` reachability (graph-union)

```bash
# wired as: npm run audit:deadcode  (Deno leg)
node scripts/audit/deno-reachability.mjs
# deno info --json --no-lock over all supabase/functions/*/index.ts; union modules[].specifier
# matching /supabase/functions/_shared/; dead = all _shared *.ts (minus tests) NOT in union.
```

**Result (reproduced this run):**
```
[deno-reachability] Entrypoints: 38
Reachable _shared modules (in union): 36
Total _shared *.ts files (excl. tests): 41
Dead-code CANDIDATES (not in any entrypoint graph): 5
  - supabase/functions/_shared/errors.ts
  - supabase/functions/_shared/handler.ts
  - supabase/functions/_shared/resolve-tier.ts
  - supabase/functions/_shared/test-helpers/stripe-fixtures.ts
  - supabase/functions/_shared/test-helpers/stripe-signature.ts
```

### 3. Dynamic / string-reference sweep (Pattern 4 — the no-dynamic-ref signal)

```bash
# React: dynamic / lazy / glob imports across src
rg -n "import\(|React\.lazy|lazy\(|import\.meta\.glob" src
# Per-candidate name sweep (excluding tests, __tests__, and the candidate's own file)
rg -n "\b<Name>\b" src --glob '!**/*.test.*' --glob '!**/__tests__/**' -g '!**/<Name>.tsx'
# Deno: dynamic imports in production edge code
rg -n "await import\(|import\(" supabase/functions --glob '!**/*.test.ts' --glob '!**/__tests__/**'
```

**Result:** **Production code uses NO dynamic/lazy/glob imports** — React side: every `import()` hit is inside a `.test.tsx`/`__tests__` file (`vi.importActual`, test-local `import('pdfjs-dist')`). Deno side: **zero** dynamic imports in production edge code. The no-dynamic-ref signal therefore holds for every candidate that also has no static importer (the per-candidate results are recorded inline in the tables).

### 4. External-caller check (Deno — the no-external-caller signal)

```bash
rg -n "^\[functions\." supabase/config.toml        # deployed-function registry (35 blocks)
# cross-check each Deno dead candidate against config.toml + KEEP-LIST cron/webhook list
rg -n "_shared/errors|_shared/handler|resolve-tier|resolveTier" supabase/functions
```

**Result:** `_shared/*.ts` modules are never `config.toml` entrypoints (only `index.ts` per function dir is). External-caller relevance is therefore "is any *reachable* function importing it?" → answered by the union + the grep in §3. `config.toml` confirms `interview-prep-analyze` (L82) and `interview-prep-evaluate` (L85) are deployed (KEEP-LIST Class 1, never-`safe`) and `paddle-webhook` (L79) is deployed (KEEP-LIST Class 2, never-`safe`); **no `interview-prep-coach` block exists** (D-08, §below).

---

## React Findings — Dead FILES (knip `files`)

Classification column = `safe` / `unsafe` / `needs-investigation` (D-05). A `safe` row inline-cites all four concurring signals (D-06). Per-candidate non-test, non-self importer sweep (§3) is the no-dynamic-ref + no-static-importer evidence.

| # | File | Class | Evidence / concurring signals |
| - | ---- | ----- | ----------------------------- |
| 1 | `src/components/HowItWorks.tsx` | **safe** | `(signals: static-dead [knip files] + no-dynamic-ref [no import()/lazy in src] + no-external-caller [zero non-self importers; the routed page is the DISTINCT `src/pages/HowItWorks.tsx`, which imports `components/HowItWorksFeatureCards.tsx`, NOT this file] + not-gated [not in any KEEP-LIST class])`. A superseded landing-section component; the bare-word `Hero`/`Features` hits elsewhere are JSX comments/labels, not imports. |
| 2 | `src/components/MinimalHero.tsx` | **safe** | `(signals: static-dead [knip files] + no-dynamic-ref [none in src] + no-external-caller [only non-self hit is a code COMMENT in `RecruitingLens.tsx:377` "legacy MinimalHero users" — prose, not an import] + not-gated [no KEEP-LIST class])`. |
| 3 | `src/components/NavLink.tsx` | **safe** | `(signals: static-dead [knip files] + no-dynamic-ref [none in src] + no-external-caller [zero importers incl. tests] + not-gated [no KEEP-LIST class])`. |
| 4 | `src/components/InterviewQuiz.tsx` | needs-investigation | KEEP-LIST Class 1 (Interview-Prep surface). Zero importers (the LIVE quiz path is `InterviewPrep.tsx → QuizRunner` at `components/interviewPrep/QuizRunner.tsx`, a different component) → superseded-WITHIN-a-gated-feature. NEVER `safe` per gate; Phase 4 must confirm no flag/variant re-activates the old quiz before removal. Imports the §"leaf" cluster (rows 17–20). |
| 5 | `src/components/InterviewFlashcards.tsx` | needs-investigation | KEEP-LIST Class 1. Zero importers; not reached by the live `QuizRunner` path. Superseded-within-gated-feature → never `safe` until Phase 4 confirms the flag never renders it. |
| 6 | `src/components/InterviewQuizResults.tsx` | needs-investigation | KEEP-LIST Class 1. Zero importers; imports `QuizResultsCard` + `ReadinessScoreRing` (rows 19–20). Superseded-within-gated-feature → never `safe`. |
| 7 | `src/components/InterviewStreakDisplay.tsx` | needs-investigation | KEEP-LIST Class 1. Zero importers; not on the live `QuizRunner` path. Superseded-within-gated-feature → never `safe`. |
| 8 | `src/components/ProFeatureBlur.tsx` | needs-investigation | KEEP-LIST Class 5 (deprecated-but-imported). Carries `@deprecated` (`ProFeatureBlur.tsx:11` → "Use `<LockedSection>` instead"). Zero importers at THIS HEAD (incl. tests). Deprecated ≠ confirmed-removable until Phase 4 verifies no DEV-route / non-DEV-page call site remains (the lock-primitive sandbox `/dev/locked-sections` still routes `LockedSection`). NEVER `safe` per gate. |
| 9 | `src/components/InterviewPrepInput.tsx` | needs-investigation | KEEP-LIST Class 1. Zero non-test importers (active intake is `<IntakeForm>`/`QuizRunner`). Inside the gated Interview-Prep surface → never `safe`; Phase 4 confirms zero flag-path importer. |
| 10 | `src/components/Features.tsx` | needs-investigation | Zero importers; the non-self `Features` hits are a tier-config COMMENT, a Footer `<li>` label, and an `aria-label` — not imports. Landing-section component; likely superseded (cf. `MinimalHero`), but classed `needs-investigation` pending a same-as-row-2 confirmation that no marketing route conditionally mounts it. |
| 11 | `src/components/Hero.tsx` | needs-investigation | Zero importers; all `Hero` hits are JSX section comments across pages. Landing component; `needs-investigation` (confirm no route/variant mounts it before `safe`). |
| 12 | `src/components/HowItWorks.tsx` (knip flag) — DISAMBIGUATION | (see row 1) | NOTE: knip flags `components/HowItWorks.tsx`. App.tsx routes the DISTINCT `pages/HowItWorks.tsx` (`/how-it-works`). Recorded so Phase 4 does not confuse the two. (Row 1 carries the `safe` verdict for the component.) |
| 13 | `src/components/NextBestAction.tsx` | needs-investigation | Zero importers (cf. the live `LinkedInNextBestAction` type in `LinkedInGrader.tsx` — different symbol). `needs-investigation` (confirm no dynamic/string mount) before `safe`. |
| 14 | `src/components/PDFHighlighter.tsx` | needs-investigation | Zero importers; PDF tooling overlaps with `react-pdf`/`pdfjs-dist` usage elsewhere. `needs-investigation` — confirm the resume-preview path does not lazily mount it. |
| 15 | `src/components/PlanComparisonTable.tsx` | needs-investigation | Zero importers. Pricing/plan surface — sibling of the RESEARCH-seeded `PricingTable.tsx` test-only case; `needs-investigation` (Phase 4 confirms no Pricing variant + whether a co-located test must also go). |
| 16 | `src/hooks/use-mobile.tsx` | needs-investigation | Zero importers. A shadcn-convention hook (`useIsMobile`) often kept for parity; `needs-investigation` (cheap to remove but verify no `ui/**` ignored consumer references it — `ui/**` is knip-ignored, so a hidden consumer is possible). |
| 17 | `src/hooks/useAuthSync.ts` | needs-investigation | Zero importers. Auth-adjacent → conservative: `needs-investigation` (confirm no provider/bootstrap wires it before removal). |
| 18 | `src/pages/AuthCallback.tsx` | needs-investigation | Zero static importers. A `/auth/callback`-class route page may be referenced as a redirect STRING (OAuth/Supabase callback URL) rather than an `import` — exactly the dynamic-reference trap. `needs-investigation` until the auth redirect config (Supabase dashboard URL allow-list / router string) is checked. NEVER `safe` on a no-import reading alone. |
| 19 | `src/pages/ResumeBuilder.tsx` | needs-investigation | Zero static importers / no route in `App.tsx`. A page absent from the router yet present in repo — could be an in-progress / string-navigated page. `needs-investigation` (confirm no `navigate("/resume-builder")` string or feature-flag route). |
| 20 | `src/components/QuizProgressIndicator.tsx` | needs-investigation | Leaf of the superseded quiz cluster — imported ONLY by `InterviewQuiz.tsx` (row 4), itself dead. KEEP-LIST Class 1 surface → never `safe`; removable only as part of the row-4 cluster after Phase-4 flag confirmation. |
| 21 | `src/components/QuizQuestionCard.tsx` | needs-investigation | Leaf — imported ONLY by `InterviewQuiz.tsx` (row 4). KEEP-LIST Class 1 cluster → never `safe`. |
| 22 | `src/components/QuizResultsCard.tsx` | needs-investigation | Leaf — imported ONLY by `InterviewQuizResults.tsx` (row 6). KEEP-LIST Class 1 cluster → never `safe`. |
| 23 | `src/components/ReadinessScoreRing.tsx` | needs-investigation | Leaf — imported ONLY by `InterviewQuizResults.tsx` (row 6). KEEP-LIST Class 1 cluster → never `safe`. |
| 24 | `src/types/database.ts` | needs-investigation | knip flags it a dead FILE, but generated/ambient DB types are frequently referenced via `import type` that knip's resolution misses, or kept as the Supabase typegen target. `needs-investigation` (confirm no `Database`-type consumer + whether it is the typegen output) — generated types are NOT a clean `safe`. |

> Rows 20–23 (the quiz leaves) and rows 4–9 (the quiz/intake/deprecated cluster) form ONE Interview-Prep removal unit. None is `safe` independently: KEEP-LIST Class 1 forces the whole gated surface to `needs-investigation` until Phase 4 confirms (a) the feature flag never renders the old `InterviewQuiz` path, and (b) co-located tests are removed together.

## React Findings — Unused EXPORTS / TYPES (knip `exports` / `types`)

An unused export on a LIVE file is not a dead file — it is a narrower CLEAN-04-class cleanup. All `needs-investigation` (the file stays; only the symbol is a candidate, and many are public-API/parity exports). Listed for Phase 4 completeness; none is `safe` here (removing an export can break an ambient/string consumer knip can't see, and several are test-only-consumed which is a deliberate seam).

| File | Unused symbol(s) | Class | Note |
| ---- | ---------------- | ----- | ---- |
| `src/test/supabaseMock.ts` | `makeQueryBuilder` | needs-investigation | Test util export; removal is a test-infra decision. |
| `src/config/pricing-config.ts` | `getMaxOutput`, `getMaxInputTokens`, `getMaxInputChars`, `getMeritCost` | needs-investigation | Pricing-config public helpers; cross-layer `deno info` showed edge code imports `pricing-config.ts` — confirm no edge consumer before pruning. |
| `src/hooks/useTierAccess.ts` | `useFeatureGate` (export), `FeatureType` (type) | needs-investigation | Tier-gating API surface; confirm no gated consumer. |
| `src/components/career-compass/index.ts` | `ScoreRing` (re-export) | needs-investigation | Barrel re-export; barrels often kept for API stability. |
| `src/types/interviewPrep.ts` | `InterviewPrepPayloadSchema`, `InterviewPrepResponseSchema` | needs-investigation | KEEP-LIST Class 1 (Interview-Prep) — zod schemas for the gated feature; never `safe`. |
| `src/hooks/use-toast.ts` | `reducer`, `toast` | needs-investigation | shadcn toast primitive exports (parity with `ui/**`); likely keep. |
| `src/lib/document-extraction.ts` | `DOCUMENT_EXTRACTION_VERSION`, `ACCEPTED_RESUME_DOCUMENT_EXTENSIONS`, types `DocumentType`/`ExtractionProvider` | needs-investigation | Extraction constants/types — adjacent to the D-08 Ollama surface; confirm no consumer before pruning. |
| `src/components/AnalysisComparisonModal.tsx` | duplicate `default`/`AnalysisComparisonModal` export | needs-investigation | Duplicate-export (named + default of same symbol) — a CLEAN-04 tidy, not a dead file. |
| `src/components/profile/EducationTargetsSection.tsx` | `GRADUATION_YEARS`, `YEAR_OPTIONS` | needs-investigation | Module-scope constants exported but consumed in-file; confirm no external consumer. |
| `src/lib/analysisHelpers.ts` | `extractResumeInsights`, `extractLinkedInInsights`, `getAnalysisHistory`, type `AnalysisInsight` | needs-investigation | Analysis helpers; some are test-consumed seams — confirm before pruning. |
| `src/components/career-compass/types.ts` | types `RoleRoadmapStep`, `SkillGap`, `ResumeImprovement` | needs-investigation | Domain types; keep unless all consumers gone. |
| `src/hooks/useUserTargets.ts` | types `CareerTargetsRow`, `ProfileTargetFields` | needs-investigation | Domain types. |
| `src/pages/LinkedInGrader.tsx` | types `LinkedInNextBestAction`, `LinkedInResult` | needs-investigation | Page-local types exported but in-file consumed. |

## Deno `_shared` Findings — reachability dead-candidates

The union roots from deployed edge-function entrypoints (a function is reached by HTTP-invoke/webhook/cron, never by `import` — KEEP-LIST Class 3). "Not in the union" = not imported by any reachable function. Each candidate then runs the KEEP-LIST gate + the no-dynamic-ref/no-importer grep.

| # | Module | Class | Evidence / concurring signals |
| - | ------ | ----- | ----------------------------- |
| 1 | `supabase/functions/_shared/errors.ts` | **safe** | `(signals: static-dead [absent from the 38-entrypoint deno-info union] + no-dynamic-ref [zero `import()` in production edge code] + no-external-caller [`rg "_shared/errors"` → ZERO references anywhere, incl. tests] + not-gated [not a function entrypoint; no KEEP-LIST class — not Paddle/Interview/cron/webhook/dynamic-key])`. No sibling `errors.test.ts`. Confirmed removable in Phase 4. |
| 2 | `supabase/functions/_shared/handler.ts` | **safe** | `(signals: static-dead [absent from union] + no-dynamic-ref [no production dynamic imports] + no-external-caller [`rg "_shared/handler"` / `from ".../handler"` → ZERO references anywhere, incl. tests] + not-gated [no KEEP-LIST class])`. No sibling `handler.test.ts`. Confirmed removable in Phase 4. |
| 3 | `supabase/functions/_shared/resolve-tier.ts` | needs-investigation | **NAME-COLLISION + LIVE-TEST trap.** TWO tier resolvers exist: the LIVE one is `_shared/price-resolver.ts` `resolveTier()` (imported + used by `stripe-webhook-handler/index.ts:38,322,660,699`). This separate `_shared/resolve-tier.ts` (DB-based, reads `profiles.subscription_tier`) is absent from the entrypoint union BUT has its OWN deno test `_shared/resolve-tier.test.ts` (5 D-08 tests asserting it queries profiles / selects subscription_tier / uses maybeSingle / exports `resolveTier`). A dead-from-entrypoints module that is test-covered and name-collides with a live symbol is NEVER `safe` on the union alone — Phase 4 must confirm the test goes too and that no future webhook path wires the DB resolver. |
| 4 | `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` | needs-investigation | LIVE TEST utility. Absent from the entrypoint union (tests are not entrypoints — correct), but imported by `_tests/test-04/05/06-*.test.ts` and `stripe-webhook-handler/index.test.ts` — tests that are part of `npm run verify:baseline`. Removing it BREAKS the test suite → never `safe`; it is a kept test-infra module, not dead code. |
| 5 | `supabase/functions/_shared/test-helpers/stripe-signature.ts` | needs-investigation | LIVE TEST utility — same as row 4 (`signStripePayload` imported by the same four Stripe deno tests). Kept test-infra; never `safe`. |

---

## D-08 Named-Target Re-Verification (recorded evidence, not carried-forward rumor)

### D-08.a — Obsolete Phase 50 Ollama extraction path

**Verdict: `needs-investigation`** (live-ness of the fallback branch is not determinable from repo alone).

**Routing evidence (read this run, `supabase/functions/_shared/document-extraction.ts` @ `2c407ca`):**
- **`pdf_parser` is attempted FIRST** — `attemptedProviders.push('pdf_parser')` at **L55**; if `params.pdfjsText` passes `assessExtractionQuality` (**L57–62**) it returns immediately as `accepted` (**L63–75**). Only on reject/no-text (**L77–84**) does control fall through.
- **Ollama is the FIRST entry of the `cheapProviders` fallback chain** — `provider: 'ollama'`, `invoke: () => (params.ollamaVision ?? invokeOllamaVision)(...)` at **L92–97**, iterated in the fallback loop **L114–152** (order: `ollama → mistral → textract`), with `claude_ocr` last and tier-gated (`policy.allowClaudeOcr`, **L154–201**).
- `ollama-client.ts` IS imported (`document-extraction.ts:14–18` + `ocr-pdf/index.ts`), so it is correctly **reachable** (NOT in the Deno dead-candidate list). Production env reads in `ollama-client.ts`: `OLLAMA_BASE_URL` (L92), `OLLAMA_AUTH_HEADER_NAME` (L95), `OLLAMA_AUTH_SECRET` (L96), `OLLAMA_MODEL` (L100), `OLLAMA_TIMEOUT_MS` (L101).
- Phase 51 (`20260607040000_phase51_document_extraction_identity`) post-dates Phase 50 (`20260605000000_phase50_extraction_metadata`); the parser-first design is the current shape.

**Why `needs-investigation`, not `safe`:** the Ollama branch is only ever taken when `pdf_parser` fails quality AND `OLLAMA_BASE_URL` is set in prod. Whether that branch is ever reached in production is unknowable without live extraction logs / confirmation that `OLLAMA_BASE_URL` is unset in prod. **Phase 4 CLEAN-03 confirms** against live logs / prod env presence before retiring the Ollama leg. Removing it now would be a removal on unproven-dead evidence (zero-functional-change risk).

### D-08.b — Retired `interview-prep-coach` edge function

**Verdict: `needs-investigation` → Phase-4 CLEAN-03 removal candidate, pending the MARKED OPERATOR deployment check.**

**Repo evidence (verified this run):**
- `test -d supabase/functions/interview-prep-coach` → **non-zero (ABSENT)** — no source dir.
- No `[functions.interview-prep-coach]` block in `supabase/config.toml`.
- `rg "interview-prep-coach" supabase/` → **zero matches anywhere** in the supabase tree.
- The look-alike LIVE pair (KEEP-LIST Class 1, **never `safe`**) DOES exist: `supabase/functions/interview-prep-analyze/` (config.toml L82) + `supabase/functions/interview-prep-evaluate/` (config.toml L85). **Do not conflate** `-coach` (retired) with `-analyze`/`-evaluate` (gated-live) — RESEARCH Pitfall 7.

**MARKED OPERATOR STEP (deployment confirmation — NOT run autonomously; prod/staging ref is operator-supplied, RESEARCH Open Question 2):**
```bash
# Operator runs against the real refs; diff against repo dirs + config.toml.
# A function listed here with NO repo dir = a deployed-orphan (the interview-prep-coach case).
npx supabase functions list --project-ref <PROD_REF>
npx supabase functions list --project-ref <STAGING_REF>
```
Expected: `interview-prep-coach` appears in the deployed list (staging and/or prod) with no repo source → Phase 4 CLEAN-03 removes it via `supabase functions delete interview-prep-coach`. If it does NOT appear, it is already gone (no-op). Either way, this is a deployed-state fact only the operator can confirm; the repo-side verdict ("no source, no registration") is recorded above.

---

## Re-Assertion Block (reproducible by Phase 4 / any future audit)

Run from repo root. All npx-driven / built-in — zero new deps (D-01).

```bash
# 1. React dead files / unused exports + Deno _shared reachability (both passes).
npm run audit:deadcode
#    → knip JSON (exit 1 = findings) + "Reachable 36 / Total 41 / Dead 5" Deno block.

# 2. No production dynamic/lazy/glob imports (the no-dynamic-ref signal).
rg -n "import\(|React\.lazy|lazy\(|import\.meta\.glob" src     # → test files only
rg -n "await import\(|import\(" supabase/functions --glob '!**/*.test.ts' --glob '!**/__tests__/**'   # → empty

# 3. D-08 Ollama routing order (parser-first, ollama fallback).
rg -n "attemptedProviders.push\('pdf_parser'\)|provider: 'ollama'" supabase/functions/_shared/document-extraction.ts

# 4. D-08 interview-prep-coach absence (repo side).
test -d supabase/functions/interview-prep-coach && echo PRESENT || echo ABSENT   # → ABSENT
rg -n "interview-prep-coach" supabase/                                            # → no matches

# 5. Zero functional change (this plan reads source, edits none).
git diff --stat fa4ccb6..HEAD -- src supabase/functions                           # → empty
git show --stat HEAD                                                              # → only DEAD-CODE.md
```

**PowerShell equivalent for step 4** (primary shell is pwsh):
```powershell
if (Test-Path supabase/functions/interview-prep-coach) { "PRESENT" } else { "ABSENT" }
```

---

## Cross-References

- **[`KEEP-LIST.md`](./KEEP-LIST.md)** — the D-07 gate applied after every static pass in this catalog. Class 1 (Interview Prep `interview-prep-analyze`/`-evaluate` + gated UI), Class 2 (Paddle remnants), Class 3 (name/webhook/cron-invoked functions), Class 4 (dynamic/template-literal keys), Class 5 (deprecated-but-imported `LockedSection`/`LockedListItem`/`ProFeatureBlur`) are **never `safe`** — every match above is `unsafe`/`needs-investigation`, never `safe`. `interview-prep-analyze`/`-evaluate` and `LockedSection` appear on NO `safe` row (verify: grep `safe` rows).
- **[`INDEX.md`](./INDEX.md)** — catalog entry point + how-to-re-run (this file's row is pre-listed there; INDEX is NOT edited by this plan).
- **Consumer — Phase 4 (CLEAN-02 / CLEAN-03 / CLEAN-04 / CLEAN-06):** acts ONLY on the 5 `safe` rows (React: `HowItWorks.tsx`, `MinimalHero.tsx`, `NavLink.tsx`; Deno: `_shared/errors.ts`, `_shared/handler.ts`). Every `needs-investigation` row must be resolved (its blocking signal confirmed clear) BEFORE removal — especially the Interview-Prep gated cluster, `resolve-tier.ts`, `AuthCallback.tsx`, and the two D-08 targets (which additionally require the operator `supabase functions list` check + live Ollama-log evidence).
- **RESEARCH** `.planning/phases/03-cross-domain-inventory-audit/03-RESEARCH.md` — Pattern 2 (`deno info` union), Pattern 3 (multi-signal gate), Pattern 4 (dynamic-reference detection), Pitfall 1 (knip scoping), Pitfall 7 (`-coach` vs `-analyze`/`-evaluate`), Open Question 4 (Ollama live-ness).
- **STATE** `.planning/STATE.md` §"Carried-Forward Cleanup Targets" — Ollama Phase-50 path + retired `interview-prep-coach` (both re-verified above with current-HEAD evidence).

*This file records paths, classifications, and concurring signals only — no secret value is pasted anywhere in it.*
