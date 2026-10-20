# Architecture — v3.0 Caching & History Persistence Map

**Analysis Date:** 2026-04-28
**Scope:** Per-feature analyze entry points, output-affecting inputs, persist paths, history read paths, cache infra, and OCR/PDF normalization for v3.0 (analysis-persistence-merit-fixes-pricing-ux-feature-output-parity).

> **Headline finding:** No exact-input cache layer exists today for any feature. Every analyze call hits Claude. Per-file dedup exists only for resume uploads via `resumes.file_hash`. v3.0 must add a cache fingerprint (feature + tier/variant + input hashes) before any of the 5 features can short-circuit on identical inputs.

---

## Cross-cutting facts (apply to every feature)

- **Tier source of truth:** `profiles.subscription_tier`, resolved server-side in `requireAuth()` / `requireInternalOrUserAuth()` (`supabase/functions/_shared/auth.ts`). Edge functions NEVER trust `body.tier`.
- **Merit gateway:** `withMerits(ctx, feature, callback)` in `supabase/functions/_shared/merit-gateway.ts` deducts before Claude call, refunds on `MeritRefundable` throw. `MERIT_SYSTEM_ENABLED=true` in production.
- **Model routing:** `getModel(tier, feature)` in `supabase/functions/_shared/tier-config.ts:106`. Free is hard-pinned to `claude-haiku-4-5-20251001` (`FREE_MODEL`).
- **History audit row:** `record_ai_usage(p_user_id, p_action_type, p_credits)` RPC writes a row to `usage_tracking`. This is the **only** row guaranteed to exist for every successful analysis across all features. Action types: `resume_analysis`, `linkedin_grading`, `career_compass`, `recruiting_lens`, `interview_prep`.
- **`analysis_results` table** (`supabase/migrations/20251222223116_8abce0df-2f95-472e-a9e5-dca9a6d69c53.sql:2-11`) — closest thing to a generic "history" table. Columns: `id uuid PK, user_id uuid, analysis_type text` CHECK in `('resume_analysis','linkedin_grading','job_matching','career_compass','skills_gap_analysis','job_comparison','recruiting_lens','interview_prep')`, `primary_score integer, key_insights jsonb, raw_response jsonb, source_reference text, created_at timestamptz`. **MIG-02 lock:** user JWTs SELECT-only since `supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql`; service role writes only.

### Master persistence + read map

| Feature | Persist target | Frontend read | Hydration query | Notes |
|---|---|---|---|---|
| Resume Analysis | `resumes.grading_data` (UPDATE in place) | `/results/:id` reads `resumes` by id | `supabase.from('resumes').select('*').eq('id', id).single()` (`src/pages/Results.tsx:281, 369`) | NO `analysis_results` row written — bug for cross-feature lookup |
| LinkedIn Grader | `linkedin_grades` (INSERT, owner-scoped) | `/linkedin-grader?id=<grade_id>` | `linkedin_grades.select('*').eq('id', idFromUrl)` (`src/pages/LinkedInGrader.tsx:167-171`) | Multiple grades per user; latest fetched on mount |
| Career Compass | `analysis_results` INSERT (`analysis_type='career_compass'`) | `/career-compass?id=<analysis_id>` | `analysis_results.select('*').eq('id', idFromUrl).eq('analysis_type','career_compass')` (`src/pages/CareerCompass.tsx:275-280`) | Both Free single-call + Pro/Elite paths persist |
| Recruiting Lens | `analysis_results` INSERT — **Elite only** | `/recruiting-lens?id=<run_id>` | `analysis_results.select('*').eq('id', idFromUrl).eq('analysis_type','recruiting_lens')` (`src/pages/RecruitingLens.tsx:330-335`) | **Bug:** Pro tier has zero persisted history. Frontend silent-degrades with toast. NO `saved_jobs` insert. |
| Interview Prep | `interview_quizzes` INSERT (+ `interview_quiz_answers` for quiz mode + `interview_streaks` upsert for elite) | NO `?id=` hydration path exists | — | **Bug:** No frontend route to view a past quiz. AnalysisHistory routes to `/interview-prep?id=...` but page ignores `?id`. |

