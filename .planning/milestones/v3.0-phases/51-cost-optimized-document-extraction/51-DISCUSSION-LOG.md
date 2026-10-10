# Phase 51: Cost-optimized document extraction - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-06-07
**Phase:** 51-cost-optimized-document-extraction
**Areas discussed:** OCR provider chain, tier policy edge cases, cache identity, quality gate strictness, failure UX, Phase 50 rollback, persistence and audit metadata

---

## OCR Provider Chain

| Option | Description | Selected |
|--------|-------------|----------|
| 1A | Configured-only interface: parser first, then enabled cheap providers in order: Ollama, Mistral, Textract; skip any provider without env/config. | yes |
| 1B | Ollama only for now; add Mistral/Textract later. | |
| 1C | Mistral/Textract first; treat Ollama as local/dev fallback only. | |

**User's choice:** 1A.
**Notes:** Locks provider order while keeping providers optional/configured-only.

---

## Tier Policy Edge Cases

| Option | Description | Selected |
|--------|-------------|----------|
| 2A | Treat active legacy Pro/admin Pro as Elite for extraction policy, so legacy paid users can use Claude OCR fallback. | |
| 2B | Only literal Elite gets Claude OCR; legacy Pro follows Free OCR limits. | yes |
| 2C | Admin override can force Elite policy, but legacy Pro cannot. | |

**User's choice:** 2B.
**Notes:** This intentionally differs from earlier temporary Pro-to-Elite UI normalization. Phase 51 extraction policy requires literal Elite for Claude OCR fallback.

---

## Cache Identity

| Option | Description | Selected |
|--------|-------------|----------|
| 3A | `user_id + document_hash + document_type + extraction_version`, reusable across features for that user. | yes |
| 3B | `document_hash` only, shared globally. | |
| 3C | `feature + user_id + document_hash`, stricter but may re-extract the same PDF across features. | |

**User's choice:** 3A.
**Notes:** Reuse is user-scoped and cross-feature, not global.

---

## Quality Gate Strictness

| Option | Description | Selected |
|--------|-------------|----------|
| 4A | Generic, permissive document-likeness gate: enough words, printable ratio, low garbage, no strict resume/LinkedIn keywords. | yes |
| 4B | Strict resume/LinkedIn-specific gate with stronger keyword expectations. | |
| 4C | Minimal gate: accept almost any non-empty OCR text. | |

**User's choice:** 4A.
**Notes:** Avoids rejecting valid nontraditional resumes or LinkedIn PDFs while still blocking garbage OCR.

---

## Failure UX

| Option | Description | Selected |
|--------|-------------|----------|
| 5A | Free scanned-PDF failure says the file could not be read reliably and asks for a text-based PDF, DOCX, or pasted text; no provider names. | yes |
| 5B | Show detailed provider path/reasons to the user. | |
| 5C | Quietly allow downstream analysis with weak/partial extracted text. | |

**User's choice:** 5A.
**Notes:** Provider details stay in metadata/logs, not normal UX.

---

## Phase 50 Rollback

| Option | Description | Selected |
|--------|-------------|----------|
| 6A | Remove Ollama-first behavior; keep Ollama only as an optional cheap OCR provider behind the new interface. | yes |
| 6B | Fully remove Ollama support. | |
| 6C | Keep Phase 50 behavior as fallback after the new parser fails. | |

**User's choice:** 6A.
**Notes:** Phase 50 remains historical context. Ollama survives only as one configured cheap OCR provider.

---

## Persistence and Audit Metadata

| Option | Description | Selected |
|--------|-------------|----------|
| 7A | Persist accepted text plus metadata on the owning record where practical: resume extraction fields on `resumes`; LinkedIn extraction metadata/hash alongside `profiles.linkedin_pdf_content`; no raw failed OCR text. | yes |
| 7B | Create a separate `document_extractions` table for all extracted text and metadata. | |
| 7C | Persist only metadata, never raw extracted text, and rely on re-extraction for analysis. | |

**User's choice:** 7A.
**Notes:** Keeps storage close to current Resume and LinkedIn source records while avoiding raw failed OCR persistence.

---

## the agent's Discretion

- Exact provider interface names and file layout.
- Exact parser library selection after research.
- Exact metadata JSON shape, timeout values, and quality thresholds within the locked policy.

## Deferred Ideas

- Global/cross-user extraction cache.
- Structured resume/LinkedIn parsing.
- User-facing provider labels or detailed OCR support dashboard.
- Broad historical extraction backfill.
