---
phase: 29
plan: 08
subsystem: cache-fingerprint-wiring
tags: [phase-29, cache, edge-handler, ocr, CACHE-03, NFR-05, NFR-06]
requirements: [CACHE-03, NFR-05, NFR-06]
dependency_graph:
  requires:
    - 29-02  # resumes.extracted_text + text_hash columns
    - 29-05  # _shared/cache-fingerprint.ts sha256Hex export
  provides:
    - "resumes.text_hash deterministically populated on every analyze-resume sync-path success and every ocr-pdf success that supplies resumeId"
    - "T-29-OCR-CROSSWRITE mitigation in place at both call sites (user_id-scoped UPDATEs)"
  affects:
    - "supabase/functions/analyze-resume/index.ts"
    - "supabase/functions/ocr-pdf/index.ts"
tech_stack:
  added: []   # no new deps — only imports of helpers shipped in wave 1
  patterns: ["service-role UPDATE with user_id auth-scope filter", "swallow-and-log persist failures (D-08 / NFR-06)"]
key_files:
  created: []
  modified:
    - "supabase/functions/analyze-resume/index.ts"
    - "supabase/functions/ocr-pdf/index.ts"
decisions:
  - "Used `normalizedText` (the post-`replace(/\\s+/g, ' ').trim()` form) as the value persisted to `resumes.extracted_text` and hashed for `text_hash`. This matches the input that was fed into the Claude call and is the value Phase 37 will need to hash for the resume cache fingerprint."
  - "Issued a second `.update()` after the existing analyze-resume UPDATE rather than mutating the existing payload, so the diff is reviewable and the new behavior cannot accidentally regress the existing overall_score / grading_data write."
  - "Implemented the T-29-OCR-CROSSWRITE mitigation here (Phase 29 sub-mitigation, not deferred to Phase 36). Both UPDATEs filter by `.eq('user_id', <authenticated user>)` — analyze-resume uses `usageUserId` when set; ocr-pdf uses `userContextOcr.userId`."
  - "Out-of-scope: stream-path and fallback-path UPDATEs in analyze-resume (lines ~1271 fallback and any stream-emit path). Plan explicitly scopes this to the FINAL synchronous-path success only. Phase 37 will revisit when feature caching is wired; until then, those branches will leave `text_hash` NULL on that specific request (the next sync run repopulates)."
metrics:
  duration: "single-session execution"
  tasks_completed: 2
  files_modified: 2
  commits: 2
  completed: "2026-05-12"
---

# Phase 29 Plan 08: Wire CACHE-03 — analyze-resume + ocr-pdf resumes.text_hash persistence

CACHE-03 was the last unfilled requirement in Phase 29 wave 2 — the two
edge functions that touch resume text now persist `extracted_text` and
`text_hash` to the `resumes` row, so Phase 37's resume cache fingerprint
is deterministic the moment it ships.

## What changed

### Task 1 — `supabase/functions/analyze-resume/index.ts` (commit `797dd7a`)

- Added `import { sha256Hex } from '../_shared/cache-fingerprint.ts'`
  next to the existing `_shared` imports (line 15).
- Deleted **two** copies of the dead 32-bit `resumeHash` fold:
  - Merit-path copy at the original 389-392 site (plan-called).
  - Legacy / non-merit-path copy at the original ~786 site (plan
    targeted only the first; the duplicate was discovered during the
    verify-gate regex check — see Deviations).
  - Surrounding `wordCount` / `bulletCount` / `numberCount` /
    `hasEducation` / `hasSkillsSection` / `experienceYears` declarations
    are preserved verbatim.
- Inserted a second `resumes` UPDATE immediately after the existing
  synchronous-path final-success UPDATE (the one at the original
  line ~1360 that writes `overall_score` / `grading_data` /
  `analyzed_at`). The new UPDATE writes
  `{ extracted_text: normalizedText, text_hash: await sha256Hex(normalizedText) }`
  and is wrapped in `try { ... } catch { console.error('[analyze-resume] resumes text persist failed', persistError) }`.
- Auth-scope chain: the new UPDATE filters `.eq('id', resumeId)` AND,
  when `usageUserId` is set, also `.eq('user_id', usageUserId)`. When
  `usageUserId` is null (internal worker path) the scope falls back to
  id-only — matching the existing UPDATE's trust model.

**UPDATE site extended:** original lines 1359-1372 (the
`// Update resume record with analysis` block). Persist block sits
between that UPDATE and `log.info('analysis-complete', ...)`.

### Task 2 — `supabase/functions/ocr-pdf/index.ts` (commit `f298853`)

- Added `import { getServiceClient } from '../_shared/supabase-client.ts'`
  and `import { sha256Hex } from '../_shared/cache-fingerprint.ts'`.
- Extended the request-body destructure from `const { images } = await req.json();`
  to `const { images, resumeId } = await req.json();`.
- Inserted a persist block between the `fullText` computation
  (`const fullText = extractedTexts.join('\\n\\n--- Page Break ---\\n\\n').trim();`)
  and the success Response return. The block runs only when
  `resumeId && typeof resumeId === 'string' && fullText.length > 0`.
- Auth-scope chain: `.eq('id', resumeId).eq('user_id', userContextOcr.userId)`.
- Success Response shape is unchanged: `{ text: fullText, pageCount: images.length }`.
- All existing imports / `requireAuth` / `corsHeaders` /
  `handleOptionsRequest` / `checkRateLimit` / `invokeAnthropicText`
  invocations are preserved verbatim (NFR-05).

## Threat IDs mitigated