### AnalysisHistory dashboard read path

`src/pages/AnalysisHistory.tsx:160-302` — single page lists every successful analysis from `usage_tracking`, then attempts to resolve the click target via **±5-minute timestamp-proximity matching** (D-20):

- For each `usage_tracking` row, queries the appropriate feature table (`resumes`, `linkedin_grades`, `analysis_results` by type, `interview_quizzes`) and picks the row with the closest `created_at` within 5 minutes (`AnalysisHistory.tsx:255-269`).
- **Fragility:** when two analyses occur within 5 min, IDs can collide. Recruiting Lens Pro entries have no candidate row at all → fall back to base `/recruiting-lens` route, losing context.
- **v3.0 implication:** swap proximity match for an explicit `analysis_id` reference column on `usage_tracking`, OR ensure every feature writes a row to a single canonical history table keyed to the usage row.

### OCR / PDF normalization

| Source | PDF→text path | Text persistence | Cache fingerprint readiness |
|---|---|---|---|
| Resume upload (`src/pages/Upload.tsx:236-256`) | Client-side `extractPDFText` (pdfjs) → fallback to `ocr-pdf` edge function (Claude vision, `FREE_MODEL`, `maxTokens=3000`, `supabase/functions/ocr-pdf/index.ts:71, 112`) | **NOT persisted.** `resumes` row stores `file_path`, `file_url`, `file_hash` (SHA-256 of bytes), but raw text is re-extracted on every analyze | `file_hash` enables file-level dedup at upload (`Upload.tsx:178-193`); analyze functions get text re-fed via request body. v3.0 needs `resumes.extracted_text` or `resumes.text_hash` to fingerprint deterministically. |
| LinkedIn PDF (onboarding) | Client extracts via `extractPDFText`, raw text written to `profiles.linkedin_pdf_content` + `profiles.linkedin_pdf_filename` (`src/pages/Onboarding.tsx:309-310`, migrations `20251227213103_*`, `20251229075420_*`) | **YES — persisted on `profiles`** | One row per user. CareerCompass auto-pulls (`CareerCompass.tsx:196`); RecruitingLens + LinkedInGrader do NOT pull (frontend bug for v3.0 RCL/LIG auto-pull spec). |
| Recruiting Lens JD/LinkedIn paste | Client-side text only, posted in request body | Not persisted at JD/LinkedIn level | JD lives only inside `analysis_results.raw_response.metadata.jobDescription` for Elite — Pro has zero record |
| Interview Prep | Server-side `extractPDFText` from Storage `resumes/` bucket (`supabase/functions/interview-prep-analyze/index.ts:273-294`) | Not persisted; re-extracted every call | — |

### Cache infrastructure

**None exists.** No table, no RPC, no in-memory cache, no fingerprint column. `Upload.tsx:178-193` does naive per-file dedup (return existing analyzed `resumes.id` when `file_hash` matches and `grading_data` is non-null) but this is upload-only and ignores tier/prompt-variant changes.

v3.0 cache spec needs new infrastructure: feature key + tier/variant + input-hash composite key → cached `raw_response` blob. Recommended target: a new `analysis_cache` table or a `cache_key text` index added to existing per-feature tables.

---

## Feature 1 — Resume Analysis

### Analyze entry point
- **Streaming path:** `supabase/functions/analyze-resume/index.ts` (1428 lines). Frontend `useResumeStream` hook posts with `stream: true`; SSE response.
- **Async/queue path:** `supabase/functions/submit-resume-analysis-job/index.ts` (273 lines) inserts an `analysis_jobs` row with `job_type='resume_analysis'` and `merit_transaction_id`; `supabase/functions/process-resume-analysis-job/index.ts` (420 lines) polls and invokes analyze-resume internally with service-role auth.
- Free tier uses single Claude call (`FREE_SINGLE_CALL_MAX_TOKENS=4000`, `analyze-resume/index.ts:63`); Pro/Elite uses 3-call parallel fan-out (`criteria-1`, `criteria-2`, `summary`) + `elite-extras` for Elite (`CALL_CONFIGS`, `analyze-resume/index.ts:49-54`).

