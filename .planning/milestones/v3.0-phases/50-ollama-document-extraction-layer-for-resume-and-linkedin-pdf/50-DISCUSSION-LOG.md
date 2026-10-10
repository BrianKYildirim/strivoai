# Phase 50: ollama-document-extraction-layer-for-resume-and-linkedin-pdf - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-06-05T03:27:34.1731538-07:00
**Phase:** 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf
**Areas discussed:** Extraction Chain, Output Contract, Runtime Boundary, Failure and Persistence

---

## Extraction Chain

| Option | Description | Selected |
|--------|-------------|----------|
| Ollama before Claude fallback | Try client/pdfjs first, then Ollama, then existing Claude `ocr-pdf` only if Ollama fails or confidence is poor. | x |
| Ollama replaces Claude OCR | Try client/pdfjs first, then Ollama; if Ollama fails, show an operational error. | |
| Ollama dev/staging only | Keep production extraction unchanged; use Ollama locally or in staging to prove quality first. | |
| You decide | Agent discretion based on current architecture. | |

**User's choice:** Ollama before Claude fallback.
**Notes:** The accepted chain is `pdfjs` -> `ollama` -> Claude `ocr-pdf`.

| Option | Description | Selected |
|--------|-------------|----------|
| Heuristic text quality gate | Reject too-short, noisy, repetitive, or signal-poor text. | x |
| Always accept non-empty Ollama text | Simpler but risks poisoning analyses and cache fingerprints. | |
| Claude validates Ollama output | Stronger but spends Claude tokens even when Ollama works. | |
| You decide | Agent discretion. | |

**User's choice:** Heuristic text quality gate.
**Notes:** Quality checks are deterministic and document-type-aware.

| Option | Description | Selected |
|--------|-------------|----------|
| Resume + LinkedIn PDFs both use the same chain | One shared extraction layer handles both document types with type-specific prompts/gates. | x |
| Resume first, LinkedIn later | Limit initial rollout to resumes. | |
| Separate chains per surface | Independent helpers and fallback rules per surface. | |
| You decide | Agent discretion. | |

**User's choice:** Resume + LinkedIn PDFs both use the same chain.
**Notes:** Avoids drift across the two Phase 50 surfaces.

| Option | Description | Selected |
|--------|-------------|----------|
| Frontend + backend callers | Upload flows and edge functions can both call the shared layer. | x |
| Frontend upload flows only | Narrower, but backend re-extraction stays on the older path. | |
| Backend only | Centralizes server-side but rewires more upload code. | |
| You decide | Agent discretion. | |

**User's choice:** Frontend + backend callers.
**Notes:** Backend stored-PDF re-read paths should not drift.

---

## Output Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Raw text plus metadata | Return extracted text, provider, quality status, document type, and hash. | x |
| Structured sections too | Return normalized sections in addition to text. | |
| Raw text only | Smallest output but less diagnosable. | |
| You decide | Agent discretion. | |

**User's choice:** Raw text plus metadata.
**Notes:** Existing callers consume text; metadata supports support/debugging.

| Option | Description | Selected |
|--------|-------------|----------|
| Hash canonicalized extracted text | Aligns with existing `resumes.text_hash`. | x |
| Hash original file bytes | Stable for identical PDFs but not equivalent OCR text. | |
| Store both file hash and text hash | Useful when bytes are available, but text hash remains canonical. | |
| You decide | Agent discretion. | |

**User's choice:** Hash canonicalized extracted text.
**Notes:** SHA-256 over accepted text is the canonical output hash.

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal operational metadata | Persist provider, quality status, timestamp, text hash, and concise reason. | x |
| Full provider transcript/log | Better debugging but higher privacy/storage risk. | |
| No provider metadata persisted | Simpler but hard to diagnose failures. | |
| You decide | Agent discretion. | |

**User's choice:** Minimal operational metadata.
**Notes:** No full prompts, transcripts, or verbose logs in user data.

| Option | Description | Selected |
|--------|-------------|----------|
| No sections in Phase 50 | Keep to extraction text plus metadata. | x |
| Non-persisted best-effort sections | Convenient but callers may depend on fuzzy schema. | |
| Persist sections for Resume + LinkedIn now | Powerful but expands scope. | |
| You decide | Agent discretion. | |

**User's choice:** No sections in Phase 50.
**Notes:** Structured parsing is deferred to Phase 42 or later.

| Option | Description | Selected |
|--------|-------------|----------|
| Do not expose provider details by default | Use metadata for logs/support only. | x |
| Show a small extraction source label | Transparent but potentially confusing. | |
| Show only on extraction error | No normal label, but error copy names failed stage. | |
| You decide | Agent discretion. | |

**User's choice:** Do not expose provider details by default.
**Notes:** Normal UI remains provider-agnostic.

