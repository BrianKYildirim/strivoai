---
phase: 37
slug: feature-output-parity-ux-cache-resume-linkedin-career-compas
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-24
last_audited: 2026-06-01
---

# Phase 37 — Validation Strategy (Reconstructed)

> Reconstructed from per-plan SUMMARY artifacts after execution. All cited
> automated test files exist and were green at plan-completion time.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Frontend framework** | Vitest 4.x (`vitest.config.ts`) |
| **Edge-function framework** | Deno test runner (`supabase/functions/deno.json`) |
| **Frontend quick run** | `npm run test -- <pattern>` |
| **Frontend full suite** | `npm test` |
| **Edge quick run** | `deno test --allow-read --allow-env --allow-net <file>` |
| **Edge full suite** | `.\scripts\run-edge-tests.ps1` |
| **Lint** | `npm run lint` |
| **Estimated quick-run runtime** | ~5–15 s per focused file |

---

## Sampling Rate

- **After every task commit:** Run the targeted file(s) listed in the verification map.
- **After every plan wave:** Run the per-plan verification block listed in the SUMMARY.md.
- **Before `/gsd:verify-work`:** Edge full suite + frontend full suite must be green.
- **Max feedback latency:** ~30 s per focused targeted run.

---

## Per-Task / Per-Requirement Verification Map

### Plan 37-01 — Resume Analysis output + cache

| Requirement | Test Type | File | Automated Command | Status |
|---|---|---|---|---|
| RES-01 | unit (frontend) | `src/pages/__tests__/Results.priority-output.test.tsx` | `npm run test -- Results.priority-output` | ✅ green |
| RES-02 | unit (frontend) | `src/pages/__tests__/Results.priority-output.test.tsx` | `npm run test -- Results.priority-output` | ✅ green |
| RES-03 | unit (edge) | `supabase/functions/analyze-resume/prompts.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/analyze-resume/prompts.test.ts` | ✅ green |
| RES-04 | unit (edge) | `supabase/functions/analyze-resume/prompts.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/analyze-resume/prompts.test.ts` | ✅ green |
| CACHE-04 | unit (edge) | `supabase/functions/analyze-resume/cache.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/analyze-resume/cache.test.ts` | ✅ green |

### Plan 37-02 — LinkedIn Grader output + cache

| Requirement | Test Type | File | Automated Command | Status |
|---|---|---|---|---|
| LIG-01 | unit (frontend) | `src/pages/__tests__/LinkedInGrader.output-parity.test.tsx` | `npm run test -- LinkedInGrader.output-parity` | ✅ green |
| LIG-02 | unit (edge) | `supabase/functions/grade-linkedin/prompts.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/grade-linkedin/prompts.test.ts` | ✅ green |
| LIG-03 | unit (edge) | `supabase/functions/grade-linkedin/validation.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/grade-linkedin/validation.test.ts` | ✅ green |
| LIG-04 | unit (edge) | `supabase/functions/grade-linkedin/validation.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/grade-linkedin/validation.test.ts` | ✅ green |
| LIG-05 | unit (frontend) | `src/pages/__tests__/LinkedInGrader.output-parity.test.tsx` | `npm run test -- LinkedInGrader.output-parity` | ✅ green |
| LIG-06 | unit (frontend) | `src/pages/__tests__/LinkedInGrader.linkedin-pdf-source.test.ts` | `npm run test -- LinkedInGrader.linkedin-pdf-source` | ✅ green |
| LIG-07 | unit (frontend) | `src/pages/__tests__/LinkedInGrader.linkedin-pdf-source.test.ts` | `npm run test -- LinkedInGrader.linkedin-pdf-source` | ✅ green |
| LIG-08 | unit (frontend) | `src/pages/__tests__/LinkedInGrader.linkedin-pdf-source.test.ts` | `npm run test -- LinkedInGrader.linkedin-pdf-source` | ✅ green |
| LIG-09 | manual | — | manual QA path #4 in 37-02-SUMMARY.md | ⚠️ manual-only |
| CACHE-05 | unit (edge) | `supabase/functions/grade-linkedin/cache.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/grade-linkedin/cache.test.ts` | ✅ green |

### Plan 37-03 — Career Compass output + cache