### Inputs that affect output
Read from request body in `analyze-resume/index.ts:328-342`:
- `resumeText` (string, sliced to 100KB) — primary
- `targetRole` (200 chars)
- `targetIndustry` (200 chars)
- `previousSuggestions` (array — used to compute `incorporatedSuggestions`, `analyze-resume/index.ts:401-408`)
- `previousScore` (number — folded into improvement context)
- Tier (server-derived from `userContext.tier`)
- Heuristics derived from `resumeText`: `wordCount`, `bulletCount`, `numberCount`, `hasEducation`, `hasSkillsSection`, `experienceYears`
- Note: there is a `resumeHash` computed at `analyze-resume/index.ts:389-392` (32-bit fold) but it is NEVER consumed downstream — dead code, ripe for cache-key reuse.

### Persist path
`analyze-resume/index.ts:459-463, 549-553, 580-584, 626-630, 700-705, 726, 859, 971, 1053, 1129, 1272-1290, 1361-1382` — every successful path runs:
```
supabase.from('resumes').update({
  overall_score: result.overallScore,
  grading_data: result,        // full analysis JSON
  analyzed_at: new Date().toISOString(),
}).eq('id', resumeId);
```
Row owner: `resumes.user_id`. Timestamp: `analyzed_at`. Analysis ID = `resumes.id` (mutated in place — score history preserved separately).

**Score history:** `resume_score_history` table (`supabase/migrations/20251224161624_d56bafae-e00a-4414-95f3-55d204f730b9.sql:2-8`) holds `id, user_id, resume_id, score, recorded_at`. Inserted by frontend after streaming completes (see `src/hooks/useScoreHistory.ts`).

**Critical bug for v3.0:** Resume Analysis does NOT insert a row into `analysis_results`. Cross-feature consumers (e.g. `RecruitingLens.tsx:276-298` legacy fallback) and AnalysisHistory's `analysis_type='resume_analysis'` lookup never see new data; only legacy MinimalHero rows.

### History read path
- `/results/:id` (`src/pages/Results.tsx:206, 281, 369`) reads `resumes` by id, plus realtime subscription on `resumes` UPDATE events (`Results.tsx:378-393`).
- AnalysisHistory routes resume_analysis usage rows to `/results/{matched_resume_id}` via timestamp proximity (`AnalysisHistory.tsx:277-280`).

### Cache infrastructure
None. `resumes.file_hash` (SHA-256, `Upload.tsx:143-148, 175`) provides file-byte dedup at upload time only. Re-uploading the same PDF returns existing `resumes.id`; uploading a modified PDF or running with different `targetRole`/`previousScore` always re-runs Claude.

### OCR/PDF normalization
- Client first: `extractPDFText` from `src/lib/extract-pdf-text.ts`.
- Fallback: `ocr-pdf` edge function (`supabase/functions/ocr-pdf/index.ts`) — Claude vision per page, `model=FREE_MODEL`, `maxTokens=3000`, returns concatenated text. **No persistence in ocr-pdf.**
- Resume text is **never persisted**. v3.0 must add `resumes.extracted_text` (or a `text_hash`) for deterministic cache fingerprints.

---

## Feature 2 — LinkedIn Grader

### Analyze entry point
- `supabase/functions/grade-linkedin/index.ts` (645 lines). Single synchronous endpoint — no async queue.
- Pro/Elite get 1 free scan per billing cycle via `user_merits.free_linkedin_scan_used` flag (`grade-linkedin/index.ts:259-267, 339-344`).

### Inputs that affect output
Read at `grade-linkedin/index.ts:219-221, 379-385`:
- `profileContent` (string, truncated to 12000 chars; sanitized via `sanitizeUserContent`)
- `profileUrl` (used for `profile_identifier` extraction at `grade-linkedin/index.ts:27-30`)
- `followUpContext` (JSON of previous `linkedin_grades.grading_data`, sliced to 2000 chars, `grade-linkedin/index.ts:250-253`) — **previous grade affects new grade output**, breaks naive content-only caching
- Tier (server-derived; controls `LINKEDIN_MAX_TOKENS` `grade-linkedin/index.ts:124-128` and prompt variant via `loadPromptVariant('linkedin', tier, {})`)