---

## Runtime Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Not production yet | Env-flagged local/staging only. | |
| Production Supabase Edge Function calls an Ollama host | Requires reachable host URL and runtime config. | x |
| Browser/local machine only | Avoids server infra but unreliable for production users. | |
| You decide | Agent discretion. | |

**User's choice:** Production Supabase Edge Function calls an Ollama host.
**Notes:** This creates an explicit Phase 50 exception to the prior no-new-infrastructure constraint.

| Option | Description | Selected |
|--------|-------------|----------|
| Environment-configured service URL + shared secret | Edge functions read Supabase secrets. | x |
| Hardcoded internal URL | Simple but brittle and unsafe. | |
| Per-request URL from frontend | Flexible but insecure and operationally risky. | |
| You decide | Agent discretion. | |

**User's choice:** Environment-configured service URL + shared secret.
**Notes:** Use per-environment Supabase secrets such as `OLLAMA_BASE_URL`.

| Option | Description | Selected |
|--------|-------------|----------|
| Skip Ollama and use Claude fallback | Deploys stay reliable while host config rolls out. | x |
| Fail extraction immediately | Forces config correctness but risks broken uploads. | |
| Only fail in production | More complex behavior split. | |
| You decide | Agent discretion. | |

**User's choice:** Skip Ollama and use Claude fallback.
**Notes:** Missing config is operationally logged, not user-visible.

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort cost saver | Preferred when healthy; Claude fallback preserves reliability. | x |
| Primary required service | Lower Claude spend, higher user-facing risk. | |
| Gradual rollout by feature/tier | Safer but adds flag complexity. | |
| You decide | Agent discretion. | |

**User's choice:** Best-effort cost saver.
**Notes:** Ollama is not required for user reliability.

| Option | Description | Selected |
|--------|-------------|----------|
| Short bounded timeout | 5-8 seconds, then fallback. | |
| Long timeout | 30-60 seconds to maximize avoiding Claude OCR. | x |
| No fixed timeout | Infrastructure defaults decide. | |
| You decide | Agent discretion. | |

**User's choice:** Long timeout.
**Notes:** Timeout should be roughly 30-60 seconds but bounded.

---

## Failure and Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Existing canonical fields | Resume text to `resumes`; LinkedIn text to existing profile/source path. | x |
| New extraction table | More auditable but larger schema scope. | |
| No persistence change | Loses cache/history benefits. | |
| You decide | Agent discretion. | |

**User's choice:** Existing canonical fields.
**Notes:** Preserve Phase 29 and Phase 35 contracts.

| Option | Description | Selected |
|--------|-------------|----------|
| Persist Claude OCR as accepted text | Keeps existing behavior and cache population intact. | x |
| Return Claude OCR but mark fallback-only, not persisted | Avoids saving fallback output but repeats OCR later. | |
| Ask user to confirm before saving | Interrupts upload/analyze flows. | |
| You decide | Agent discretion. | |

**User's choice:** Persist Claude OCR as accepted text.
**Notes:** Provider metadata indicates fallback.

| Option | Description | Selected |
|--------|-------------|----------|
| Specific operational error + no persistence | Avoids bad text entering cache/history. | x |
| Persist empty text with failed status | Debuggable but risky for callers. | |
| Try to continue with file metadata only | Keeps flow moving but poor analysis quality. | |
| You decide | Agent discretion. | |

**User's choice:** Specific operational error + no persistence.
**Notes:** Empty/low-quality text must not be persisted.

| Option | Description | Selected |
|--------|-------------|----------|
| Concise per-run metadata | Store provider, attempts, quality, fallback reason, timestamp. | x |
| Logs only, no DB metadata | Lower schema work but hard to correlate support reports. | |
| Detailed audit table | Useful but larger than this phase needs. | |
| You decide | Agent discretion. | |

**User's choice:** Concise per-run metadata.
**Notes:** Avoid verbose logs and provider transcripts.

| Option | Description | Selected |
|--------|-------------|----------|
| No broad backfill | Populate on next upload/analyze/replacement only. | x |
| Backfill only recently used rows | More useful but needs jobs and limits. | |
| Full historical backfill | Maximum completeness, highest cost/infra risk. | |
| You decide | Agent discretion. | |

**User's choice:** No broad backfill.
**Notes:** Legacy rows populate opportunistically.

---

## the agent's Discretion

- Exact helper names and file layout.
- Exact quality gate thresholds.
- Exact Ollama model and request shape.
- Exact concise metadata shape.
- Exact timeout within the 30-60 second target.

## Deferred Ideas

- Structured resume/LinkedIn section extraction.
- Broad historical extraction backfill.
- Normal user-facing extraction source labels.
- Detailed extraction attempts audit table.
