---
phase: 31
slug: optimistic-ui-refund-verification
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-19
updated: 2026-05-31
---

# Phase 31 - Validation Strategy

Retroactive Nyquist audit for Phase 31. The previous validation artifact was still in draft/pending state even though execution and staging verification were complete. This audit reconciles the plan tasks, summaries, verification report, test files, and current focused command results.

## Test Infrastructure

| Property | Value |
| --- | --- |
| Framework | Vitest 4.x for frontend/unit coverage; Deno test for Supabase Edge Function coverage |
| Config files | `vitest.config.ts`; `supabase/functions/deno.json`; `scripts/run-edge-tests.ps1` |
| Quick run command | `npm.cmd run test -- src/hooks/useMerits.test.ts src/lib/merit-error-messages.test.ts` |
| Edge quick command | `deno.cmd test --allow-all supabase/functions/_shared/merit-gateway.refund.test.ts supabase/functions/_shared/merit-refund-idempotency.test.ts --no-check` |
| Staging proof command | `.\scripts\run-edge-tests.ps1` with `DENO_TEST_SUPABASE_REMOTE=1`, staging creds, and staging function env `MERIT_TEST_FORCE_REFUNDABLE_ERROR` set |
| Estimated runtime | 5 seconds local focused checks; staging suite recorded separately |

## Audit Summary

| Metric | Count |
| --- | ---: |
| Requirements audited | 5 |
| Task rows audited | 11 |
| Gaps found | 1 |
| Gaps resolved | 1 |
| Escalated/manual-only blockers | 0 |

Resolved gap:

| Gap | Requirement | Resolution |
| --- | --- | --- |
| `useMerits.optimisticDeduct` had static implementation evidence but no hook test proving nested cache shape, rollback restore, or commit invalidation. | MER-03, NFR-03 | Added focused Vitest coverage in `src/hooks/useMerits.test.ts`. |

## Requirement Coverage

| Requirement | Coverage Status | Automated Evidence |
| --- | --- | --- |
| MER-03 | COVERED | `src/hooks/useMerits.test.ts` proves optimistic nested cache decrement, rollback restore, and commit refetch; static wiring check confirms all submit paths call `optimisticDeduct`. |
| MER-05 | COVERED | `supabase/functions/_shared/merit-gateway.refund.test.ts` covers refundable classes and 7 per-path smoke tests; `31-STAGING-VERIFICATION.md` records staging run `244 passed / 0 failed`. |
| MER-06 | COVERED | `supabase/functions/_shared/merit-refund-idempotency.test.ts` proves replay returns `already_refunded` with no balance mutation; staging evidence recorded in `31-STAGING-VERIFICATION.md`. |
| NFR-03 | COVERED | `src/hooks/useMerits.test.ts` proves synchronous snapshot rollback; source wiring check confirms rollback on terminal failure branches. |
| NFR-04 | COVERED | `src/lib/merit-error-messages.test.ts` covers all error classes, refund/no-charge wording, 4xx no-merit wording, and no generic "Something went wrong" return. |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Automated Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 31-01-T1 | 31-01 | 1 | MER-03/NFR-03 | T-31-01 | `optimisticDeduct` writes nested cache shape; rollback restores captured snapshot; commit invalidates | `npm.cmd run test -- src/hooks/useMerits.test.ts` | COVERED |
| 31-01-T2 | 31-01 | 1 | NFR-04 | T-31-02 | Shared error taxonomy returns specific copy and no generic fallback | `npm.cmd run test -- src/lib/merit-error-messages.test.ts` | COVERED |
| 31-02-T1 | 31-02 | 1 | MER-05 | T-31-04 | A4 chokepoint confirmed across 4 non-resume sync functions | Node static chokepoint check: all 4 `CHOKEPOINT-OK WITH-MERITS-OK` | COVERED |
| 31-02-T2 | 31-02 | 1 | MER-05 | T-31-03 | Staging-gated fault injection exists at sync and stream chokepoints; production inert | Node static check: `callsites 3 stagingGate true aiForceFailureIntact true`; `deno.cmd check supabase/functions/_shared/anthropic.ts` | COVERED |
| 31-03-T1 | 31-03 | 2 | MER-03/NFR-03/NFR-04 | T-31-07 | Resume stream fires one optimistic deduct and settles on stream terminal state | Node static wiring check: `useResumeStream wired true` | COVERED |
| 31-03-T2 | 31-03 | 2 | MER-03/NFR-03/NFR-04 | T-31-06 | Career Compass holds one settle closure across the poll loop and settles terminal branches | Node static wiring check: `CareerCompass wired true` | COVERED |
| 31-03-T3 | 31-03 | 2 | MER-03/NFR-03/NFR-04 | T-31-06 | LinkedIn, Recruiting Lens, and Interview Prep settle success/failure and use shared toast taxonomy | Node static wiring check: all 3 `wired true noGeneric true` | COVERED |
| 31-04-T1 | 31-04 | 2 | MER-05 | T-31-08 | Gateway refund tests cover every refundable class and 7 endpoint paths with vacuous-pass guards | `deno.cmd test --allow-all supabase/functions/_shared/merit-gateway.refund.test.ts --no-check`; staging `244/0` proof | COVERED |
| 31-04-T2 | 31-04 | 2 | MER-06 | T-31-08 | `refund_merits` replay returns `already_refunded` with no second mutation | `deno.cmd test --allow-all supabase/functions/_shared/merit-refund-idempotency.test.ts --no-check`; staging `244/0` proof | COVERED |
| 31-04-T3 | 31-04 | 2 | MER-05/MER-06 | - | Both refund test files registered in runner | Node runner-registration check: `refundTest true idempotencyTest true` | COVERED |
| 31-04-T4 | 31-04 | 2 | MER-05/MER-06 | T-31-09/T-31-10/T-31-11 | Operator ran gated staging suite and removed force-fail flag afterward | `31-STAGING-VERIFICATION.md` records `244 passed / 0 failed` and T-31-11 closeout | COVERED |