### Persist path
`grade-linkedin/index.ts:272-282, 578-588`:
```
linkedin_grades.insert({
  user_id, profile_url, profile_identifier,
  overall_score: parsed.rawScore,
  grading_data: parsed,        // full grade JSON
})
```
Schema (`supabase/migrations/20251129_create_all_tables.sql:48-57` + `20251223075804_*.sql` adding `user_id` FK + `20260410235959_*.sql` dropping unique on profile_identifier): `id, user_id, profile_url, profile_identifier, overall_score, grading_data jsonb, created_at, updated_at`. Owner-scoped RLS (`20251223075804_*.sql:9-22`).

### History read path
- `/linkedin-grader?id=<grade_id>` deep-link hydration: `LinkedInGrader.tsx:159-194` — `linkedin_grades.select('*').eq('id', idFromUrl).maybeSingle()`, validates via `isV3Grade(data.grading_data)`.
- Mount-time auto-load: cycle-scoped fetch at `LinkedInGrader.tsx:264-279` (Pro/Elite) or last-row fetch at `:230-247` (Free).
- AnalysisHistory routes `linkedin_grading` usage rows to `/linkedin-grader?id=<matched_id>` via proximity match (`AnalysisHistory.tsx:282-284`).

### Cache infrastructure
None. Every call hits Claude. Each scan inserts a new `linkedin_grades` row — multiple grades per user persist forever.

### OCR/PDF normalization
- Onboarding LinkedIn PDF stored as text on `profiles.linkedin_pdf_content` (`Onboarding.tsx:309`). **LinkedInGrader page does NOT auto-pull this** — current page accepts pasted profile content via input. v3.0 spec requires auto-pull of onboarding LinkedIn PDF; this is a frontend wiring gap.

---

## Feature 3 — Career Compass

### Analyze entry point
- `supabase/functions/analyze-career/index.ts` (1553 lines). Sync direct path with optional async queue (`submit-career-analysis-job` + `process-career-analysis-job`).
- 4 sub-paths (`analyze-career/index.ts:519-655`):
  1. **Free single-call** (sources from prior Resume Analysis + LinkedIn Grade; 412 if either missing — line 568-579)
  2. **Pro/Elite short-circuit** when both priors exist (line 654-789) — reuses prior-analyses prompt, skips PDF re-parse
  3. **Pro/Elite full PDF parse + parallel fan-out** (line 791-1012) — 2 parallel calls (`base` + Elite-only `elite-extras`)
  4. **Multi-role comparison** (`compareRoles[]>=2`, line 642-644)

### Inputs that affect output
- `resumeFilePath` + `resumeTextContent` (`analyze-career/index.ts:483`) — resume text downloaded from Storage when `resumeTextContent.length < 100`
- `linkedinPdfContent` (string)
- `linkedinUrl` (must contain `linkedin.com/in/`)
- `compareRoles` (string[]) — multi-role mode
- `existingAnalysis` (Record) — for re-shape calls
- `allowResumeOnly` (boolean) — bypasses 412 `linkedin_prior_missing` gate (line 593)
- Tier (server-derived)
- Prior `grading_data` from `resumes` and `linkedin_grades` (Phase 22-03 cross-feature memory, `analyze-career/index.ts:539-555`) — read latest by `user_id`, fed into prompt

### Persist path
`analyze-career/index.ts:732-744, 960-967, 1490-1497`:
```
analysis_results.insert({
  user_id,
  analysis_type: 'career_compass',
  primary_score: careerReadinessScore || readinessScore || 0,
  key_insights: whatYouHave || [],
  raw_response: <full analysis>,
})
```
Inserted by all paths (Free single-call, Pro/Elite short-circuit, Pro/Elite full, legacy MIG-05 fallback at line 1488-1510). Async-queue worker (`process-career-analysis-job`) updates `analysis_jobs` only — actual persistence happens inside the inner analyze-career call it triggers.

