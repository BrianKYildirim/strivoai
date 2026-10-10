# Strivo AI — Roadmap

## Milestones

| Milestone | Name                                                              | Phases      | Status              | Archive                                    |
| --------- | ----------------------------------------------------------------- | ----------- | ------------------- | ------------------------------------------ |
| v1.0      | foundation (resume analysis, career compass, navbar, auth)        | 1-9         | Shipped 2026-02     | Historical                                 |
| v2.0      | merit-system-monetization                                         | 10-27       | Shipped 2026-04-29  | [v2.0 roadmap](milestones/v2.0-ROADMAP.md) |
| v3.0      | analysis-persistence-merit-fixes-pricing-ux-feature-output-parity | 28-51       | Shipped 2026-06-09  | [v3.0 roadmap](milestones/v3.0-ROADMAP.md) |
| v4.0      | codebase-hardening (cleanup, hygiene, production testing)         | 1-9 (reset) | ✅ Shipped 2026-06-25 | [v4.0 roadmap](milestones/v4.0-ROADMAP.md) |
| v5.0      | platform-trust-reliability-intelligence (security, CORS, shared AI lifecycle, feature repairs, dashboard intelligence, Paddle retirement) | 1-9 (reset) | ✅ Shipped 2026-07-19 | [v5.0 roadmap](milestones/v5.0-ROADMAP.md) |

## Current Focus

**v5.1 — post-v5.0 interstitial milestone.** Small, targeted follow-on work carried out of the v5.0 close rather than a full new-milestone cycle. Phase 01 shipped 2026-07-20; Phase 01.1 is planned and blocks Phase 2.

## v5.1 Phases

| Phase | Name | Status |
| ----- | ---- | ------ |
| 01 | Elite→Free downgrade subscription-expiry handling | ✅ Complete 2026-07-20 (7 plans) |
| 01.1 | Tighten Document Upload Limits and Expand Recruiting Lens Input | Planned — 12 plans / 7 waves |
| 02 | AI Token & Cost Optimization | Paused — blocked by Phase 01.1 |
| 03 | Cross-Device Reliability and Compatibility | Planned — 20 plans / 11 waves |
| 04 | Incremental Elite Unlock for Previously Analyzed Free-Tier Resumes | Complete — 4/4 plans |
| 04.1 | Update Strivo Costing Workbook with Missing Costs and Formula Validation | Not planned — inserted after Phase 4 |
| 04.2 | Add Costing Telemetry for Product Usage, AI Calls, and OCR | Planned — 5 plans / 5 waves |

### Phase 1: Elite→Free downgrade subscription-expiry handling

**Goal:** Communicate and manage scheduled Elite-to-Free downgrades through the billing boundary.
**Status:** Complete 2026-07-20
**Plans:** 7/7 complete

### Phase 01.1: Tighten Document Upload Limits and Expand Recruiting Lens Input (INSERTED)

**Goal:** Enforce a two-page processing limit for resume-class PDF/DOCX uploads, remove Markdown/plain-text upload support end to end, and increase Recruiting Lens job-description capacity from 3,000 to 6,000 characters without truncation or billing regressions while preserving the LinkedIn PDF exemption.
**Requirements:** UPL-01, UPL-02, UPL-03, UPL-04, UPL-05, UPL-06, UPL-07, UPL-08, UPL-09, RCL-01, RCL-02, RCL-03, RCL-04, RCL-05. Canonical definitions and acceptance-proof ownership live in `phases/01.1-tighten-document-upload-limits-and-expand-recruiting-lens-in/01.1-BRIEF.md`.
**Depends on:** Phase 1
**Plans:** 12 plans across 7 waves

Plans:

**Wave 1** *(independent foundations; Plan 03 includes the DOCX evidence checkpoint)*

- [x] 01.1-01-PLAN.md — Canonical dual-import limits/messages and transport type seam
- [x] 01.1-02-PLAN.md — Permanent 51,000/12,750 Recruiting Lens combined ceiling
- [x] 01.1-03-PLAN.md — Deterministic PDF/DOCX/spoof fixtures and empirical DOCX metadata findings

**Wave 2** *(blocked on Wave 1 constants where noted)*

- [x] 01.1-04-PLAN.md — Recruiting Lens 6,000-character client/server contract
- [x] 01.1-05-PLAN.md — PDF/DOCX-only upload contract and reversible bucket migration

**Wave 3** *(blocked on the fixture/contract work)*

