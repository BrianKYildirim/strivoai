# Phase 05 — Suspected-Behavior Register (D-08)

Pin-and-log home for latent-bug-looking behavior surfaced while WRITING tests in
Phase 5. Per D-08 the **default** is to write a characterization test asserting the
CURRENT behavior and log the observation here; **escalate** (raise an operator
deviation/checkpoint) ONLY when the suspected bug touches a business-critical flow
(resume / career / merit / auth / billing) or a security boundary.

This register records **behavior descriptions and reason codes only** — never a
secret value, API key, or PII (threat T-05-01, mirroring the Phase-2 secret-scan
discipline). Mirrors the prose+table style of
`.planning/phases/01-testing-strategy-regression-baseline/deferred-items.md`.

**Severity legend:** `critical → escalate` (business-critical / security; raise a
deviation) · `minor → log` (characterize current behavior + log here, no fix this
phase — the fix is a future `/gsd-debug` pass).

---

## Register

| id | file:handler | suspected issue | current behavior pinned (test ref) | what would confirm it's a bug | severity | disposition |
|----|--------------|-----------------|------------------------------------|-------------------------------|----------|-------------|
| SB-05-01 | `analyze-career/index.ts` | The drifted `analyze-career/phase22-contract.test.ts` asserted "≥ 2 `career_compass` usage call sites (short-circuit + full parse)". At BOTH `v4.0-baseline` and HEAD there is exactly **1** `recordUsageWithAnalysis(...)` call site — the short-circuit (reused-LinkedIn-grade) success path and the full-parse success path appear to converge on a single post-success usage-record call rather than two. | Pinned to the actual count of **one** canonical `recordUsageWithAnalysis` call site (`analyze-career/phase22-contract.test.ts` → "22-04 SC-6: canonical single recordUsageWithAnalysis call site (current behavior)"). | If the cross-feature-memory short-circuit success path were found to return a career result to the user WITHOUT recording any usage row (i.e. a free career analysis on the reuse path), that would be a merit/usage-accounting loss. Static reading shows the single call site is on the shared success path, so this is most likely intentional convergence, not a loss. | minor → log | Pinned (characterization). Not escalated: `record_ai_usage` and the merit gateway are present and unchanged vs baseline; no evidence of a free-analysis leak from static reading. A future `/gsd-debug` pass could confirm the reuse-path success branch reaches the single call site at runtime. |
| SB-05-02 | `grade-linkedin/index.ts` | The LIG-11 free-scan branch is a **full bypass** — when `isFreeScan(cycleGradeCount)` is true it skips BOTH the entitlement gate AND the usage decrement (records `credits=0` after success only). The in-source comment acknowledges a worst-case **TOCTOU**: up to 1 extra free scan per billing cycle under concurrent requests. | Pinned via the `linkedin-free-scan-bypass` log marker + the `credits=0` post-success record assertions (`grade-linkedin/phase22-contract.test.ts` Pitfall-3 cases; `grade-linkedin/entitlement.test.ts` bypass-marker case). | If the TOCTOU window allowed MORE than the documented worst-case (≫ 1 extra free scan per cycle), or if the bypass leaked into the paid path. The source comment ("Worst-case TOCTOU: 1 extra free scan per cycle (accepted per T-05-01)") indicates this was a deliberate, bounded design accept. | minor → log | Pinned (characterization). Not escalated: explicitly an accepted, bounded design trade-off (T-05-01) documented in the handler source, not a regression. |
| SB-05-04 | `interview-prep-analyze/index.ts` | The handler's terminal `catch (err)` (index.ts:710) does **NOT** re-throw a thrown `Response` the way `interview-prep-evaluate/index.ts:345` does (`if (err instanceof Response) return err;`). `requireAuth(type:'user')` throws a `Response(401 Unauthorized)` on a missing/invalid bearer; in interview-prep-analyze that thrown 401 is swallowed by the generic catch and surfaced as a **500 `internal_error`** instead of the intended 401. So an unauthenticated caller to interview-prep-analyze gets a 500, while the same call to interview-prep-evaluate gets a 401. | Pinned via TRUE handler invocation: `interview-prep-analyze/__tests__/analyze.failure-branches.test.ts` → "valid intake, missing auth → 500 internal_error (thrown 401 Response swallowed by catch)" asserts the ACTUAL 500/`internal_error`. (Body-parse + Zod still run before auth and correctly return 400 invalid_input, also pinned.) | If this 401→500 conversion broke a client that branches on the 401 status (e.g. silent token-refresh-and-retry), it would degrade UX. It is NOT a security hole: the auth gate still FIRES and blocks the request before any work; only the surfaced status code is wrong (over-reports as server error, never under-reports as success). Interview Prep is gated OFF on prod (`VITE_FEATURE_INTERVIEW_PREP` Coming Soon), so no live client hits this today. | minor → log | Pinned (characterization). Not escalated: no merit/billing/auth-bypass impact (auth still blocks; the AI-failure refund branch is unreachable without a live session, so AI_FORCE_FAILURE is inert here). A future `/gsd-debug` pass could add `if (err instanceof Response) return err;` to the catch to align it with interview-prep-evaluate; that is a behavior change, out of scope for the zero-functional-change v4.0 milestone. |
| SB-05-05 | `_shared/prompt-sanitizer.ts` (`INJECTION_PATTERNS` → `ignore_instructions`) | The `ignore_instructions` pattern `ignore\s+(all\s+)?(previous\|prior\|above\|earlier)\s+instructions?` tolerates an optional leading `all` but **NOT an interposed article `the`** before the position word. So `ignore the above instruction` is **NOT stripped** (it passes through verbatim), while the article-less `ignore above instruction` / `ignore all above instructions` **IS** stripped. The sibling `ignore_system_prompt` pattern explicitly allows `ignore\s+(the\s+)?system\s+prompt`, so the article-tolerance is inconsistent between the two ignore-family patterns. | Pinned both directions in `_shared/prompt-sanitizer.test.ts`: "corpus: strips 'ignore above instruction'…" asserts the article-less variant IS stripped (+warn); "characterization (SB-05-05): 'ignore the above instruction' (with article 'the') is NOT stripped at baseline" asserts the with-`the` variant passes through unchanged (no strip, no warn) — CURRENT behavior at `v4.0-baseline` (source byte-identical). | If a real injection attempt that used the `ignore the <position> instruction(s)` phrasing slipped past the deterministic strip into the LLM. In practice this is a **recall gap on one low-frequency phrasing**, not a control bypass: the central `sanitizeMessages` seam still fires, the higher-confidence article-less and `ignore the system prompt` phrasings are still caught, and the off-gate promptfoo real-AI suite (05-06) is the defense-in-depth layer for novel phrasings. It would only be a true bug if attackers reliably evaded via this exact article form AND the model complied. | minor → log | Pinned (characterization). Not escalated: this is an **under-stripping recall gap on one phrasing**, not over-stripping (the zero-functional-change-sensitive direction this layer primarily guards) and not a merit/billing/auth boundary. Adding `(the\s+)?` to `ignore_instructions` (to match the `ignore_system_prompt` sibling) is a sanitizer **behavior change** — out of scope for the zero-functional-change v4.0 milestone; a future `/gsd-debug`/security pass owns it. |