### History read path
- Mount-time most-recent: `CareerCompass.tsx:209-216` — `analysis_results.select('*').eq('user_id', user.id).eq('analysis_type','career_compass').order('created_at',desc).limit(1).maybeSingle()`.
- `/career-compass?id=<analysis_id>` deep-link: `CareerCompass.tsx:267-309` — exact-id fetch with shape guard requiring `careerFields`, `roles`, `roadmap`, `careerDNA`. **If new prompt drops any of these the hydration silently bails to a "Couldn't load this analysis" toast** — likely root cause of the v3.0 Pro/Elite empty-fields bug.
- AnalysisHistory routes via proximity match against `careerCompassResults` query (`AnalysisHistory.tsx:285-288`).

### Cache infrastructure
None. Every call hits Claude. The Phase 22-03 "cross-feature memory" reuse (lines 654-789) is a prompt-input optimization (skips PDF parse, feeds prior JSON directly) — it still calls Claude.

### OCR/PDF normalization
- Resume PDF: server-side `extractPDFText` after downloading from Storage (`analyze-career/index.ts:797-799, 1081`). Also handles DOCX text extraction inline at line 1085-1099.
- LinkedIn PDF text: arrives via `linkedinPdfContent` body field (already extracted client-side). Frontend reads from `profiles.linkedin_pdf_content` if onboarded (`CareerCompass.tsx:226`).

---

## Feature 4 — Recruiting Lens

### Analyze entry point
- `supabase/functions/recruiting-lens/index.ts` (423 lines). Sync direct only. 3-call parallel fan-out (`rl-call-1/2/3`, `recruiting-lens/index.ts:27-35`). Pro=8K tokens, Elite=20K tokens.
- 403 `pro_or_elite_required` for Free tier (`recruiting-lens/index.ts:189-194`).
- Async fallback into `analysis_jobs` with `job_type='recruiting_lens'` only on full-overload (line 329-340) — **no `process-recruiting-lens-job` worker exists**. `process-resume-analysis-job` filters `job_type='resume_analysis'`; `process-career-analysis-job` filters `job_type='career_compass_analysis'`. Async-queued recruiting-lens jobs are orphaned dead code.

### Inputs that affect output
Read at `recruiting-lens/index.ts:167-170`:
- `resumeSummary` (string ≤5000 chars; sanitized)
- `jobDescription` (string ≤3000 chars; sanitized)
- `linkedinText` (string ≤4000 chars, optional; sanitized)
- Tier (server; controls `CALL_CONFIGS` token caps + persistence gating)
- `currentDate` (line 223)

### Persist path
**Elite only** (`recruiting-lens/index.ts:273-285, 377-403`):
```
analysis_results.insert({
  user_id,
  analysis_type: 'recruiting_lens',
  primary_score: merged.overallMatch?.score ?? 0,
  key_insights: [recruiterVerdict, topGaps[0].title, biggestScoreMover],
  raw_response: { ...merged, metadata: { jobDescription, analysisDate, tier } },
  source_reference: null,
})
```
- **Pro tier writes nothing.** Pro user has zero history beyond a `usage_tracking` row.
- **No `saved_jobs` insert anywhere.** v3.0 spec says Recruiting Lens results should persist to Saved Jobs with company + role; this is unimplemented — `grep -r saved_jobs supabase/functions/` returns nothing.

### History read path
- Mount-time: `RecruitingLens.tsx:252-263` reads latest `resumes` for default summary; if no `resumes.grading_data`, falls back to legacy `analysis_results` for `analysis_type='resume_analysis'` (line 276-298) — **but Resume Analysis no longer writes there.**
- `/recruiting-lens?id=<run_id>` deep-link: `RecruitingLens.tsx:322-361` — `analysis_results.select('*').eq('id', idFromUrl).eq('analysis_type','recruiting_lens')`. Pro tier hits "This analysis wasn't saved — run a fresh match" toast (line 339).
- AnalysisHistory routes recruiting_lens to `/recruiting-lens?id=<id>` if proximity match finds an Elite row, else falls back to base route (`AnalysisHistory.tsx:289-293`, comment "Pitfall 6: Pro tier has no analysis_results row").