- [x] 01.1-06-PLAN.md — Pure edge document-sniffing and DOCX verdict primitives
- [x] 01.1-07-PLAN.md — Preview/production bucket apply gate with scoped history proof

**Wave 4** *(blocked on Waves 1-3)*

- [x] 01.1-08-PLAN.md — Authenticated `validate-document` seam, pdf-lib parser, and three-place registration
- [x] 01.1-09-PLAN.md — Shared browser precheck with PDF/DOCX boundaries and LinkedIn exemption

**Wave 5** *(blocked on both validation implementations)*

- [x] 01.1-10-PLAN.md — Five pre-storage integrations, anonymous-hero gating, and UI-SPEC interaction states

**Wave 6** *(blocked on all implementation and preview schema work; deterministic before function deployment)*

- [x] 01.1-11-PLAN.md — Identical-byte parser parity and secret-free local/mock no-state, LinkedIn, responsive, and accessibility proof

**Wave 7** *(blocked on the complete pre-deploy proof)*

- [x] 01.1-12-PLAN.md — Gated preview deploy, isolated post-deploy live suite, bundle/boot evidence, safe full baseline, and operator production rollout

Cross-cutting constraints:

- `.planning/` artifacts stay local and uncommitted; task commits explicitly name only non-`.planning` files; `.gitignore` is never edited.
- Resume validation rejects before storage, rows, Merit activity, or analysis; LinkedIn profile PDFs remain at the unchanged 12-page allowance.
- All client and edge limits/messages come from the zero-import shared module and Deno re-export bridge.
- `01.1-UI-SPEC.md` is required reading for every user-facing plan; exact copy, focus, busy, disabled, preservation, responsive, and accessibility contracts are acceptance criteria.
- New edge functions/tests are registered in `supabase/config.toml`, `scripts/deploy.ps1`, and `supabase/functions/deno.json`; Plan 11 remains local/mock only, and Plan 12 owns preview bundle/boot plus every live/production action.

### Phase 2: AI Token & Cost Optimization

**Goal:** Ground every per-feature, per-tier `maxTokens` limit in real production usage data instead of estimates — measure first, decide together, then implement and verify.

**Requirements**: TOK-01, TOK-02, TOK-03, TOK-04, TOK-05, TOK-06, TOK-07, TOK-08
**Depends on:** Phase 01.1
**Plans:** 13 plans across 11 waves (gap closure planned 2026-07-28)

**Requirement IDs (derived at `/gsd:plan-phase 2`):**

| ID | Requirement |
| --- | --- |
| TOK-01 | Permanent per-call Anthropic token telemetry persisted to Postgres, fire-and-forget (a telemetry failure can never fail an analysis), service-role-only |
| TOK-02 | Every live Anthropic call labelled with feature, server-resolved tier, call name, reqId and attempt; coverage locked by a static drift guard |
| TOK-03 | Operator-approved TEMP diagnostic caps applied across the full lockstep file set and deployed to production without boot regressions |
| TOK-04 | 21 production measurement runs (Free+Elite, ad-hoc real inputs) with telemetry row counts verified after each run |
| TOK-05 | `02-MEASUREMENT-REPORT.md` with all four required sections, a checked-in regenerating SQL file, and a per-feature output-shape audit |
| TOK-06 | HARD-STOP per-cell operator approval gate — budgets are approved individually, never auto-applied |
| TOK-07 | Only approved cells implemented, across the complete lockstep set, with the TEMP caps reverted in the same commit |
| TOK-08 | Post-change verification: re-run subset at final caps (out < maxTokens, zero 422s) plus a production telemetry soak |

**Scope brief (operator-supplied):**

1. Run 3 Free-tier and 3 Elite-tier analyses for each of Onboarding/Resume Analysis, LinkedIn Grader, Career Compass, and Recruiting Lens — unique accounts, substantially different resume/LinkedIn inputs (24 analyses total).
2. Mine production Supabase logs for each analysis: total execution time, input tokens, output tokens (where available), total token consumption, and any other useful performance/cost metrics.
3. From that data, derive an appropriate max token limit per feature per tier, balancing headroom for quality, consistent UX, long-term profitability, and avoiding over-allocation.
4. Present a report — usage, execution times, averages, ranges, outliers, estimated costs, recommended limits — and agree the final budgets together. **Operator checkpoint: budgets are approved, not auto-applied.**
5. After approval, implement the finalized per-feature, per-tier limits across the application and verify behavior under realistic usage.