---

## Reconciliation context (Plan 05-01)

All 5 drifted-RED files reconciled in Plan 05-01 were **RECONCILED, none retired**.
The drift in every case was a **test/source mismatch**, not a product behavior change
— each underlying `index.ts` / `_shared/*.ts` is byte-identical vs `v4.0-baseline`:

- **`grade-linkedin` / `recruiting-lens` / `analyze-career` `phase22-contract.test.ts`** —
  asserted an INLINE `rpc('record_ai_usage'` call + `p_action_type: '<action>'` object
  key in the handler. That call form was **0 at both `v4.0-baseline` AND HEAD** (never
  on the offline gate for exactly this reason). The handlers record usage via the shared
  `recordUsageWithAnalysis(userId, '<action>', <credits>, recordId)` helper in
  `_shared/usage-checker.ts`, which OWNS the `rpc('record_ai_usage', …)` write.
  Reconciled to assert the current helper-call form. **No usage-accounting loss** —
  `record_ai_usage` and the merit gateway are present and unchanged.
- **`grade-linkedin/entitlement.test.ts`** — a Wave-0 RED scaffold (authored for this
  exact phase) that expected the paid branch to call the atomic
  `checkAndRecordUsage(userId, 'linkedin_grading')`. The shipped LIG-11 design SPLIT that
  into a check-only gate `checkEntitlement(userId, 'linkedin_grading')` (returns
  `createUsageLimitResponse` on 429) plus a post-success `recordUsageWithAnalysis(...)`
  record. Exact `checkAndRecordUsage(userId, 'linkedin_grading')` string = 0 at both
  baseline and HEAD. Reconciled to the current split gate+record.