### Cache infrastructure
None. Every Pro/Elite call hits Claude.

### OCR/PDF normalization
- Resume context: built from prior `resumes.grading_data` summary or legacy `analysis_results.raw_response` (`RecruitingLens.tsx:267-298`). No fresh PDF re-parse.
- LinkedIn: client-side `extractPDFText(file)` on upload (`RecruitingLens.tsx:368`). NOT pulled from `profiles.linkedin_pdf_content` automatically — frontend gap vs v3.0 spec.
- JD: company + role + JD inputs are **not currently mandatory in the request validation** — `recruiting-lens/index.ts:172-183` only requires `resumeSummary` and `jobDescription` ≥50 chars. v3.0 spec mandates company + role; backend signature must add them.

---

## Feature 5 — Interview Prep

### Analyze entry point
- **Generate:** `supabase/functions/interview-prep-analyze/index.ts` (672 lines). Single Claude call. Variants (`interview-prep-analyze/index.ts:169-174`):
  - Free → 403 `pro_or_elite_required`
  - Pro → variant=`pro`, mode=flashcard, `maxTokens=5000`
  - Pro + `elite_taste_request:true` → variant=`elite_taste` (1/month quota check at line 199-218)
  - Elite → variant=`elite`, mode=quiz, `maxTokens=10000` (3/day cap check at line 221-244)
- **Evaluate (Elite quiz scoring):** `supabase/functions/interview-prep-evaluate/index.ts` (350 lines) — separate function for grading user-submitted answers.
- **Production failure** (per PROJECT.md): function returns 503 after successful OCR + Claude call (TTFB 8.91s); cause unclear. Suspected response-handler / CORS / streaming path issue around `interview-prep-analyze/index.ts:648-665` (`jsonResponse` wrapping a large payload via Response constructor).

### Inputs that affect output
Zod-validated `IntakeFormSchema` (`supabase/functions/_shared/types/interviewPrep.ts`), all 9 fields consumed in prompt + INSERT:
- `job_description` (text, required)
- `background_context` (text ≤1500, optional)
- `role_title` (text, optional)
- `company` (text, optional)
- `interview_type` (`behavioral|technical|mixed_panel|executive`)
- `question_categories` (text[] ≥1)
- `difficulty` (`entry|mid|senior|staff_plus`)
- `duration` (`15|30|45|60` minutes — drives quiz item count: 5/5/6/7)
- `format` (`written|voice_style|mixed`)
- `elite_taste_request` (bool; only honored for Pro)
- Resume text (server fetches latest analyzed resume PDF + extracts via `extractPDFText`, `interview-prep-analyze/index.ts:248-294`)
- Tier + variant (server-derived)

### Persist path
1. **`interview_quizzes` INSERT** (`interview-prep-analyze/index.ts:497-516`) — schema in `supabase/migrations/20260418000000_interview_prep_tables.sql:23-45`:
   - `id, user_id, mode (flashcard|quiz), tier (pro|elite|elite_taste), job_description, job_title, company, resume_id, overall_score, evaluated_at, merit_transaction_id`
   - + 9 intake columns (`interview_type, question_categories, difficulty, duration, format, background_context, role_title, readiness_score`)
   - `created_at`
2. **`interview_quiz_answers` INSERT** (`interview-prep-analyze/index.ts:525-538`) — **quiz variants only** (Elite + elite_taste). One row per question with `quiz_id, question_order, question_text, competency`. Answer/score columns filled later by `interview-prep-evaluate`.
3. **`interview_streaks` UPSERT** (`interview-prep-analyze/index.ts:549-598`) — **Elite variant only**. One row per user; tracks `current_streak, longest_streak, quizzes_today, last_quiz_at`. Schema in same migration `20260418000000_*.sql:67-75`.
4. **`record_ai_usage` RPC** (`interview-prep-analyze/index.ts:602-610`) writes `usage_tracking` row.

