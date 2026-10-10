---
phase: 5
slug: deep-test-coverage-expansion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-18
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Phase shape:** test-WRITING phase under a strict zero-functional-change constraint. The validation
> signal for nearly every task is "the new/harvested test runs green on the grown `verify:baseline` gate"
> — characterizing CURRENT behavior, never changing it. Derived from `05-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (edge functions) + vitest (frontend) + Playwright (E2E) — composed by `verify:baseline` |
| **Config file** | `supabase/functions/deno.json` (`test:ci` offline allowlist — single source of truth, D-03a); vitest config; `playwright.config.ts` |
| **Quick run command** | `npm run test:edge` (offline deno allowlist; `DENO_TEST_SUPABASE_REMOTE=0`) |
| **Full suite command** | `npm run verify:baseline` (vitest + offline-deno + Playwright) |
| **Estimated runtime** | quick (`test:edge`) ~tens of seconds; full `verify:baseline` ~minutes (Playwright dominates) |

> **Off-gate, NOT part of `verify:baseline`:** `npm run test:adversarial` (promptfoo, real Anthropic, costed) —
> scheduled/label only (D-04/D-07). It is a separate signal, never folded into the gate.

---

## Sampling Rate

- **After every task commit:** Run `npm run test:edge` (or the specific new `deno test path/to/file.test.ts` for fast local feedback)
- **After every plan wave:** Run `npm run verify:baseline`
- **Before `/gsd:verify-work`:** Full `verify:baseline` must be green AND every new offline test must appear in the `deno.json` `test:ci` allowlist (D-03a — a test not on the allowlist is a silent no-op)
- **Max feedback latency:** quick edge run < ~60s; full gate before wave close

---

## Per-Task Verification Map

> Populated from PLAN.md tasks during planning. Each test-writing task's automated command is the
> `deno test`/`vitest`/`verify:baseline` invocation that runs the file it adds; each test file MUST also be
> appended to `deno.json` `test:ci` in the same task (D-03a) or it never runs on the gate.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | TEST-03 | — | asserts current handler/util behavior (characterization) | unit/integration (deno) | `npm run test:edge` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements — the `AI_TEST_MODE` + `fixtureKey` / `AI_FORCE_FAILURE` seam in `_shared/anthropic.ts`, the `deno.json` `test:ci` allowlist, vitest, and Playwright are all already in place (Phase 1).
- No framework install needed. The only "scaffold" work is per-feature promptfoo `fixtures/injection/` configs (D-04), which are created within their owning tasks, not as global Wave 0 infra.

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deploy-gate ABORT on red suite | TEST-08 / D-06 | `scripts/deploy.ps1` (the shim target of `deploy-staging.ps1`/`deploy-production.ps1`) runs the gate as a precondition on the operator's Windows PowerShell host, before `supabase link` — not exercised by CI | Temporarily redden one test, run `scripts/deploy.ps1 -Env staging`, confirm non-zero exit BEFORE `supabase link` (no deploy); restore test, confirm green proceeds |
| GitHub branch-protection required-status-check | TEST-08 / D-06 | Operator GitHub repo setting; not assertable from the codebase | Follow the (re)documented enablement steps in `TESTING-STRATEGY.md`; confirm the `verify:baseline` check is required on PRs to `main`/`staging` |
| promptfoo real-AI injection suites PASS | SC#3 / TEST-07 | Calls real Anthropic (costed), OFF the per-PR gate — scheduled/label trigger only | Run `npm run test:adversarial` (and per-feature configs) on schedule/label; confirm all fixtures pass the system-prompt-leak / tier-escalation / valid-JSON-no-fail-open assertions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Every new offline deno test is registered in `deno.json` `test:ci` (D-03a)
- [ ] `verify:baseline` green throughout (zero-functional-change invariant holds)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