**Related prior art:** `.planning/maxtoken-tuning/TRACKER.md` (existing per-feature/per-tier tuning mini-milestone — LinkedIn done, free-tier diagnostic pass live, staging-only).

Plans:

- [x] 02-01-PLAN.md — Operator prerequisites: non-admin free-tier prod account + TEMP cap approval
- [x] 02-02-PLAN.md — ai_call_telemetry table + never-throws writer + invokeAnthropicText seam
- [x] 02-03-PLAN.md — Thread telemetry through Resume Analysis + Career Compass
- [x] 02-04-PLAN.md — Thread telemetry through LinkedIn / Recruiting Lens / Interview Prep + coverage guard
- [x] 02-05-PLAN.md — Apply TEMP diagnostic caps across the full lockstep set + close stale TRACKER
- [x] 02-06-PLAN.md — Operator: prod migration + deploy + the 21 measurement runs (per-run row verification)
- [x] 02-07-PLAN.md — Report SQL + output-shape audit + 02-MEASUREMENT-REPORT.md
- [x] 02-08-PLAN.md — HARD STOP: per-cell operator approval of every proposed cap (LOCKED 2026-07-27, 15/15 APPROVE)
- [x] 02-09-PLAN.md — Implement approved caps across the lockstep set (TEMP revert in the same commit)

**Wave 8** *(historical partial execution; safe-resume decision required)*

- [x] 02-10-PLAN.md — MARK-AND-SKIP approved 2026-07-28; historical production evidence preserved as partial, `gaps_found` remains authoritative, and TOK-08 moved to Plans 02-11 through 02-13

**Wave 9** *(blocked on Plan 02-10 recovery)*

- [ ] 02-11-PLAN.md — Bound Recruiting Lens `rl-call-3` output demand, mirror prompt/schema contracts, bump cache variant, and prove deploy readiness

**Wave 10** *(blocked on Plan 02-11 completion)*

- [ ] 02-12-PLAN.md — Operator: deploy the bounded contract and run the dense Recruiting Lens production proof

**Wave 11** *(blocked on Plan 02-12 completion)*

- [ ] 02-13-PLAN.md — Operator: complete the seven-day, 20-call, four-feature telemetry soak and record the final TOK-08 verdict

**Cross-cutting constraints:**

- Keep every Recruiting Lens call at 12,000 tokens, the tier total at 36,000, the permanent watch floor at 15%, and the JD input limit at 6,000 characters.
- Production deploys and paid analyses remain operator-executed; agents may prepare commands and verify read-only evidence only.
- Attempt-2 rows and cache hits never substitute for a passing first-attempt telemetry row.

### Phase 3: Cross-Device Reliability and Compatibility

**Goal:** Make every user-facing feature work from the first click across supported browsers, devices, screen sizes and normal network conditions — fixing each device-specific root cause at source, so that recoverable internal failures recover automatically instead of becoming broken user experiences.

**Requirements**: XDEV-01, XDEV-02, XDEV-03, XDEV-04, XDEV-05, XDEV-06, XDEV-07, XDEV-08, XDEV-09, XRUN-01, XRUN-02, XRUN-03, XRUN-04, XRUN-05, XRUN-06, XTEST-01, XTEST-02, XTEST-03, XTEST-04, XLOG-01, XLOG-02
**Depends on:** Phase 2 (sequenced after; see coordination note)
**Plans:** 20 plans across 11 waves (planned 2026-07-27; plan-checker PASSED, 0 blockers)

**Problem statement (operator-supplied):** Strivo works on the operator's device, but users on other devices and browsers intermittently experience failures. This phase is to fix that permanently rather than case-by-case.

**Requirement IDs (provisional — to be ratified at `/gsd-plan-phase 3`):**

| ID | Requirement |
| --- | --- |
| XDEV-01 | Supported browser/device baseline defined and enforced; unsupported browsers get a controlled message, never a crash or white screen |
| XDEV-02 | Every confirmed device-specific root cause fixed at source — no error hiding, no generic retry wrappers |
| XDEV-03 | Platform API gaps closed (unsupported JS APIs, missing polyfills, browser-worker incompatibilities incl. the PDF.js worker) |
| XDEV-04 | Auth/session storage works under incognito/private mode and restricted-storage browsers (Safari ITP, partitioned storage) |
| XDEV-05 | Responsive + touch correctness across desktop/tablet/mobile, incl. iOS Safari viewport behavior and tap-target handling |
| XDEV-06 | Upload + PDF/DOCX extraction parity across browsers (MIME reporting differences, file pickers, sniffing) |
| XDEV-07 | Stale-bundle and cleared-cache safety — version-aware assets and recovery from chunk-load failures after redeploy |
| XDEV-08 | Common browser extensions cannot break flows; extension-injected errors are isolated from app error reporting |
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