### History read path
- `interview_quizzes.select` queries: AnalysisHistory uses proximity match (`AnalysisHistory.tsx:295-298`) to route to `/interview-prep?id=<quiz_id>`.
- **Bug:** `src/pages/InterviewPrep.tsx` (547 lines) has NO `?id=` deep-link hydration — clicking a past quiz from Activity History lands on the form, not the past content. Search for `searchParams|useSearchParams|interview_quizzes` in `InterviewPrep.tsx` returns zero matches.
- v3.0 must add a quiz/flashcard read-back UI keyed by `interview_quizzes.id`.

### Cache infrastructure
None. Every generate hits Claude.

### OCR/PDF normalization
- Server-side `extractPDFText` of latest analyzed `resumes.file_path` (`interview-prep-analyze/index.ts:248-294`). Resume text NOT persisted on the quiz row — only `readiness_score` is. v3.0 cache fingerprint must include the resume text hash, which means resume text persistence is a prerequisite.

---

## Supporting tables and selectors (cross-feature)

### `resumes` table
- Migration: `supabase/migrations/20251129_create_all_tables.sql:19-33` (canonical) + later additions
- Columns: `id uuid PK, user_id uuid FK, file_name, file_url, file_path, file_hash, file_size, overall_score, grading_data jsonb, analyzed_at, created_at, updated_at`
- Latest-resume selector (used everywhere): `from('resumes').eq('user_id', uid).not('grading_data','is',null).order('analyzed_at',desc).limit(1)` — see `analyze-career/index.ts:539-547`, `interview-prep-analyze/index.ts:248-255`, `RecruitingLens.tsx:256-263`.
- One row per uploaded PDF; mutated in place on each analyze.
- RLS owner-scoped (migration `20251129_create_all_tables.sql:106-128`).

### `linkedin_grades` table
- Schema (final): `id uuid PK, user_id uuid FK, profile_url, profile_identifier, overall_score, grading_data jsonb, created_at, updated_at`
- `profile_identifier` UNIQUE constraint dropped in `supabase/migrations/20260410235959_linkedin_grades_drop_unique_identifier.sql` to allow multi-user grading.
- Latest-grade selector: `from('linkedin_grades').eq('user_id', uid).order('created_at',desc).limit(1)` — see `analyze-career/index.ts:548-554`, `grade-linkedin/index.ts:243-247, 455-461`.
- Multiple rows per user; never updated, only inserted.

### `analysis_results` table
- Migration: `supabase/migrations/20251222223116_8abce0df-2f95-472e-a9e5-dca9a6d69c53.sql` + analysis_type enum extensions in `20260409000000_*` (recruiting_lens), `20260411000000_*` (interview_prep)
- Columns: `id, user_id, analysis_type, primary_score, key_insights jsonb, raw_response jsonb, source_reference text, created_at`
- MIG-02 lock makes user JWTs SELECT-only (`20260420000000_*.sql:27`). Service role inserts.
- Currently written by: `analyze-career` (all paths), `recruiting-lens` (Elite only). NOT written by `analyze-resume`, `grade-linkedin`, or `interview-prep-analyze`.

### `saved_jobs` table
- Migration: `supabase/migrations/20251129_create_all_tables.sql:60-75`
- Columns: `id, user_id, job_id text, title, company, location, salary, url, description, posted, match_score, why_match, created_at`
- Read by `src/pages/Jobs.tsx`. **No edge function inserts to it.** v3.0 spec: Recruiting Lens should persist run summary here.

### `interview_quizzes` / `interview_quiz_answers` / `interview_streaks`
- Migration: `supabase/migrations/20260418000000_interview_prep_tables.sql`
- See Feature 5 above.
- RLS: SELECT-own; service-role-only writes (lines 174-195).

### `analysis_jobs` table (async queue)
- Migration: `supabase/migrations/20260225160000_add_analysis_jobs_queue.sql` + `20260225222000` (career) + `20260409000001` (recruiting_lens) + `20260429000000` (`merit_transaction_id`)
- `job_type` CHECK: `('resume_analysis','career_compass_analysis','recruiting_lens')`
- `recruiting_lens` rows are **orphaned** — no worker function consumes them.

### `usage_tracking` table
- Migration: `supabase/migrations/20251222220418_b52662bb-5e0f-4847-bc53-d848d159e2c2.sql`
- Action types include all 5 feature names. Read by Activity History and `useAiCredits`.
- Currently the **only** universally-written audit row across all 5 features.

