# Phase 3 — Cross-Device Reliability and Compatibility (BRIEF)

**Status:** Not planned. Run `/gsd-plan-phase 3`.
**Milestone:** v5.1 (added as a new phase after existing Phases 01 / 01.1 / 02 — none of which were modified).
**Branch:** `staging`.

This file is the canonical operator-supplied scope for Phase 3. `ROADMAP.md` carries the
summary; this brief carries the full text. Requirement IDs below are **provisional** and are
ratified at `/gsd-plan-phase 3`.

---

## Recurring issue

Strivo works on the operator's device, but users on other devices and browsers sometimes
experience failures. Fix this permanently across all user-facing features.

## Goal

Every feature must work from the first click across supported browsers, devices, screen sizes
and normal network conditions. Recoverable internal failures must recover automatically and
must not become broken user experiences.

## Audit and test

- Resume Analysis
- LinkedIn Grader
- Career Compass
- Recruiting Lens
- onboarding
- dashboard
- authentication
- uploads and PDF extraction
- Stripe checkout
- Free and Elite flows
- admin isolation

## Test across

- Chrome, Safari, Firefox and Edge
- current and previous major versions
- Windows and macOS
- iPhone Safari and Android Chrome
- desktop, tablet and mobile layouts
- incognito/private mode
- slow and unstable internet
- refresh/navigation during processing
- cleared cache and stale cached deployments
- common browser extensions
- repeated and rapid clicks

## Investigate device-specific causes including

- unsupported JavaScript APIs and missing polyfills
- browser-worker incompatibilities
- race conditions and timing assumptions
- authentication/session-storage differences
- stale frontend bundles and cache issues
- environment-variable or deployment mismatch
- responsive-layout and touch-event failures
- file upload, MIME and PDF differences
- realtime connection failures
- frontend timeouts while the backend is still processing
- extension-injected errors
- device memory and performance limitations

## Required behaviour

- One click starts one job and one merit charge.
- Duplicate clicks reuse the same attempt.
- Refreshing or reconnecting restores active and completed results.
- Realtime failure falls back to polling.
- Slow devices and networks must not show false failures.
- Raw JavaScript, database, provider or stack-trace errors never appear.
- Unsupported browsers receive a controlled message rather than a crash.
- Stripe checkout UI appears immediately.
- Every confirmed device-specific issue receives a regression test.

## Also required

- Build a production-equivalent automated browser/device test suite and add it to the launch
  verification pipeline.
- Add privacy-safe logging for browser, OS, device type, app version, lifecycle stage and
  sanitized error category so cross-device failures can be diagnosed without logging user
  documents.
- Do not merely hide errors or add generic retries. Find and fix each root cause.
- Do not modify production until all fixes pass preview or production-equivalent verification.

## At completion report

- every cross-device issue found
- root cause and fix
- supported browser/device matrix
- automated and manual test results
- remaining unsupported environments
- commit hashes
- deployment and rollback steps
- final verdict: READY, READY WITH WARNINGS, or NOT READY

---

## Provisional requirement catalog

Ratified at `/gsd-plan-phase 3`. Mirrors the table in `ROADMAP.md`.

| ID | Requirement |
| --- | --- |
| XDEV-01 | Supported browser/device baseline defined and enforced; unsupported browsers get a controlled message, never a crash or white screen |
| XDEV-02 | Every confirmed device-specific root cause fixed at source — no error hiding, no generic retry wrappers |
| XDEV-03 | Platform API gaps closed (unsupported JS APIs, missing polyfills, browser-worker incompatibilities incl. the PDF.js worker) |
| XDEV-04 | Auth/session storage works under incognito/private mode and restricted-storage browsers (Safari ITP, partitioned storage) |
| XDEV-05 | Responsive + touch correctness across desktop/tablet/mobile, incl. iOS Safari viewport behavior and tap-target handling |
| XDEV-06 | Upload + PDF/DOCX extraction parity across browsers (MIME reporting differences, file pickers, sniffing) |
| XDEV-07 | Stale-bundle and cleared-cache safety — version-aware assets and recovery from chunk-load failures after redeploy |
| XDEV-08 | Common browser extensions cannot break flows; extension-injected errors isolated from app error reporting |
| XDEV-09 | Low-memory / slow-CPU devices degrade gracefully without false failures |
| XRUN-01 | One click starts exactly one job and exactly one Merit charge |
| XRUN-02 | Duplicate and rapid-repeat clicks reuse the same attempt — never a second job, never a second charge |
| XRUN-03 | Refresh, navigation during processing, and reconnect restore active and completed results |
| XRUN-04 | Realtime connection failure falls back to polling automatically |
| XRUN-05 | Frontend timeouts never report failure while the backend is still processing |
| XRUN-06 | Raw JavaScript, database, provider and stack-trace errors never reach the user; surfaced errors are mapped and actionable |
| XTEST-01 | Production-equivalent automated browser/device suite (engines + emulated devices + throttled/offline network conditions) |
| XTEST-02 | Suite wired into the launch verification pipeline (`verify:baseline`) |
| XTEST-03 | Every confirmed device-specific issue gets a regression test |
| XTEST-04 | Documented manual real-device pass + published supported matrix + explicitly listed remaining unsupported environments |
| XLOG-01 | Privacy-safe diagnostics: browser, OS, device type, app version, lifecycle stage, sanitized error category |
| XLOG-02 | Hard PII guarantee — never logs user documents or resume/LinkedIn content; enforced by a guard test |

---

## Known constraints to carry into planning

Recorded now so planning does not rediscover them.

1. **Build on the existing lifecycle.** XRUN-01..05 must extend the v5.0 shared analysis
   lifecycle (`create_or_recover` / `transition` CAS RPCs, `useAnalysisRun`, the 4-arg
   idempotent `check_and_deduct_merits`) rather than introducing a parallel mechanism.
2. **Real-device coverage is not reachable from the primary dev machine.** Automated coverage
   is Chromium/Firefox/WebKit engines plus Playwright device emulation; genuine Safari/macOS,
   Edge/Windows, iPhone Safari and Android Chrome are owned by XTEST-04 as a documented manual
   pass. WebKit-the-engine is not Safari-the-browser, and the final matrix must say so plainly.
   If a cloud device farm is later approved, it is new paid infrastructure and a deliberate
   break from the "no new infrastructure" stack constraint.
3. **Preview is not production-equivalent for AI output.** Preview runs `AI_TEST_MODE`
   fixtures and never calls Anthropic, so AI content cannot be validated there. Preview CORS is
   an exact-match allowlist, and the Vercel Git link is disconnected — preview frontends must be
   built by hand. "Production-equivalent verification" therefore includes operator-run manual
   steps, which planning must schedule explicitly rather than assume.
4. **v5.1 concurrency.** Phase 2 (AI Token & Cost Optimization) is in flight and separately
   owned; it introduces `ai_call_telemetry` for server-side Anthropic call telemetry. XLOG-01/02
   is client-side device diagnostics — related but distinct. Planning must reconcile the two
   rather than duplicating a telemetry surface, and must not modify Phase 2's in-flight files.
5. **Scope is large.** This is a multi-plan phase. It was explicitly assessed as too large for
   a single quick task.
