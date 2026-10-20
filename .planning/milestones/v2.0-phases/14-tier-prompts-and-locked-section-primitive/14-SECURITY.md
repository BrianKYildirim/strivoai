---
phase: 14
slug: tier-prompts-and-locked-section-primitive
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-16
---

# Phase 14 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → edge function | Client supplies desired tier in request; server MUST read tier from authenticated profile row | Tier string, JWT token |
| edge function → Anthropic | Prompt text is the instruction payload; model ID controls per-call cost ceiling | Prompt text, model parameters |
| loader → Anthropic | Free prompt must force field omission at the model layer, not just hide in UI | Prompt variant text |
| client DOM | Locked content MUST NOT be placed inside blurred body — blur is cosmetic, DOM is inspectable | Rendered HTML |
| EliteFeatureGate children prop | Elite-only data passed as children; gate bypass would reveal data if present | React props |
| build system → production bundle | Dev-only content must never ship to prod | Route registrations, sandbox pages |
| CI runner → Anthropic | Uncontrolled harness runs would burn Anthropic budget | API calls, token consumption |
| test → fixture file | Snapshot file is committed and influences future pass/fail | Metric values |
| test runtime → component code | Tests run in jsdom — no real DOM or network | Component render output |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-14-01 | Tampering (cost amplification) | tier-config.ts getModel | mitigate | Free hardcoded to Haiku; ignores override map unconditionally | closed |
| T-14-A | Elevation of Privilege | tier-config.ts Free→non-Haiku | mitigate | `getModel('free', ...)` ignores feature override map; tier-config.test.ts Test 8 asserts invariant | closed |
| T-14-B | Information disclosure | Timeout values in error messages | accept | Timeouts are public spec values; no secrecy loss | closed |
| T-14-02 | Tampering (prompt injection) | tier-prompts.ts loader | accept | Loader is pure dispatcher; existing prompt-sanitizer.ts handles user-role messages; JSDoc documents caller responsibility | closed |
| T-14-03 | Information disclosure (cost leak) | tier-prompts.ts Free variant | mitigate | `if (tier === 'free') return body;` hard-coded; tests assert invariant | closed |
| T-14-04 | Elevation of Privilege (tier spoof) | tier-prompts.ts caller tier | mitigate | Consumers must read tier from `profiles.subscription_tier` server-side; documented in JSDoc | closed |
| T-14-05 | Information disclosure (Free field leak) | resume-prompts.ts Free variant | mitigate | FREE TIER OUTPUT CONSTRAINT block authored; Plan 07 tier-validation harness asserts zero locked fields | closed |
| T-14-06 | Repudiation | resume-prompts.ts constraint block | mitigate | Test asserts literal "FREE TIER OUTPUT CONSTRAINT" substring present — regression guard | closed |
| T-14-07 | Information disclosure (DOM scrape) | LockedSection children prop | mitigate | Flat-props API (no children); blurred body is skeleton placeholder bars, not real content | closed |
| T-14-08 | Tampering (client tier spoof) | LockedSection data-required-tier | accept | Primitives are presentation-only; tier enforcement in edge function; data not present if prompt omits it | closed |
| T-14-09 | Information disclosure (Elite scrape) | EliteFeatureGate children | mitigate | Server-side field omission (Pro/Free prompts never generate Elite fields); JSDoc documents invariant | closed |
| T-14-10 | Tampering (tier spoof via DevTools) | EliteFeatureGate userTier prop | accept | Server-side field omission; gate bypass reveals nothing if data absent from API response | closed |
| T-14-11 | Information disclosure (dev route leak) | LockedSectionsSandbox in prod | mitigate | Route wrapped in `import.meta.env.DEV` — Vite replaces with `false` in prod; dead-code eliminated | closed |
| T-14-12 | Tampering (prod route access) | /dev/locked-sections in prod | mitigate | No registered Route in prod bundle; React Router falls through to NotFound | closed |
| T-14-13 | Denial of Service (cost) | CI running tier-validation | mitigate | Env-flag `RUN_TIER_VALIDATION` required; default CI never passes it; Deno test-level `ignore: skip` as defense-in-depth | closed |
| T-14-14 | Tampering (snapshot values) | tier-validation fixture | accept | Assertion is on ratio (`freeTokens < 0.5 * eliteTokens`), not snapshot values; snapshot is documentation, not ground truth | closed |
| T-14-15 | Information disclosure (fixture content) | tier-validation-fixtures/resume.json | mitigate | Fixture stores only `freeTokens`, `eliteTokens`, `ratio`, `timestamp` — no response text or resume content | closed |
| T-14-16 | Information disclosure (false security) | Vitest suite implying server coverage | mitigate | JSDoc header on all 3 test files: "These tests assert the PRESENTATION layer. Server-side enforcement tested separately by Plan 07." | closed |
| T-14-17 | Tampering (DOM-only tests) | Test cannot detect prompt regression | accept | Plan 07 live harness covers prompt layer; Plan 08 scope is UI rendering only | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-14-B | Timeout values are public spec values; no confidentiality impact | Plan author | 2026-04-16 |
| AR-02 | T-14-02 | Loader is a pure dispatcher; sanitization is caller responsibility via existing prompt-sanitizer.ts | Plan author | 2026-04-16 |
| AR-03 | T-14-08 | Presentation-only primitives; real enforcement is server-side prompt field omission | Plan author | 2026-04-16 |
| AR-04 | T-14-10 | Same as T-14-08; server-side field omission means client tampering reveals nothing | Plan author | 2026-04-16 |
| AR-05 | T-14-14 | Ratio-based assertion decoupled from absolute snapshot values; snapshot is trendline documentation | Plan author | 2026-04-16 |
| AR-06 | T-14-17 | Plan 07 live harness covers prompt-layer regression; Plan 08 scope limited to UI rendering | Plan author | 2026-04-16 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-16 | 19 | 19 | 0 | gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-16
