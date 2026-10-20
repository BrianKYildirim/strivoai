---
phase: 51-cost-optimized-document-extraction
plan: 51
subsystem: api
tags: [supabase, deno, document-extraction, ocr, react, pdf, postgres]
requires:
  - phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf
    provides: historical extraction scaffolding superseded by Phase 51
provides:
  - Parser-first extraction contract with deterministic cheap OCR ordering
  - Literal Elite-only Claude OCR fallback policy
  - User-scoped accepted-text reuse by document identity and extraction version
  - Concise extraction metadata and generic user-facing failure copy
affects: [resume-analysis, linkedin-grader, career-compass, recruiting-lens, interview-prep, document-extraction]
tech-stack:
  added: []
  patterns:
    - Backend-owned OCR policy object
    - Configuration-gated provider adapters
    - Document identity extraction reuse
key-files:
  created:
    - supabase/functions/_shared/mistral-ocr-client.ts
    - supabase/functions/_shared/mistral-ocr-client.test.ts
    - supabase/functions/_shared/textract-client.ts
    - supabase/functions/_shared/textract-client.test.ts
    - supabase/migrations/20260607040000_phase51_document_extraction_identity.sql
  modified:
    - supabase/functions/_shared/document-extraction.ts
    - supabase/functions/_shared/document-extraction-types.ts
    - supabase/functions/_shared/document-persistence.ts
    - supabase/functions/_shared/document-quality.ts
    - supabase/functions/_shared/pdf-parser.ts
    - supabase/functions/ocr-pdf/index.ts
    - src/lib/document-extraction.ts
    - src/integrations/supabase/types.ts
    - src/pages/Upload.tsx
    - src/pages/LinkedInGrader.tsx
    - src/pages/CareerCompass.tsx
    - src/pages/RecruitingLens.tsx
key-decisions:
  - "Keep browser pdf.js as the accepted parser path; backend raw-byte PDF parsing is no longer an accepted primary path."
  - "Resolve literal subscription_tier inside ocr-pdf for Claude OCR policy instead of trusting normalized frontend or requireAuth tier state."
  - "Persist document_hash and extraction_version alongside accepted text; keep text_hash as the extracted-text fingerprint."
patterns-established:
  - "Provider routing order is pdf_parser, ollama, mistral, textract, then claude_ocr only when allowClaudeOcr is true."
  - "Provider metadata is serialized through a strict allowlist and normal UI copy remains provider-agnostic."
requirements-completed: []
duration: 1h 40m
completed: 2026-06-07
---

# Phase 51: Cost-optimized Document Extraction Summary

**Parser-first PDF extraction with user-scoped document reuse, cheap OCR adapters, and literal Elite-only Claude fallback**

## Performance

- **Duration:** ~1h 40m
- **Started:** 2026-06-07T03:00:55Z
- **Completed:** 2026-06-07
- **Tasks:** 10 plan tasks covered
- **Files modified:** 26 tracked/untracked files

## Accomplishments

- Replaced Phase 50 provider labels and routing assumptions with stable Phase 51 labels: `pdf_parser`, `ollama`, `mistral`, `textract`, `claude_ocr`.
- Added a backend extraction policy object with `allowClaudeOcr` computed from literal backend `subscription_tier === "elite"` in `ocr-pdf`.
- Added Mistral and Textract OCR adapters behind explicit env/config gates; missing config returns concise reason codes and continues the chain.
- Added accepted-text lookup/persistence by `user_id + document_hash + document_type + extraction_version`, with additive nullable schema columns.
- Removed backend raw-byte/regex PDF parsing as an accepted primary path; server-side direct parser now fails controlled unless browser parser text is supplied through `ocr-pdf`.
- Hardened generic document quality gates and normalized UI failure copy to avoid provider metadata exposure.
- Updated focused Deno and Vitest tests for provider order, tier policy, metadata allowlisting, reuse, caller drift, and adapter config gates.

## Task Commits

No git commits were created. Repository instructions prohibit committing `.planning/`, and this workflow writes `.planning` artifacts.

## Files Created/Modified

