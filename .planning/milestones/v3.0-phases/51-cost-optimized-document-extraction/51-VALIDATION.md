---
phase: 51
slug: cost-optimized-document-extraction
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-07
updated: 2026-06-07
source: [51-PLAN.md, 51-SUMMARY.md, 51-VERIFICATION.md]
---

# Phase 51 - Validation Strategy

Per-phase Nyquist validation contract reconstructed after execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Deno test and Vitest |
| Config file | `supabase/functions/deno.json`, `vitest.config.ts` |
| Quick run command | `deno.cmd test --no-check --allow-env --allow-read --config supabase/functions/deno.json supabase/functions/_shared/document-extraction.test.ts supabase/functions/_shared/document-quality.test.ts supabase/functions/_shared/document-persistence.test.ts supabase/functions/_shared/ollama-client.test.ts supabase/functions/_shared/mistral-ocr-client.test.ts supabase/functions/_shared/textract-client.test.ts supabase/functions/ocr-pdf/index.test.ts` |
| Full suite command | `npm.cmd test -- src/pages/__tests__/document-extraction-primary.test.ts src/pages/__tests__/document-extraction-secondary.test.ts` plus `npm.cmd run build` |
| Estimated runtime | ~8 seconds for focused checks, ~12 seconds including build |

## Sampling Rate

- After backend extraction policy changes: run the Deno quick command.
- After frontend upload/facade changes: run the two document extraction Vitest files.
- Before deployment review: run the Deno quick command, the Vitest command, and `npm.cmd run build`.
- Max feedback latency: ~12 seconds for the focused Phase 51 validation set.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 51-01 | 51 | 1 | D-07, D-08, D-19-D-23, CACHE-02/03/11/12 | Cache poisoning, cross-user reuse | Document reuse is keyed by user, document hash, document type, and extraction version; accepted text only is persisted. | unit | Deno quick command | yes | green |
| 51-02 | 51 | 1 | D-01, D-16-D-18 | Obsolete provider labels, raw parser acceptance | Stable provider labels are used and backend raw-byte parsing is not accepted as a primary path. | unit/source contract | Deno quick command | yes | green |
| 51-03 | 51 | 1 | D-01, D-02, D-06 | Unconditional Claude fallback, Ollama-first routing | Extraction order is parser, cheap providers, then Claude only when policy allows it. | unit | Deno quick command | yes | green |
| 51-04 | 51 | 1 | D-03 | Provider hangs and unavailable provider leaks | Cheap providers are config-gated, return concise reason codes, and continue on failure. | unit | Deno quick command | yes | green |
| 51-05 | 51 | 1 | D-04, D-05, D-06 | Legacy Pro/admin Pro gaining Elite OCR | `ocr-pdf` resolves raw `profiles.subscription_tier`; Claude OCR is allowed only for literal `elite`. | unit/source contract | Deno quick command | yes | green |
| 51-06 | 51 | 1 | D-07, D-08, D-09 | OCR rerun on accepted documents, text-hash-only reuse | Accepted-text lookup returns reuse hits without provider calls and stays user-scoped. | unit | Deno quick command | yes | green |
| 51-07 | 51 | 1 | D-10-D-12, D-15 | Weak OCR entering analysis/cache/history | Quality gate accepts realistic career documents and rejects tiny, noisy, repetitive, or no-signal output before persistence. | unit | Deno quick command | yes | green |
| 51-08 | 51 | 1 | D-13, D-14 | Provider metadata exposed in UI | Upload and PDF entry points use generic read-failure copy and do not render provider metadata labels. | source contract | Vitest command | yes | green |
| 51-09 | 51 | 1 | D-19-D-23 | Raw provider payload or secrets persisted | Metadata serialization allowlists concise operational fields and excludes prompts, images, responses, transcripts, and secrets. | unit/source contract | Deno quick command and Vitest command | yes | green |
| 51-10 | 51 | 1 | TEST-01, caller drift controls | Upload surfaces bypassing shared extraction facade | Primary and secondary upload surfaces route through `extractDocumentFromPdf`; low-level pdf.js imports are blocked in pages/components. | source contract | Vitest command | yes | green |

## Wave 0 Requirements

Existing infrastructure covers all Phase 51 requirements. No Wave 0 test scaffolding remains pending.

## Gap Analysis

| Gap | Requirement | Resolution | Status |
|-----|-------------|------------|--------|
| Direct `ocr-pdf` boundary test for raw-tier Claude policy was missing; shared extraction tests covered policy behavior but not the endpoint source contract. | D-04, D-05 | Added `supabase/functions/ocr-pdf/index.test.ts` to assert raw `subscription_tier` lookup and `rawTier === 'elite'` gating, and to reject deriving Claude policy from normalized auth tier. | resolved |

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase migration applied in target environment | NFR-01, D-07-D-09 | Requires staging/production Supabase target access. | Apply `20260607040000_phase51_document_extraction_identity.sql`, then confirm identity columns/indexes exist. |
| Real provider OCR payload compatibility | D-03, D-06 | Depends on deployed Mistral/Textract/Ollama secrets and provider contracts. | In staging, run scanned PDF uploads with cheap providers configured and confirm provider attempts continue or accept as expected. |
| Live Free/Pro/Elite scanned and text-based PDF flows | D-01-D-15 | Requires authenticated users with real subscription tiers and deployed edge functions. | Exercise the seven scenarios listed in `51-VERIFICATION.md` under Manual QA Recommended. |

Manual-only items are rollout checks; they do not block Nyquist compliance for automated phase behavior coverage.

## Automated Verification Run

Passed on 2026-06-07:

```powershell
deno.cmd test --no-check --allow-env --allow-read --config supabase/functions/deno.json supabase/functions/_shared/document-extraction.test.ts supabase/functions/_shared/document-quality.test.ts supabase/functions/_shared/document-persistence.test.ts supabase/functions/_shared/ollama-client.test.ts supabase/functions/_shared/mistral-ocr-client.test.ts supabase/functions/_shared/textract-client.test.ts supabase/functions/ocr-pdf/index.test.ts
```

Result: 33 passed, 0 failed.

```powershell
npm.cmd test -- src/pages/__tests__/document-extraction-primary.test.ts src/pages/__tests__/document-extraction-secondary.test.ts
```

Result: 2 files passed, 11 tests passed.

```powershell
npm.cmd run build
```

Result: passed. Existing warnings remain for one ambiguous Tailwind class and large chunks.

```powershell
gsd-sdk query verify.schema-drift 51
```

Result: `drift_detected: false`, `blocking: false`.

## Validation Audit 2026-06-07

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

## Validation Sign-Off

- [x] All tasks have automated verification or explicit manual rollout checks.
- [x] Sampling continuity: no three consecutive tasks lack automated verification.
- [x] Wave 0 covers all missing references; no Wave 0 work remains.
- [x] No watch-mode flags in validation commands.
- [x] Feedback latency is under 15 seconds for the focused validation set.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: approved 2026-06-07