| Requirement | Test Type | File | Automated Command | Status |
|---|---|---|---|---|
| CC-01..CC-08 (Free parity, paid strictness, partial UX, tier shaper) | unit (frontend + edge) | `src/components/career-compass/__tests__/partial-output.test.tsx`, `src/pages/__tests__/CareerCompass.prior-selectors.test.ts`, `supabase/functions/analyze-career/paid-output-validation.test.ts`, `supabase/functions/_shared/career-shape.test.ts` | `npm run test -- partial-output`; `npm run test -- career-compass`; `deno test --allow-read --allow-env --allow-net supabase/functions/analyze-career/paid-output-validation.test.ts supabase/functions/_shared/career-shape.test.ts` | ✅ green |
| CC-09..CC-10 (deep-link hydration, partial recovery) | unit (frontend) | `src/components/career-compass/__tests__/partial-output.test.tsx` | `npm run test -- partial-output` | ✅ green |
| CC-11 (Pro/Elite empty regression) | unit (edge) | `supabase/functions/analyze-career/paid-output-validation.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/analyze-career/paid-output-validation.test.ts` | ✅ green |
| CC-12..CC-13 (re-run CTA, persistence guards) | unit (frontend + edge) | `partial-output.test.tsx`, `paid-output-validation.test.ts` | per-plan commands above | ✅ green |
| CACHE-06 | unit (edge) | `supabase/functions/analyze-career/cache.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/analyze-career/cache.test.ts` | ✅ green |
| TEST-06 | unit (edge) — Pro/Elite empty-output regression | `supabase/functions/analyze-career/paid-output-validation.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/analyze-career/paid-output-validation.test.ts` | ✅ green |

### Plan 37-04 — Recruiting Lens form + cache + tutorial + saved tiles

| Requirement | Test Type | File | Automated Command | Status |
|---|---|---|---|---|
| RCL-01 (company/role/JD fields) | unit (frontend) | `src/pages/__tests__/RecruitingLens.saved-jobs-tutorial.test.tsx` | `npm run test -- RecruitingLens.saved-jobs-tutorial` | ✅ green |
| RCL-02 (tutorial modal + dismissal) | unit (frontend) | `src/pages/__tests__/RecruitingLens.saved-jobs-tutorial.test.tsx` | `npm run test -- RecruitingLens.saved-jobs-tutorial` | ✅ green |
| RCL-03 (saved tiles + deep-link hydration) | unit (frontend) | `src/pages/__tests__/RecruitingLens.saved-jobs-tutorial.test.tsx` | `npm run test -- RecruitingLens.saved-jobs-tutorial` | ✅ green |
| RCL-04 (backend validation) | unit (edge) | `supabase/functions/recruiting-lens/cache-saved-jobs.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/recruiting-lens/cache-saved-jobs.test.ts` | ✅ green |
| RCL-05 (persistence ordering, linked usage) | unit (edge) | `supabase/functions/recruiting-lens/cache-saved-jobs.test.ts` | per-plan command above | ✅ green |
| RCL-06 (`role_title`→`roleTitle` normalization) | unit (edge) | `supabase/functions/recruiting-lens/cache-saved-jobs.test.ts` | `deno test --allow-read --allow-env --allow-net supabase/functions/recruiting-lens/cache-saved-jobs.test.ts` | ✅ green |
| RCL-06 (queued job parity) | obsolete | — | — | ⛔ N/A — async-queue path removed (HIST-07, commit 235ae06); `process-recruiting-lens-job` worker deleted, overload now fails fast with 503 |
| RCL-07 (Activity History surfacing) | manual | — | manual QA path #4 in 37-04-SUMMARY.md | ⚠️ manual-only |
| CACHE-07 | unit (edge) | `supabase/functions/recruiting-lens/cache-saved-jobs.test.ts` | per-plan command above | ✅ green |

---

## Wave 0 Requirements

