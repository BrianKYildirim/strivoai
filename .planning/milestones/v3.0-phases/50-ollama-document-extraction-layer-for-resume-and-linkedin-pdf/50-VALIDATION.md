---
phase: 50
slug: ollama-document-extraction-layer-for-resume-and-linkedin-pdf
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-05
---

# Phase 50 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno tests for Supabase shared/edge code; Vitest/source assertions for frontend wiring |
| **Config file** | `supabase/functions/deno.json`; `package.json` / Vite test setup |
| **Quick run command** | `deno.cmd test --allow-env --allow-net=127.0.0.1 supabase/functions/_shared/*.test.ts` |
| **Full suite command** | targeted Deno tests + targeted frontend tests/source assertions + `npm.cmd run build -- --outDir dist-codex --emptyOutDir=true` |
| **Estimated runtime** | ~120 seconds for targeted suite; build time depends on local machine |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted Deno/Vitest/source assertion command.
- **After every plan wave:** Run the targeted suite for touched extraction, persistence, and frontend files.
- **Before `$gsd-verify-work`:** Targeted suite and production build must be green, or gaps must be documented.
- **Max feedback latency:** 180 seconds for targeted checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | D-05, D-07, D-09, D-10, D-20 | T-50-METADATA | Shared types expose raw text + concise metadata only | unit | `deno.cmd test --allow-env supabase/functions/_shared/document-quality.test.ts` | W0 | pending |
| 50-01-02 | 01 | 1 | D-04, D-08, D-19 | T-50-QUALITY | Poor/empty extraction text is rejected before persistence/cache use | unit | `deno.cmd test --allow-env supabase/functions/_shared/document-quality.test.ts` | W0 | pending |
| 50-02-01 | 02 | 1 | D-09, D-17, D-20, D-21 | T-50-SCHEMA | Additive metadata columns are nullable and do not backfill legacy rows | static SQL | `Select-String -Path supabase/migrations/*phase50* -Pattern 'ADD COLUMN IF NOT EXISTS|extraction_metadata|linkedin_pdf_text_hash'` | W0 | pending |
| 50-02-02 | 02 | 1 | D-17, D-20 | T-50-TYPES | Supabase types expose extraction metadata fields to frontend code | static source | `Select-String -Path src/integrations/supabase/types.ts -Pattern 'extraction_metadata|linkedin_pdf_text_hash|linkedin_pdf_extraction_metadata'` | W0 | pending |
| 50-03-01 | 03 | 2 | D-12, D-13, D-14, D-15, D-16 | T-50-OLLAMA-CONFIG | Ollama host is secret-configured, never frontend supplied, missing config falls back | unit | `deno.cmd test --allow-env --allow-net=127.0.0.1 supabase/functions/_shared/ollama-client.test.ts` | W0 | pending |
| 50-03-02 | 03 | 2 | D-02, D-03, D-04, D-05, D-06, D-18, D-19 | T-50-FALLBACK | Provider order is pdfjs -> ollama -> claude_ocr; all-fail persists nothing | unit | `deno.cmd test --allow-env supabase/functions/_shared/document-extraction.test.ts` | W0 | pending |
| 50-04-01 | 04 | 3 | D-17, D-19, D-20 | T-50-CROSSWRITE | Resume/Profile writes use existing canonical fields, concise metadata, and user-scoped filters | unit | `deno.cmd test --allow-env supabase/functions/_shared/document-persistence.test.ts` | W0 | pending |
| 50-04-02 | 04 | 3 | D-03, D-07, D-14, D-15, D-18, D-19 | T-50-OCRPDF | ocr-pdf keeps compatibility while attempting Ollama before Claude fallback | unit/source | `deno.cmd test --allow-env supabase/functions/_shared/document-extraction.test.ts supabase/functions/_shared/document-persistence.test.ts` | W0 | pending |
| 50-04-03 | 04 | 3 | D-06, D-21 | T-50-STORED-PDF | Backend stored-PDF callers prefer accepted text and skip unsupported Ollama raw-PDF OCR | unit/source | `deno.cmd test --allow-env supabase/functions/_shared/document-quality.test.ts supabase/functions/_shared/document-extraction.test.ts` | W0 | pending |
| 50-05-01 | 05 | 4 | D-01, D-02, D-05, D-06 | T-50-FRONTEND-CONFIG | Primary frontend helper preserves pdfjs first and never sends provider config | Vitest/source | `npm.cmd run test -- --run src/pages/__tests__/document-extraction-primary.test.ts` | W0 | pending |
| 50-05-02 | 05 | 4 | D-17, D-19 | T-50-RESUME-UPLOAD | Resume Upload passes resumeId after authenticated insert and writes accepted text only | Vitest/source | `npm.cmd run test -- --run src/pages/__tests__/document-extraction-primary.test.ts` | W0 | pending |
| 50-05-03 | 05 | 4 | D-11, D-17, D-19, D-21 | T-50-LINKEDIN-TIMING | LinkedInGrader/Onboarding preserve accepted-source timing and hide provider metadata | Vitest/source | `npm.cmd run test -- --run src/pages/__tests__/document-extraction-primary.test.ts` | W0 | pending |
| 50-06-01 | 06 | 5 | D-05, D-06, D-17, D-19 | T-50-SECONDARY-SOURCES | Career/Profile source writes use accepted text and preserve existing source on failure | Vitest/source | `npm.cmd run test -- --run src/pages/__tests__/document-extraction-secondary.test.ts` | W0 | pending |
| 50-06-02 | 06 | 5 | D-05, D-06, D-11 | T-50-DRIFT | Remaining PDF call sites use shared extraction or documented low-level exceptions | Vitest/source | `npm.cmd run test -- --run src/pages/__tests__/document-extraction-secondary.test.ts` | W0 | pending |
| 50-06-03 | 06 | 5 | D-01..D-21 | T-50-BUILD | Extraction layer compiles and provider metadata remains hidden in normal UI | build | `npm.cmd run test -- --run src/pages/__tests__/document-extraction-primary.test.ts src/pages/__tests__/document-extraction-secondary.test.ts`; `npm.cmd run build -- --outDir dist-codex --emptyOutDir=true` | existing | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/_shared/document-quality.test.ts` - quality gates and canonical text hashing fixtures.
- [ ] `supabase/functions/_shared/ollama-client.test.ts` - missing config, auth header, stream:false payload, timeout, and HTTP failure behavior.
- [ ] `supabase/functions/_shared/document-extraction.test.ts` - provider order and fallback matrix.
- [ ] `supabase/functions/_shared/document-persistence.test.ts` - canonical field writes and concise metadata.
- [ ] `src/pages/__tests__/document-extraction-primary.test.ts` - primary frontend flow wiring and no normal provider-label UI.
- [ ] `src/pages/__tests__/document-extraction-secondary.test.ts` - secondary extraction callsite drift guard and provider-label checks.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ollama missing config falls through to Claude | D-14, D-15, D-18 | Requires deployed/staging secrets behavior | On staging with `OLLAMA_BASE_URL` unset, upload a scanned resume and LinkedIn PDF; confirm extraction succeeds via Claude fallback and user sees no Ollama-specific error. |
| Ollama healthy path persists accepted metadata | D-12, D-13, D-16, D-17, D-20 | Requires reachable production-like Ollama host | Configure staging `OLLAMA_BASE_URL`, upload scanned resume and LinkedIn PDFs, confirm accepted rows include provider `ollama`, attempted providers, text hash, and no verbose transcripts. |
| Ollama unhealthy path preserves reliability | D-03, D-14, D-15, D-19 | Requires controlled bad host/wrong model scenario | Point staging to an unhealthy/wrong-model Ollama host; confirm fallback to Claude works, all-fail scenario returns specific extraction error, and no empty text is persisted. |
| Hash stability for cache-sensitive rerun | D-08, D-17, D-21 | Needs DB inspection after real uploads | Re-upload or rerun the same accepted document; confirm accepted canonical text hash is stable and legacy rows are not broadly backfilled. |

---

## Validation Sign-Off

- [x] All tasks have automated verify targets or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all MISSING references.
- [x] No watch-mode flags.
- [x] Feedback latency target < 180s for targeted checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-05
