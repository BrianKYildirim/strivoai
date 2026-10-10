---
phase: 3
slug: cross-device-reliability-and-compatibility
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-27
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `03-RESEARCH.md` § Validation Architecture (28 observable truths, environment-capability
> map, 9-item scheduled operator production pass, 6 validation checkpoints).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.9 (frontend unit) · Deno test (edge) · Playwright 1.61 (browser E2E) |
| **Config file** | `vitest.config.ts` · `supabase/functions/deno.json` · `playwright.config.ts` |
| **Quick run command** | `npm run test` (vitest) |
| **Full suite command** | `npm run verify:baseline` (lint → type-check → vitest → offline-deno → remote-deno → Playwright → build) |
| **Estimated runtime** | ~6.5–7.5 min today; **hard budget ≤ +3 min** for the `@xdev` matrix (Open Question 6) |

**Phase-specific additions:**
- New Playwright projects: `firefox`, `webkit`, emulated `iPhone 14` (WebKit), emulated `Pixel 7`
  (Chromium) — joining the existing `setup` + `chromium`.
- Per-project `grep` filtering so only `@xdev`-tagged specs run on the 4 added projects (D-02).
- Any new Deno test file **must** be added to `supabase/functions/deno.json` `test:ci` — that list is
  an explicit file list, not a directory walk. **An unlisted test runs in no lane at all.**

---

## Sampling Rate

- **After every task commit:** `npm run test` (vitest, fastest signal)
- **After every plan wave:** `npm run verify:baseline`
- **Before `/gsd:verify-work`:** full suite green, including the `@xdev` matrix
- **Max feedback latency:** ~90 s for the vitest lane; ~10 min for the full gate

---

## Per-Task Verification Map

*Populated by the planner. Every task must map to an automated command, or declare a Wave 0
dependency, or appear in Manual-Only Verifications below with a reason.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *pending* | — | — | — | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Playwright projects for `firefox`, `webkit`, `iPhone 14`, `Pixel 7` registered in
      `playwright.config.ts`, sharing the existing `auth.setup.ts` storageState.
- [ ] `@xdev` tag convention defined and documented in `TESTING-STRATEGY.md`.
- [ ] Matrix wall-clock measured and recorded against the ≤ +3 min budget.
- [ ] Any new Deno test registered in `supabase/functions/deno.json` `test:ci`.
- [ ] Any new edge function registered in **all three** of `supabase/config.toml`,
      `scripts/deploy.ps1` `$Functions`, and `supabase/functions/deno.json`
      (the `validate-document` precedent from Phase 01.1).

---

## Manual-Only Verifications

Derived from D-04 / D-05 and RESEARCH § Validation Architecture. These cannot run on the operator's
Mac and are owned by XTEST-04.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Safari (macOS) capability gate + auth persistence | XDEV-01, XDEV-04 | WebKit-the-engine is not Safari-the-browser; ITP and private-mode storage behavior differ | Operator pass on macOS Safari, incl. a Private Window session |
| Real iPhone Safari viewport, safe-area, tap targets, focus-zoom | XDEV-05 | Emulation reproduces viewport but not the real iOS WebKit process model or dynamic toolbar | Operator pass on a physical iPhone |
| Real Android Chrome | XDEV-05, XDEV-09 | Emulated Pixel does not reproduce real device memory/CPU limits | Operator pass on a physical Android device |
| Real production AI output paths | D-24 | Preview runs `AI_TEST_MODE` fixtures and never calls Anthropic | Scheduled operator production pass (9 items, see RESEARCH § Validation Architecture) |
| Merit-ledger behavior end-to-end | XRUN-01, XRUN-02 | `MERIT_SYSTEM_ENABLED=false` on Preview — merit charge/refund/idempotency is never exercised pre-prod | Operator production pass with a real Free and a real Elite account |

**Note (may reduce this table):** RESEARCH found Playwright 1.61 registers real `msedge` / `chrome`
channels, so **genuine Edge on the operator's Windows host is automatable**. If adopted, Edge moves out
of manual-only. This was not assumed by D-04/D-05 and is an improvement on the plan of record.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Matrix wall-clock delta measured and ≤ +3 min
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