Existing infrastructure (Vitest + Deno test runner) covered all phase
requirements. No Wave 0 install was needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Resume cached second-run path produces Activity-History row linked to original `analysis_id` end-to-end | RES-01..04 / CACHE-04 | Requires authenticated browser session + live Supabase + Anthropic call; cache-hit Activity-History row links through `raw_response.metadata.analysis_id` | 37-01-SUMMARY.md → "Manual QA Path" #1–4 |
| LinkedIn deep-link hydration ownership vs. auto-pull / cache restore | LIG-06..LIG-09 | Requires authenticated session with saved `profiles.linkedin_pdf_content` and a real `linkedin_grade_id` | 37-02-SUMMARY.md → "Manual QA Path" #1–9 |
| Career Compass `?id=<analysis_id>` deep-link hydration over old partial rows in live DB | CC-09..CC-13 | Requires authenticated session + persisted historical analyses | 37-03-SUMMARY.md → "Manual QA Path" #1–6 |
| Recruiting Lens cache-hit refresh of existing saved tile (no duplicates) + Activity History surfacing | RCL-03 / RCL-07 | Requires authenticated browser session + live Supabase | 37-04-SUMMARY.md → "Manual QA Path" #1–4 (path #5 queued-job email is obsolete — async-queue removed, HIST-07) |

---

## Validation Sign-Off

- [x] All tasks have automated verify OR documented manual-only path
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 not required (existing infrastructure sufficient)
- [x] No watch-mode flags used
- [x] Feedback latency < 30 s for focused targeted runs
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** reconstructed 2026-05-24

## Validation Audit 2026-05-24

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 (none required — all automated tests pre-existing and green) |
| Escalated to manual-only | 4 (live-environment-only verifications) |

## Validation Audit 2026-05-31

Re-ran all 16 cited automated test files against the current tree. 13 of 16 stayed
green on first run. Three gaps surfaced — all test/doc drift from later changes
(Phase 42 archive-fallback + HIST-07 async-queue removal), not behavior regressions.
Implementations remain correct; fixes were test-assertion + documentation only (no
source files modified).

| Gap | Requirement | Root cause | Resolution |
|---|---|---|---|
| Failing test | RCL-03 / RCL-05 / CACHE-07 | `recruiting-lens/cache-saved-jobs.test.ts:57` asserted `data.hit_count`; Phase 42 renamed the destructured var to `meta.hit_count` | Re-pointed assertion to `meta.hit_count` → green |
| Failing test | LIG-06 / LIG-07 / LIG-08 | `LinkedInGrader.linkedin-pdf-source.test.ts` asserted `invokeWithTimeout<any>` (impl now `<LinkedInGradeResponse>`) and used a hardcoded `\n` that missed CRLF on Windows checkout | Re-pointed generic + normalized CRLF→LF at read time → green |
| Stale citation | RCL-06 | VALIDATION.md cited deleted `process-recruiting-lens-job/cache-saved-jobs.test.ts` as green; worker removed in HIST-07 (commit 235ae06) | Re-pointed live `role_title`→`roleTitle` normalization to surviving sync test (green); marked queued-job-parity portion obsolete |

| Metric | Count |
|--------|-------|
| Gaps found | 3 |
| Resolved (automated) | 2 (test-assertion repairs, both green) |
| Reclassified obsolete | 1 (RCL-06 queued-worker — async-queue path removed, HIST-07) |
| Escalated to manual-only | 0 new |

## Validation Audit 2026-05-31 (re-verification)

Re-ran all 15 cited automated test files against the current tree to confirm the
earlier same-day drift repairs held. All green on first run — no new drift, no
regressions, no source changes.

- Edge (Deno): 79 passed · 0 failed across 9 files
- Frontend (Vitest): 19 passed · 0 failed across 6 files

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 (none required — all cited tests green) |
| Escalated to manual-only | 0 new (4 live-environment paths unchanged) |

Phase 37 remains **Nyquist-compliant**.

## Validation Audit 2026-06-01

Re-ran all 15 cited automated test files against the current tree to re-confirm
coverage. All 15 files exist; all green on first run — no drift since the
2026-05-31 re-verification, no regressions, no source changes.

- Edge (Deno): 79 passed · 0 failed across 9 files
- Frontend (Vitest): 19 passed · 0 failed across 6 files

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 (none required — all cited tests green) |
| Escalated to manual-only | 0 new (4 live-environment paths unchanged) |

Phase 37 remains **Nyquist-compliant**.