| Threat ID | Disposition | Mitigation landed here |
|-----------|-------------|------------------------|
| T-29-OCR-CROSSWRITE | mitigate | YES — both modified UPDATEs filter by `user_id` of the authenticated caller. Phase 29 sub-mitigation closed; no follow-up needed in Phase 36. |
| T-29-NFR05-REGRESSION | mitigate | YES — verified via grep that `requireAuth`, `corsHeaders`, `handleOptionsRequest`, `checkRateLimit`, `withMerits` invocation counts are unchanged across both files. |
| T-29-PERSIST-FAIL | mitigate | YES — both persist sites are wrapped in try/catch; persist errors are logged and the analysis/OCR Response is returned regardless. D-08 / NFR-06. |

## Plan acceptance criteria

| Criterion | Status |
|-----------|--------|
| `analyze-resume/index.ts` no longer contains the regex `const resumeHash = resumeText\.split\(''\)\.reduce` | PASS (grep: 0 matches; both copies removed) |
| Surrounding `wordCount` / `bulletCount` / `hasEducation` declarations remain | PASS |
| `import { sha256Hex } from '../_shared/cache-fingerprint.ts'` added | PASS |
| `sha256Hex(` called in proximity to a `resumes` UPDATE on the sync-path final-success branch | PASS (line 1386) |
| File contains `extracted_text` and `text_hash` properties in a `.update({...})` call on `resumes` | PASS |
| File contains the persist failure log `'resumes text persist failed'` | PASS |
| Existing `requireAuth` / `corsHeaders` / `handleOptionsRequest` / `checkRateLimit` / `withMerits` counts unchanged | PASS (25, unchanged) |
| `ocr-pdf/index.ts` contains `import { getServiceClient }` from `_shared/supabase-client.ts` | PASS |
| `ocr-pdf/index.ts` contains `import { sha256Hex }` from `_shared/cache-fingerprint.ts` | PASS |
| `ocr-pdf/index.ts` destructure reads `resumeId` from the request body | PASS |
| `ocr-pdf/index.ts` `.update({` includes `extracted_text` and `text_hash` | PASS |
| `ocr-pdf/index.ts` contains the persist failure log `'resumes text persist failed'` | PASS |
| `ocr-pdf/index.ts` still contains `requireAuth(` and `handleOptionsRequest(` | PASS |
| Success Response shape `{ text: fullText, pageCount }` unchanged | PASS |

## must_haves.truths

- `analyze-resume/index.ts` no longer contains the dead 32-bit `resumeHash` fold at line ~389 → **TRUE** (and also removed at ~786, see Deviations).
- On successful resume analysis, `analyze-resume` UPDATEs `resumes.extracted_text` + `resumes.text_hash` with the analyzed content and its SHA-256 → **TRUE** (synchronous-path final-success branch).
- `ocr-pdf/index.ts` accepts a `resumeId` param in the request body and UPDATEs `resumes.extracted_text` + `text_hash` when present → **TRUE**.
- Both edge handlers swallow `resumes` UPDATE failures (warn-log; do not block the response — D-08 / NFR-06) → **TRUE**.
- Existing CORS / requireAuth / rate-limit / sanitizer behavior is unchanged (NFR-05) → **TRUE**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 – Plan-gate compliance] Deleted the duplicate dead `resumeHash` fold in the legacy (non-merit) branch**

- **Found during:** Task 1, post-edit grep verification.
- **Issue:** The plan called out the dead 32-bit `resumeHash` block at lines 389-392 (merit path) only, but the **same** dead block also existed at lines 786-789 in the legacy / non-merit path. The plan's automated verify-gate uses the regex `const resumeHash = resumeText\.split\(''\)\.reduce`, which would FAIL while the second copy survived.
- **Fix:** Deleted the second copy with the same rationale documented in the plan and `.planning/codebase/CONCERNS.md` ("structurally unused downstream"). Verified via grep that no other read of `resumeHash` exists in the file — both copies were dead, not just the one called out.
- **Files modified:** `supabase/functions/analyze-resume/index.ts`
- **Commit:** `797dd7a`

**No other deviations.** All other edits followed the plan exactly.

## Auth Gates

None — both edge functions kept their pre-existing `requireAuth` / `requireInternalOrUserAuth` invocations untouched.

## Known Stubs

None.

## Threat Flags

None — no new network surface, auth path, or schema surface introduced. The two edge handlers retain their existing auth + CORS posture, and the new UPDATEs both apply a defensive `user_id` filter on top of the existing trust model.

## Validation pointers (deferred to Plan 29-10)

- Upload a sample resume to staging via the OCR path → assert `resumes.extracted_text` and `resumes.text_hash` are populated.
- Re-upload the same PDF → assert `text_hash` is **identical** (CACHE-03 manual QA per `29-VALIDATION.md`).
- Trigger `analyze-resume` on the synchronous path → assert the row's `text_hash` matches `sha256Hex(normalizedText)`.

## Self-Check: PASSED

- Files modified:
  - `supabase/functions/analyze-resume/index.ts` — FOUND (verified via grep, all required tokens present).
  - `supabase/functions/ocr-pdf/index.ts` — FOUND (verified via grep, all required tokens present).
- Commits:
  - `797dd7a` (Task 1) — FOUND in git log.
  - `f298853` (Task 2) — FOUND in git log.
- Plan automated verify gates:
  - Task 1 regex check (`const resumeHash = resumeText\.split\(''\)\.reduce`) → 0 matches.
  - Task 1 required tokens (`sha256Hex`, `extracted_text`, `text_hash`, `'resumes text persist failed'`) → all present.
  - Task 2 required tokens (`getServiceClient`, `sha256Hex`, `resumeId`, `extracted_text`, `text_hash`, `'resumes text persist failed'`, `requireAuth`, `handleOptionsRequest`) → all present.