## Commands Run During This Audit

| Command | Result |
| --- | --- |
| `npm.cmd run test -- src/lib/merit-error-messages.test.ts` | PASS - 1 file, 11 tests |
| `npm.cmd run test -- src/hooks/useMerits.test.ts src/lib/merit-error-messages.test.ts` | PASS - 2 files, 27 tests |
| `npx.cmd eslint src/hooks/useMerits.test.ts src/hooks/useMerits.ts src/lib/merit-error-messages.ts src/lib/merit-error-messages.test.ts` | PASS |
| `deno.cmd test --allow-all supabase/functions/_shared/merit-gateway.refund.test.ts supabase/functions/_shared/merit-refund-idempotency.test.ts --no-check` | PASS - 15 tests, non-gated SKIP path |
| A4 static chokepoint Node check | PASS - all 4 functions `CHOKEPOINT-OK WITH-MERITS-OK` |
| Fault-injection static Node check | PASS - `callsites 3 stagingGate true aiForceFailureIntact true` |
| Runner-registration static Node check | PASS - `refundTest true idempotencyTest true` |
| `deno.cmd check supabase/functions/_shared/anthropic.ts` | PASS |

## Verification Limits

| Limit | Status |
| --- | --- |
| Full repo `npm run lint` | Not used as a Phase 31 gate in this audit. A broader targeted lint over all Phase 31-touched pages still reports existing `no-explicit-any` errors in `useResumeStream.ts`/`Upload.tsx` and unused-disable warnings in feature pages. The new `useMerits` tests and primitive files lint clean. |
| Live staging refund execution | Not rerun during this audit because it requires staging secrets and operator env changes. Existing authoritative evidence is `31-STAGING-VERIFICATION.md`, dated 2026-05-20, with `244 passed / 0 failed` and flag removal confirmed. |
| Browser visual timing | Supplemental only. Automated rollback tests now prove synchronous restore mechanics; a browser click-through can still be used for UX polish, but no requirement remains manual-only for Nyquist compliance. |

## Manual-Only Verifications

None required for Nyquist compliance after this audit.

Supplemental UX smoke, if desired: click Analyze on each of the 5 feature pages with staging fault injection enabled, confirm the displayed Merit balance drops immediately, restores on forced failure, and the rendered toast copy matches `getMeritErrorMessage`.

## Validation Audit 2026-05-31

| Metric | Count |
| --- | ---: |
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

## Validation Sign-Off

- [x] Nyquist config checked and enabled.
- [x] Input state detected: State A, existing `31-VALIDATION.md`.
- [x] PLAN and SUMMARY files read.
- [x] Requirement-to-task map built and reconciled.
- [x] Test infrastructure detected.
- [x] Gap classified and resolved with automated test coverage.
- [x] `31-VALIDATION.md` updated.
- [x] All Phase 31 requirements have automated verification.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** audited pass