**Audit surfaces:** Resume Analysis · LinkedIn Grader · Career Compass · Recruiting Lens · onboarding · dashboard · authentication · uploads and PDF extraction · Stripe checkout · Free and Elite flows · admin isolation.

**Test matrix (operator-supplied):** Chrome / Safari / Firefox / Edge, current and previous major · Windows and macOS · iPhone Safari and Android Chrome · desktop, tablet and mobile layouts · incognito/private mode · slow and unstable internet · refresh/navigation during processing · cleared cache and stale cached deployments · common browser extensions · repeated and rapid clicks.

**Root-cause categories to investigate:** unsupported JS APIs and missing polyfills · browser-worker incompatibilities · race conditions and timing assumptions · authentication/session-storage differences · stale frontend bundles and cache issues · environment-variable or deployment mismatch · responsive-layout and touch-event failures · file upload, MIME and PDF differences · realtime connection failures · frontend timeouts while the backend is still processing · extension-injected errors · device memory and performance limitations.

**Cross-cutting constraints:**

* Do not merely hide errors or add generic retries — find and fix each root cause.
* Do not modify production until all fixes pass preview or production-equivalent verification.
* Stripe checkout UI must appear immediately.
* XRUN-01..05 extend the existing v5.0 shared analysis lifecycle (`create_or_recover` / `transition` CAS RPCs, `useAnalysisRun`) rather than introducing a parallel mechanism.
* Real Safari/macOS, Edge/Windows, iPhone Safari and Android Chrome coverage is not reachable from the primary dev machine — the automated suite covers engines + emulation, and XTEST-04 owns the documented manual real-device pass. Honest limits are published, not implied.

**Coordination note (v5.1 concurrency):** Phase 2 (AI Token & Cost Optimization) is in flight and owned separately; it introduces `ai_call_telemetry` for *server-side* Anthropic call telemetry. XLOG-01/02 covers *client-side* device diagnostics — related but distinct. Planning must reconcile the two rather than duplicating a telemetry surface, and must not modify Phase 2's in-flight files.

**Completion report (required at phase close):** every cross-device issue found · root cause and fix · supported browser/device matrix · automated and manual test results · remaining unsupported environments · commit hashes · deployment and rollback steps · final verdict of READY, READY WITH WARNINGS, or NOT READY.

Plans:

**Wave 1** *(independent foundations; 03-01 is operator-gated)*

