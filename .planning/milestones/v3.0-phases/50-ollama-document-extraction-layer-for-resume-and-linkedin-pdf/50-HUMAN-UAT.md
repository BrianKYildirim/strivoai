---
status: partial
phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf
source: [50-VERIFICATION.md]
started: 2026-06-05
updated: 2026-06-05
---

## Current Test

Awaiting staging environment verification for Ollama runtime behavior.

## Tests

### 1. Ollama unset falls back to Claude

expected: With `OLLAMA_BASE_URL` unset, scanned resume and LinkedIn PDFs still succeed through Claude fallback with no Ollama-specific user-facing error.
result: [pending]

### 2. Healthy Ollama can accept scanned PDFs

expected: With healthy Ollama configuration, scanned resume and LinkedIn PDFs can be accepted with `provider: ollama`, attempted providers, hash, and concise metadata persisted.
result: [pending]

### 3. Unhealthy Ollama falls back or fails safely

expected: With unhealthy or wrong-model Ollama configuration, fallback to Claude works; if all providers fail, the user receives a specific extraction error and no empty text is persisted.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

None. These are environment-backed runtime checks, not known code gaps.