- **`_shared/merit-gateway.spend-ordering.test.ts`** — a pure **test-mechanism** drift:
  the original injected its fake client by reassigning the EXPORTED `getServiceClient`
  binding, which the current Deno runtime rejects (`Cannot assign to read only property
  'getServiceClient'` — ESM export bindings are immutable). Reconciled to the
  project-canonical seam (`merit-gateway.test.ts`): patch the live singleton's mutable
  `.rpc` METHOD. The SC-7 spend-ordering CONTRACT (subscription-first drain, shared
  `deduction_id`, insufficient → 402 with 0 ledger rows) is unchanged.

No escalation was raised in Plan 05-01: the `git diff v4.0-baseline` evidence (T-05-02
control verification) showed the merit/usage surface is intact — every drift was a
stale assertion or an immutable-binding mechanism issue, never an accounting regression.

## Plan 05-03 (live-AI handler coverage) — no new rows, no escalation

Plan 05-03 added Pattern-A source-read coverage for `recruiting-lens`,
`analyze-skills-gap`, `compare-jobs`, and `chat-agent`, each asserting its ACTUAL
(non-uniform) merit/rate-limit state. Three states that *look* irregular were
characterized in-test and reviewed; none crossed the D-08 escalation bar (all are
documented, bounded design — not latent bugs — and all four `index.ts` are
byte-identical vs `v4.0-baseline`, so there is no regression to escalate):

- **`chat-agent` has NO merit gateway (rate-limit only).** Asserted via
  `source.includes('withMerits') === false` (+ no `MERIT_SYSTEM_ENABLED` /
  `MeritRefundable` / `checkAndRecordUsage`). The only spend control is the per-tier
  `checkRateLimit` (5/15/30/hr). This is intentional — chat-agent is a short
  (`maxTokens: 300`) advisory chat, not a billed analysis feature, and it does not
  touch the merit ledger. Not on the business-critical escalate list (no billing
  surface). Logged here as the characterized contract; a future monetization decision
  (if chat ever becomes credit-metered) is a product change, not a bug fix.
- **`analyze-skills-gap` and `compare-jobs` still carry the legacy
  `if (MERIT_SYSTEM_ENABLED && userContext)` gate** plus a legacy non-merit path that
  calls `checkAndRecordUsage('skills_gap_analysis' | 'job_comparison')`. Same class as
  the recruiting-lens/career legacy branches already pinned in 05-01/05-02 — the
  flag-gated dual path is the shipped MIG-05 design (legacy path byte-identical until
  the flag flips), not a defect. Characterized, not escalated.
- **`compare-jobs` reads `rawBody.userId`** — but ONLY as the input to the legacy
  usage-counter (`checkAndRecordUsage(userId, …)`), never as the authentication
  identity (auth is `requireAuth(type:'user')` → `userContext.userId`, which is what
  the rate limiter and `withMerits` owner use). The test scopes its negative
  assertion to "userId is not the auth source" (asserts `checkRateLimit(userContext.userId`
  and `userId: userContext.userId`, plus `!body.userId`) rather than a blanket
  `!rawBody.userId` that would be a false RED. No auth-bypass.