- [x] 03-01-PLAN.md — `client_error_diagnostics` table, separate from Phase 02's `ai_call_telemetry` (**`autonomous: false`** — preview-first apply, operator applies production)
- [x] 03-02-PLAN.md — Build-ID stamp + `/version.json` (also supplies XLOG-01's app-version field)
- [x] 03-03-PLAN.md — Five-project Playwright device matrix wired into `verify:baseline`

**Wave 2** *(blocked on Wave 1)*

- [x] 03-04-PLAN.md — Fire-and-forget diagnostics ingest endpoint + three-place registration
- [x] 03-05-PLAN.md — Matrix-first defect discovery (D-22) and honest triage (D-23)

**Wave 3** *(blocked on Wave 2)*

- [x] 03-06-PLAN.md — Generalize the error log into the shared client-diagnostics seam + PII guard
- [x] 03-10-PLAN.md — Responsive, touch and motion contract across the 11 audit surfaces

**Wave 4** *(blocked on Wave 3; 03-07 and 03-09 both touch `src/main.tsx` — execute-phase forces sequential)*

- [x] 03-07-PLAN.md — UI-SPEC Surface A: ES5 pre-bundle guard replacing today's white screen
- [x] 03-08-PLAN.md — **Root cause:** delete the `supabaseClient.ts` `storage:` override so auth-js's own fallback engages
- [x] 03-09-PLAN.md — Close platform-API gaps at source via the proven guarded-polyfill pattern

**Wave 5–7** *(gates and recovery)*

- [x] 03-11-PLAN.md — UI-SPEC Surface B: in-app capability gate (`supported | degraded | unbootable`)
- [x] 03-12-PLAN.md — UI-SPEC Surface C: frozen closed set of nine client error codes + leak guard
- [x] 03-13-PLAN.md — UI-SPEC Surface E: silent single-reload recovery from a redeploy-deleted chunk
- [x] 03-14-PLAN.md — Realtime status callbacks + network/visibility seam on the **live** path (D-27)

**Wave 8–9** *(money paths last, per D-25)*

- [x] 03-15-PLAN.md — UI-SPEC Surface D: delete the four fabrications, drive stages from real state
- [x] 03-16-PLAN.md — Extract the shared submit-guard primitive (D-29); route every money-path submit through it
- [x] 03-17-PLAN.md — Prove one-click integrity across five engines by extending the two existing specs
- [x] 03-18-PLAN.md — Lock instant-open checkout behavior and make it assertable on every device

**Wave 10–11** *(verification and report)*

- [x] 03-19-PLAN.md — Full gate + Preview deploy + qualified operator closure (**Release-ready; customer-domain cutover deferred**)
- [x] 03-20-PLAN.md — Published supported-browser matrix + eight-item completion report with qualified verdict

### Phase 4: Incremental Elite Unlock for Previously Analyzed Free-Tier Resumes

Problem: When a Free user analyzes a resume, the system generates the Free-tier sections and locks the Elite-only sections. If that user later upgrades to Elite and reruns the same previously analyzed resume, preserve the original Free-tier output exactly, generate only missing Elite-only sections, merge and persist them, and avoid future regeneration.

Eligibility: existing analysis belongs to the authenticated user; it was originally processed under Free; user currently has Elite access; valid Free analysis is available; request matches the same stored resume/document and analysis record using the strongest stable identifier rather than filename alone; and one or more Elite-only sections are missing.

Acceptance: upgrading Free to Elite does not fully reanalyze the same stored resume; original Free output is byte-for-byte/structurally unchanged; only missing Elite sections are generated and persisted; subsequent loads need no generation; incremental usage and cost are logged accurately; failure cannot erase or alter Free analysis; changed resumes receive a new full analysis; relevant tests, lint, type checks, and production build pass.

Implementation: inspect the existing resume-analysis flow, schema, prompts, result merger, tier checks, and frontend loading. Extend the existing flow with the smallest cohesive backend, database, AI-generation, and frontend change; reuse current types, validators, repositories, API conventions, authorization checks, logging, and UI components; do not create a parallel analysis system.

**Goal:** Unlock only missing Elite sections on the same eligible stored Free analysis while preserving every existing value, persisting atomically, converging replays on one charge/result, and keeping changed content on the normal full-analysis path.
**Requirements**: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09
**Depends on:** Phase 3
**Plans:** 4/4 plans executed

Plans:

**Wave 1** *(parallel foundation)*

- [x] 04-01-PLAN.md — Immutable missing-section detector, allowlisted delta merge, narrow validation, conditional prompts, and pure Deno coverage
- [x] 04-02-PLAN.md — Service-role-only atomic persistence RPC, lockstep types, remote transaction coverage, and blocking preview schema push

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-03-PLAN.md — Authenticated `elite_unlock` lifecycle, missing-only model calls, telemetry/merit behavior, and queue fallback

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-04-PLAN.md — Same-row Results UX, approved accessibility/copy contract, full regression baseline, and preview E2E evidence

Cross-cutting constraints:

- AC-01 / T-04-03: Free-owned and existing paid values are immutable; model output is an allowlisted delta, never a replacement result.
- AC-05 / T-04-01 / T-04-02 / T-04-04: owner, current Elite access, original Free tier, base linkage, stored text, and stable content identity are server-authoritative.
- AC-07 / AC-09 / T-04-05 / T-04-07: validation precedes one atomic compare-and-swap transaction; retries and concurrency converge on one durable result and financial settlement.
- Preview schema/function writes are operator-gated; production remains untouched unless the operator gives the exact signal `apply production`.

## Shipped v5.0 Summary

<details>
<summary>✅ v5.0 — Platform Trust, Reliability & Intelligence (Phases 1-9, reset; 08.1/08.2/08.3 INSERTED) — SHIPPED 2026-07-19</summary>

41/41 v5.0 requirements satisfied; VER-01/02/04/05 closed on evidence (seven-layer `verify:baseline`, machine-enforced 125/125 VER-02 coverage registry, production Free+Elite real-account pass, 14-item VER-05 evidence report + completeness guard). Operator sign-off 2026-07-19. Full detail: [v5.0 roadmap](milestones/v5.0-ROADMAP.md) · [v5.0 requirements](milestones/v5.0-REQUIREMENTS.md) · [MILESTONES.md](MILESTONES.md).

Phases (9; 08.1/08.2/08.3 INSERTED):

- [x] Phase 1: Cross-Origin & Error-Contract Foundation (8/8) — 2026-07-01
- [x] Phase 2: Security Audit & Remediation (8/8) — 2026-07-02
- [x] Phase 3: Shared Analysis Lifecycle Substrate (dormant) (7/7) — 2026-07-02
- [x] Phase 4: Feature Migration A — Recruiting Lens + LinkedIn Grader (6/6) — 2026-07-02
- [x] Phase 5: Feature Migration B — Resume Analysis + Onboarding (3/3) — 2026-07-06
- [x] Phase 6: Feature Migration C — Career Compass (3/3) — 2026-07-07
- [x] Phase 7: Dashboard Intelligence (3/3) — 2026-07-08
- [x] Phase 8: Paddle Retirement (5/5) — 2026-07-09
- [x] Phase 08.1: LinkedIn Grader → 4-section scoring (INSERTED) (3/3)
- [x] Phase 08.2: Career Compass Free/Elite differentiation (INSERTED) (5/5)
- [x] Phase 08.3: LinkedIn Grader rubric update (INSERTED) (4/4)
- [x] Phase 9: Final Verification & Milestone Report (12/12) — 2026-07-19

Key outcomes:

* **CORS foundation:** one env-driven `ALLOWED_ORIGINS` allowlist across all 21 active Edge Functions (origin reflection + `Vary: Origin`, fail-closed, no credential-bearing wildcard), `withCors`/`jsonError` keep 4xx/5xx CORS-readable; the `www.strivoai.net` outage closed and guarded by a table-driven test + static 21-function drift guard.
* **Security:** deferred SEC-01..10 closed + full 17-domain audit; 4 HIGH money-path/IDOR findings remediated with RED→GREEN guards (Merit idempotency forwarding, refund-after-save across three functions, analyze-resume IDOR, Paddle webhook replay-window), advisor floor held at 15.
* **Shared lifecycle + 5 feature migrations:** one persistent idempotent Merit-safe 11-state lifecycle (CAS RPCs, settle-on-saved, refund-exactly-once, transient-only retry, strict no-masking validation, error taxonomy, `useAnalysisRun` recovery) with the 4-arg idempotent Merit RPC wired end-to-end; Onboarding "Taking Longer" hang killed; LinkedIn rebuilt to deterministic server-computed evidence-backed scoring (no ~52 clustering).
* **Dashboard intelligence:** Recruiter First Impression + Profile Alignment derived only from stored data (no on-load AI, no fabricated scores), Progress & Achievements deleted, fixed section order, protected areas untouched.
* **Paddle retirement:** two-source expiration gate cleared, Paddle removed end-to-end (repo + preview + prod schema/function/env/types) behind a permanent no-live-surface guard, billing history preserved.
* **Final verification:** seven-layer `verify:baseline` green, 125/125 VER-02 coverage registry, production Free+Elite real-account pass (PII guard green), 14-item evidence report.

Deliberate production operational states at close (report item 14, not requirement shortfalls): Career Compass ships **dormant** on production (Flip-5 abort → `/gsd-debug` `elite-cc-mixed-format`); `MERIT_SYSTEM_ENABLED` is **ON** by operator decision (`sha256('true')`, correcting the plan's original D-03 OFF assumption; open follow-up verification pass).

Known deferred at close: 3 open debug sessions (`elite-cc-mixed-format`, `queue-path-tier-downgrade`, `stripe-checkout-key-mismatch`); operator/residual follow-ups SEC-02-08-CRON (prod cron → preview host), R-06-01 (internal-worker Career Compass all tiers at `free`), and the real LinkedIn PII recoverable from commit `21925c88` (synthetic at HEAD; purge is an operator decision). See STATE.md → Deferred Items / RESIDUAL-REGISTER.

</details>

## Shipped v4.0 Summary

<details>
<summary>✅ v4.0 — Codebase Hardening (Phases 1-9, reset) — SHIPPED 2026-06-25</summary>

42/42 v4.0 requirements satisfied; cross-phase integration PASS (5/5 business-critical flows intact); zero-functional-change constraint held across all 10 phases. Full detail: [v4.0 roadmap](milestones/v4.0-ROADMAP.md) · [v4.0 requirements](milestones/v4.0-REQUIREMENTS.md) · [v4.0 audit](milestones/v4.0-MILESTONE-AUDIT.md).

Phases (10; 7.1 INSERTED):

- [x] Phase 1: Testing Strategy & Regression Baseline (5/5) — 2026-06-11
- [x] Phase 2: Repository Hygiene & State Reconciliation (5/5) — 2026-06-13
- [x] Phase 3: Cross-Domain Inventory & Audit (6/6) — 2026-06-14
- [x] Phase 4: Dead Code & Refactor Cleanup (6/6) — 2026-06-14
- [x] Phase 5: Deep Test Coverage Expansion (7/7) — 2026-06-19
- [x] Phase 6: Dependency Hygiene (6/6) — 2026-06-20
- [x] Phase 7: Environment Variable Audit & Organization (4/4) — 2026-06-23
- [x] Phase 7.1: Runtime Error Handling & Reliability (INSERTED) (5/5) — 2026-06-24
- [x] Phase 8: Database Cleanup & Migrations (5/5) — 2026-06-25
- [x] Phase 9: Performance & Maintainability Refactoring (4/4) — 2026-06-25

Key outcomes:

* Testing safety net: layered vitest + deno + Playwright with a blocking `verify:baseline` regression gate (CI + `deploy.ps1`), anchored at the `v4.0-baseline` tag; deno edge coverage 284 → 704.
* Repository hygiene + evidence-backed cross-domain audit catalog (KEEP-LIST gating all removals); dead-code cleanup with lint + type-check clean.
* Dependency hygiene: 9 major bumps + vuln remediation, npm audit 32 → 20 (0 critical), reproducible lockfiles, each behind a rollback path.
* Environment + runtime reliability: canonical `docs/ENVIRONMENT.md` + fail-closed validation; inline error taxonomy + auth re-throw guards.
* Database + performance hardening: 15 reversible migrations dropped the security advisor 73 → 15; behavior-preserving refactors with measured no-regression.

Carried backlog at close: Nyquist VALIDATION sign-off for Phases 04/05 + the R-03 flaky `AnalysisHistory.interviewPrep` test (non-blocking).

</details>

## Shipped v3.0 Summary

<details>
<summary>v3.0 — Analysis Persistence, Merit Fixes, Pricing UX & Feature Output Parity (Phases 28-51) — SHIPPED 2026-06-09</summary>

Active v3.0 requirements closed at 127/127 per [v3.0 audit](milestones/v3.0-MILESTONE-AUDIT.md). Phase 41 Interview Prep IDs (`IPC-01..04`, `CACHE-08`, `TEST-04`) were deferred to a future Interview Prep milestone and excluded from active v3.0 traceability. Phase 48 was retired; Phase 50 is historical only and replaced by Phase 51.

Key outcomes:

* Merit economy fixes: Free 10/month, optimistic deduction/refund coverage, idempotency, and Stripe shop reconciliation.
* Pricing and billing fixes: working upgrade paths, customer portal wiring, billing route repair, and Strivo design-token alignment.
* Cross-feature context and history parity: prior selectors, LinkedIn auto-pull, AnalysisHistory routing, and persistence repairs.
* Feature output/cache parity: Resume Analysis, LinkedIn Grader, Career Compass, and Recruiting Lens active flows verified.
* Database lean-intelligence foundation: users/targets, versioning, behavior, outcomes, lifecycle, archive, and cache substrate.
* Production safety: Interview Prep gated behind Coming Soon on production while future re-enable work stays parked.
* Document extraction: Phase 51 parser-first, cost-optimized extraction replaces obsolete Phase 50 behavior.

Archives:

* [v3.0 roadmap](milestones/v3.0-ROADMAP.md)
* [v3.0 requirements](milestones/v3.0-REQUIREMENTS.md)
* [v3.0 audit](milestones/v3.0-MILESTONE-AUDIT.md)
* [milestone summary](MILESTONES.md)

</details>

## Backlog / Parking Lot

* VERIFICATION.md backfills for v2.0 Phases 10/19/22/24/27 (carry-over operator action; production state proves correctness; backfill via `/gsd-validate-phase` if needed).
* Cache analytics dashboard (hit rate, popular fingerprints, cost savings) — internal-only telemetry (FUT-01).
* Per-user cache invalidation UI ("Re-run analysis without using cache") — design later if users complain (FUT-01).
* Net-new feature surfaces (no new AI features, no new feature categories).
* Nyquist VALIDATION sign-off for v4.0 Phases 04/05 + the R-03 flaky `AnalysisHistory.interviewPrep` test (carried from v4.0 close; non-blocking — `/gsd-validate-phase 4|5`).
* Interview Prep Coach re-enable on production (IP-RE-01) — gated off via "Coming Soon"; single `VITE_FEATURE_INTERVIEW_PREP` flip + redeploy after staging soak. Explicitly out of v5.0 scope (the shared lifecycle covers the other five features); code/prompts/edge functions remain in-repo.
* v5.x deferrals from research: Elite cross-analysis depth weight tuning, role/job-specific Profile Alignment layer, LinkedIn rubric weight calibration against a labeled profile set, longitudinal trend views.
* v5.0 close carry-overs: resolve the 3 open debug sessions (`elite-cc-mixed-format`, `queue-path-tier-downgrade`, `stripe-checkout-key-mismatch`); SEC-02-08-CRON prod cron re-point; R-06-01 internal-worker Career Compass tier resolution; Career Compass production dormancy re-enable after `elite-cc-mixed-format` clears; `MERIT_SYSTEM_ENABLED` follow-up verification pass; operator decision on purging real LinkedIn PII from git history (commit `21925c88`).

***

*Roadmap last updated: 2026-07-19 — **v5.0 Platform Trust, Reliability & Intelligence SHIPPED** (9 phases + 3 INSERTED; 41/41 requirements). v5.0 detail archived to [`milestones/v5.0-ROADMAP.md`](milestones/v5.0-ROADMAP.md); requirements to [`milestones/v5.0-REQUIREMENTS.md`](milestones/v5.0-REQUIREMENTS.md). Working roadmap collapsed to the shipped summary above; v4.0/v3.0 summaries retained. Next: `/gsd:new-milestone`.*

### Phase 04.1: Update Strivo Costing Workbook with Missing Costs and Formula Validation (INSERTED)

**Goal:** Update the supplied Strivo costing workbook in place while preserving its original design, making all three scenarios formula-consistent, adding sourced missing fixed and usage-based costs, and verifying that revenue, cost, profit, and founder estimates reconcile under editable assumptions.
**Requirements**: CWB-01 through CWB-13. Canonical scope and acceptance criteria live in `phases/04.1-update-strivo-costing-workbook-with-missing-costs-and-formul/04.1-BRIEF.md`.
**Depends on:** Phase 4
**Plans:** 3/3 plans executed

Plans:

- [x] 04.1-01 — Baseline audit and connected-Excel tooling gate
- [x] 04.1-02 — Auditable shared inputs and formula-consistent costing model
- [x] 04.1-03 — Independent sensitivities, render/security proof, and final save verification

### Phase 04.2: Add Costing Telemetry for Product Usage, AI Calls, and OCR (INSERTED)

**Goal:** Add production telemetry that replaces estimated costing inputs with real usage data for product activity, Merit settlement, Anthropic calls, document extraction, and existing OCR routes without changing product behavior or the costing workbook.
**Requirements**: TBD. Canonical scope, constraints, measurements, schemas, reporting outputs, privacy rules, and acceptance tests live in `phases/04.2-add-costing-telemetry-for-product-usage-ai-calls-and-ocr/04.2-BRIEF.md`.
**Depends on:** Phase 04.1
**Plans:** 5/5 plans executed — 04.2-05 INCOMPLETE (production activation gate unopened; `verify:baseline` blocker outstanding)

Plans:

**Wave 1**

- [x] 04.2-01 — Costing schema, pricing, retention, and service-role views

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04.2-02 — Trusted feature-run, Merit, and AI-attempt primitives

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04.2-03 — Browser/document/OCR correlation and no-double-counting

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04.2-04 — End-to-end feature and queue integration

**Wave 5** *(blocked on Waves 1-4 completion)*

- [~] 04.2-05 — Canonical reporting, preview proof, baseline, and production gate
      Tasks 1-3 done and preview-proven (remote lane 40/0, operator verification 41/0).
      Task 4 production gate presented and UNOPENED — only the exact operator signal
      `apply production` authorizes it. Blocker: `verify:baseline` does not exit 0
      (pre-existing `@xdev` webkit timing test, see 04.2-05-SUMMARY.md).