### Onboarding LinkedIn PDF storage
- `profiles.linkedin_pdf_content text` (migration `supabase/migrations/20251227213103_97ca2e4f-114a-4926-abfc-877c587375aa.sql`)
- `profiles.linkedin_pdf_filename text` (migration `supabase/migrations/20251229075420_b8a1a6bc-dc8c-461e-b7e3-69b0251aaf69.sql`)
- Written: `src/pages/Onboarding.tsx:309-310` (raw text from `extractPDFText`)
- Read by: `src/pages/CareerCompass.tsx:196` (auto-pulled into form)
- **NOT read by:** `LinkedInGrader.tsx`, `RecruitingLens.tsx`, `InterviewPrep.tsx` (v3.0 wiring gap)

### `resume_score_history` table
- Migration: `supabase/migrations/20251224161624_d56bafae-e00a-4414-95f3-55d204f730b9.sql:2-8`
- Columns: `id, user_id, resume_id FK, score, recorded_at`
- Inserted client-side after streaming success; powers score-trend charts.

---

## Bugs and gaps flagged for v3.0

1. **Resume Analysis writes only to `resumes.grading_data` — no `analysis_results` row.** Cross-feature consumers (`RecruitingLens.tsx:276-298` legacy fallback) and AnalysisHistory's `analysis_type='resume_analysis'` lookup never hit. v3.0 should either (a) add a parallel `analysis_results` insert in `analyze-resume`, or (b) move all features to a unified history table.
2. **Recruiting Lens Pro tier persists nothing.** History click silently degrades to base route. v3.0 must persist Pro runs (target: `analysis_results` AND `saved_jobs`).
3. **Recruiting Lens has zero `saved_jobs` integration.** `saved_jobs.match_score` column exists for this but no edge code uses it.
4. **Recruiting Lens async fallback at `recruiting-lens/index.ts:329-340` orphans jobs** — `job_type='recruiting_lens'` is allowed in `analysis_jobs` but no worker consumes it. Fallback path is dead code in production.
5. **InterviewPrep page lacks `?id=` hydration.** AnalysisHistory routes to `/interview-prep?id=<quiz_id>` but the page ignores it.
6. **Interview Prep returns 503 in production** after successful OCR + Claude call. Investigate response handler at `interview-prep-analyze/index.ts:648` (`jsonResponse` wrapping a large payload) and CORS preflight in `_shared/cors.ts`.
7. **No exact-input cache exists for any feature.** Every analyze → Claude. Per-file dedup via `resumes.file_hash` is upload-only and ignores tier or other inputs.
8. **Resume text is never persisted.** `resumes.file_hash` ≠ text hash. v3.0 cache fingerprint requires deterministic text fingerprints for Resume + LinkedIn + Recruiting Lens.
9. **Onboarding LinkedIn PDF only auto-pulled by CareerCompass.** LinkedIn Grader and Recruiting Lens must wire `profiles.linkedin_pdf_content` per v3.0 spec.
10. **AnalysisHistory ±5min timestamp-proximity match (`AnalysisHistory.tsx:255-269`) is fragile.** Two analyses within 5 min collide; Pro Recruiting Lens has no candidate row at all. v3.0 should add an explicit `analysis_id` reference column to `usage_tracking`, or write every feature to one canonical history table.
11. **`analyze-resume/index.ts:389-392` `resumeHash` is dead code** — computed but never used. Could be repurposed into the cache key.
12. **Career Compass v3.0 Pro/Elite empty-fields bug likely caused by `CareerCompass.tsx:267-309` shape guard.** Hydration requires `careerFields/roles/roadmap/careerDNA` all present; if the new prompt drops any, hydration silently bails to a "Couldn't load this analysis" toast even though the row was persisted.
13. **`linkedin_grades` follow-up context coupling** — `grade-linkedin/index.ts:250-253` feeds the previous grade JSON into every new prompt. Cache fingerprints must include "previous grade present? which one?" or the same `(profileContent, tier)` will produce different outputs across calls.