- `supabase/functions/_shared/document-extraction-types.ts` - Phase 51 extraction version, provider labels, and backend policy metadata contract.
- `supabase/functions/_shared/document-extraction.ts` - parser-first orchestration, cheap OCR chain, and Elite-only Claude fallback.
- `supabase/functions/_shared/mistral-ocr-client.ts` - config-gated Mistral OCR adapter.
- `supabase/functions/_shared/textract-client.ts` - config-gated Textract adapter.
- `supabase/functions/_shared/document-persistence.ts` - accepted-text lookup and persistence by document identity.
- `supabase/functions/_shared/document-quality.ts` - generic document-likeness quality gate.
- `supabase/functions/_shared/pdf-parser.ts` - removed raw-byte accepted parsing and direct Claude fallback.
- `supabase/functions/ocr-pdf/index.ts` - trusted tier policy, reuse lookup, generic failure copy, LinkedIn persistence support.
- `supabase/migrations/20260607040000_phase51_document_extraction_identity.sql` - additive identity columns and indexes.
- `src/lib/document-extraction.ts` - document hash propagation, `pdf_parser` metadata, backend fallback identity payload.
- `src/pages/Upload.tsx`, `src/pages/LinkedInGrader.tsx`, `src/pages/CareerCompass.tsx`, `src/pages/RecruitingLens.tsx` - generic extraction failure copy.
- Focused tests under `supabase/functions/_shared/*.test.ts` and `src/pages/__tests__/document-extraction-*.test.ts`.

## Decisions Made

- Deno-compatible embedded parser support was not introduced in the backend. The reliable parser path remains the existing browser pdf.js facade; backend raw-byte heuristics were removed from accepted behavior.
- The `ocr-pdf` endpoint now queries raw `profiles.subscription_tier` because `requireAuth()` may normalize legacy Pro to active UI behavior, which Phase 51 explicitly must not treat as Elite OCR access.
- Generated Supabase types were updated in the repo's existing binary-reported encoding to avoid changing file encoding while adding the new nullable fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deno test command required repo-style `--no-check`**
- **Found during:** Verification
- **Issue:** `deno.cmd test --config ...` fails type-checking because the repo Deno config has TypeScript option/library mismatches; the configured Deno task already uses `--no-check`.
- **Fix:** Re-ran focused Deno tests with `--no-check --allow-env --allow-read`, matching repo style.
- **Files modified:** None.
- **Verification:** Focused Deno suite passed: 31 passed, 0 failed.

**2. [Rule 3 - Blocking] Generated Supabase types file encoding drift**
- **Found during:** Diff review
- **Issue:** Initial narrow edit rewrote `types.ts` as UTF-8 while the tracked file is binary-reported/non-UTF-8.
- **Fix:** Reconstructed from `HEAD`, re-applied only Phase 51 fields, and restored the original UTF-16-style encoding.
- **Files modified:** `src/integrations/supabase/types.ts`.
- **Verification:** `rg` confirms all Phase 51 fields are present; diff size delta is limited to the added fields.

---

**Total deviations:** 2 auto-fixed.
**Impact on plan:** No scope creep. Both fixes preserved verification fidelity and reviewability.

## Issues Encountered

- `gsd-sdk query verify.codebase-drift` produced a non-blocking repo-wide drift warning with many stale paths. Per GSD contract this does not block phase verification.
- No live Supabase migration push or authenticated browser smoke was performed in this session.
- The generated Supabase type file is still reported by Git as binary because that is the existing tracked encoding/attribute behavior.

## User Setup Required

Environment configuration is optional for cheap OCR providers:

- `MISTRAL_OCR_API_KEY`, optional `MISTRAL_OCR_ENDPOINT`, optional `MISTRAL_OCR_MODEL`
- `TEXTRACT_OCR_ENDPOINT`, `TEXTRACT_OCR_TOKEN`

When these are absent, providers are skipped with concise internal reason codes.

## Verification

- `deno.cmd test --no-check --allow-env --allow-read --config supabase/functions/deno.json supabase/functions/_shared/document-extraction.test.ts supabase/functions/_shared/document-quality.test.ts supabase/functions/_shared/document-persistence.test.ts supabase/functions/_shared/ollama-client.test.ts supabase/functions/_shared/mistral-ocr-client.test.ts supabase/functions/_shared/textract-client.test.ts` - 31 passed, 0 failed.
- `npm.cmd test -- src/pages/__tests__/document-extraction-primary.test.ts src/pages/__tests__/document-extraction-secondary.test.ts` - 11 passed, 0 failed.
- `npm.cmd run build` - passed; existing Tailwind ambiguous class and chunk-size warnings remain.
- `gsd-sdk query verify.schema-drift 51` - `drift_detected: false`.
- `gsd-sdk query verify.codebase-drift` - non-blocking warning.

## Next Phase Readiness

Phase 51 source implementation is ready for deployment review. Before production rollout, apply the new migration in the target Supabase environment and run manual QA for Free/Pro/Elite scanned and text-based PDF flows.

---
*Phase: 51-cost-optimized-document-extraction*
*Completed: 2026-06-07*
