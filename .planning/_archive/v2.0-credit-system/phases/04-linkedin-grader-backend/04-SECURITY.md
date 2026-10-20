---
phase: 04
slug: linkedin-grader-backend
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-11
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client -> edge function | Untrusted HTTP request crosses into server-side processing | Profile text, profile URL (user-supplied, untrusted) |
| edge function -> Anthropic API | Profile text forwarded to external LLM | Sanitized profile content (PII possible) |
| edge function -> Supabase DB | Grading results written to postgres | Structured JSON grade data, user ID |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-04-01 | Spoofing | grade-linkedin auth | mitigate | `requireAuth(req, { type: 'user' })` extracts userId from JWT only; `body.userId` completely ignored (index.ts:84) | closed |
| T-04-02 | Tampering | profile text input | mitigate | Input truncated to 12,000 chars (index.ts:114-117); `sanitizeMessages` auto-called by `invokeAnthropicText` strips injection phrases | closed |
| T-04-03 | Repudiation | usage tracking | mitigate | `checkAndRecordUsage(userId, 'linkedin_grading')` logs action before AI call (index.ts:120); tied to JWT-verified userId | closed |
| T-04-04 | Information Disclosure | error responses | mitigate | Generic error messages returned (index.ts:161-178, 298-303); no stack traces or internal details; CORS restricted to APP_URL via `corsHeaders({ type: 'user' })` | closed |
| T-04-05 | Denial of Service | rate limiting | mitigate | `checkRateLimit` with per-user sliding window: free 5, pro 15, elite 30 (index.ts:88-94); AI retry capped at 3 attempts in `invokeWithRetry` (index.ts:30-50) | closed |
| T-04-06 | Elevation of Privilege | tier bypass | mitigate | Tier read from JWT-verified profile via `userContext.tier` (index.ts:88); usage check before expensive AI call (index.ts:120) | closed |
| T-04-07 | Tampering | DB schema | accept | Migration is additive (drops constraint, adds indexes); no data loss; reversible by recreating UNIQUE index | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-07 | DB migration drops UNIQUE on profile_identifier — additive change with no data loss; reversible by recreating the index if needed | gsd-security-audit | 2026-04-11 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-11 | 7 | 7 | 0 | gsd-secure-phase orchestrator |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-11
