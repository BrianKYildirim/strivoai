---
phase: 04-dead-code-refactor-cleanup
plan: 04
subsystem: infra
tags: [deno, edge-functions, dead-code, tier-resolver, stripe, ollama, document-extraction, cleanup]

# Dependency graph
requires:
  - phase: 04-01
    provides: "RESIDUAL-REGISTER.md scaffold (R-01) + the audit:deadcode Deno reachability baseline this plan recomputes against"
  - phase: 03-cross-domain-inventory-audit
    provides: "DEAD-CODE.md (resolve-tier name-collision + Ollama needs-investigation rows), KEEP-LIST.md (Keep-Class 1/3/4 gate), DATABASE.md Source C (41-fn live deploy list confirming interview-prep-coach already retired)"
provides:
  - "Dead DB-based _shared/resolve-tier.ts + its test removed (zero production importers); name-collision with the LIVE price-resolver.resolveTier() eliminated"
  - "interview-prep-coach CLEAN-03 recorded CLOSED as a no-op (absent from repo, config.toml, and the 41-fn live deploy list)"
  - "Obsolete Phase-50 Ollama extraction leg REMOVED (operator-confirmed dead in prod): ollama-client.ts + test deleted; document-extraction.ts ollama import/param/chain-entry removed; mistral->textract->claude_ocr chain intact"
  - "RESIDUAL-REGISTER.md extended with the two CLEAN-03 closes + the operator-gate verbatim evidence + an AuthCallback forward cross-reference for Plan 04-05"
affects: [04-05, 04-06, CLEAN-05, phase-08-database]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator-gated removal (D-07): an autonomous:false plan gates a live-prod-fact decision (OLLAMA_BASE_URL liveness) to the operator; the gate outcome + evidence is recorded verbatim in the residual register before the remove path executes"
    - "Pair-removal of a dead module + its test in one atomic commit, with the deno test:ci allowlist (deno.json) consulted first to predict the exact gate-count delta (here: 0, since neither dead test was in the allowlist)"

key-files:
  created: []
  modified:
    - ".planning/audit/RESIDUAL-REGISTER.md - added CLEAN-03 closes (interview-prep-coach no-op + Ollama operator-confirmed remove) + AuthCallback forward cross-ref"
    - "supabase/functions/_shared/document-extraction.ts - removed ollama imports, ollamaVision? param, and cheapProviders[0] ollama entry"
  deleted:
    - "supabase/functions/_shared/resolve-tier.ts + resolve-tier.test.ts (dead DB tier-resolver pair)"
    - "supabase/functions/_shared/ollama-client.ts + ollama-client.test.ts (obsolete Ollama vision leg)"

key-decisions:
  - "resolve-tier.ts removed as a dead pair; the LIVE tier resolver is the SEPARATE price-resolver.ts (resolveTier() consumed by stripe-webhook-handler + create-checkout-session) — left byte-identical. shop-pack-resolver.ts (sibling) untouched."
  - "Ollama operator gate (D-07) resolved = REMOVE. Operator confirmed against PROD ref zjpjapgraoxdukdvpjes: OLLAMA_BASE_URL UNSET (no OLLAMA_* secret present via supabase secrets list) -> the leg is inert/dead in prod -> removal authorized."
  - "interview-prep-coach CLEAN-03 = no-op close (nothing deployed, no repo source). The gated-but-live interview-prep-analyze/-evaluate pair was NOT touched."
  - "ExtractionProvider type union still lists 'ollama' and document-quality.test.ts still exercises the 'ollama' quality-label generically — both intentionally LEFT (not ollama-client consumers; removing them would exceed the plan's 'no other behavioral change' boundary)."

patterns-established:
  - "Pattern: predict the deno gate-count delta from deno.json test:ci allowlist BEFORE deleting a *.test.ts so a 'count unchanged' result is provably correct, not a missed regression"
  - "Pattern: record an operator-gate's verbatim evidence (prod ref + secret-presence finding + authorization) in the durable residual register, not only the SUMMARY"

requirements-completed: [CLEAN-03, CLEAN-04]

# Metrics
duration: 7min
completed: 2026-06-14
---

# Phase 4 Plan 04: Deno `_shared` Dead-Resolver + Ollama-Leg Cleanup Summary

**Removed the dead DB-based `_shared/resolve-tier.ts` pair (LIVE `price-resolver.ts` provably intact) and the operator-confirmed-dead Phase-50 Ollama extraction leg (mistral->textract->claude_ocr chain intact), and recorded `interview-prep-coach` as a CLEAN-03 no-op close — zero functional change, baseline green.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-14T10:06:19Z
- **Completed:** 2026-06-14T10:13:xxZ
- **Tasks:** 3 (Task 2 was an operator gate, pre-resolved = remove)
- **Files removed:** 4 source files; **modified:** 2 (document-extraction.ts + RESIDUAL-REGISTER.md)

## Accomplishments

- **Task 1 — dead DB tier-resolver removed:** Deleted `_shared/resolve-tier.ts` + `_shared/resolve-tier.test.ts` as a pair. Confirmed BEFORE delete that `rg "_shared/resolve-tier"` returned only the test file (zero production importers), and that the LIVE `price-resolver.ts` `resolveTier()` is wired into `stripe-webhook-handler/index.ts:38` and `resolvePriceId()` into `create-checkout-session/index.ts:52`. `price-resolver.ts` and `shop-pack-resolver.ts` left byte-identical (empty git status).
- **Task 2 — operator gate (D-07) resolved = REMOVE:** see "Ollama Operator-Gate Outcome" below.
- **Task 3 — Ollama leg removed + verified:** Deleted `_shared/ollama-client.ts` + `_shared/ollama-client.test.ts`; removed the ollama imports, the `ollamaVision?` param, and the `cheapProviders[0]` ollama entry from `_shared/document-extraction.ts`. The `mistral -> textract -> claude_ocr` fallback chain (which feeds Resume Analysis / Career Compass extraction) is intact and verified.
- **interview-prep-coach** recorded CLEAN-03 CLOSED as a no-op (re-confirmed `rg "interview-prep-coach" supabase/` -> zero; absent from the 41-fn live deploy list per 03-05 Source C). The gated-but-live `interview-prep-analyze`/`-evaluate` pair was NOT touched.
- **RESIDUAL-REGISTER.md** extended with both CLEAN-03 closes, the verbatim operator-gate evidence, and an AuthCallback forward cross-reference (owned by Plan 04-05).

## Task Commits

Each task was committed atomically with explicit file paths (never `-A`/`.`/`-f`):

1. **Task 1: Remove dead DB tier-resolver + test; close interview-prep-coach** - `f2338ca` (chore) — 2 files deleted, 114 deletions
2. **Task 2: OPERATOR GATE (Ollama liveness, D-07)** - no commit (decision-only; pre-resolved = remove)
3. **Task 3 (remove path): retire confirmed-dead Ollama extraction leg** - `48e583f` (chore) — 3 files (document-extraction.ts edited + 2 ollama deletes), 364 deletions
4. **Task 3 doc half: record CLEAN-03 closes in the residual register** - `d4b4e07` (docs) — RESIDUAL-REGISTER.md, 31 insertions

**Plan metadata:** _(this SUMMARY + STATE.md, committed after self-check)_

## Files Created/Modified

- `supabase/functions/_shared/resolve-tier.ts` - **DELETED** (dead DB-based resolveTier; zero production importers)
- `supabase/functions/_shared/resolve-tier.test.ts` - **DELETED** (its pair; not in deno test:ci allowlist)
- `supabase/functions/_shared/ollama-client.ts` - **DELETED** (obsolete Phase-50 Ollama vision leg; operator-confirmed dead in prod)
- `supabase/functions/_shared/ollama-client.test.ts` - **DELETED** (its pair; not in deno test:ci allowlist)
- `supabase/functions/_shared/document-extraction.ts` - **MODIFIED** (removed ollama imports + `ollamaVision?` param + `cheapProviders[0]` ollama entry; mistral->textract->claude_ocr chain intact)
- `.planning/audit/RESIDUAL-REGISTER.md` - **MODIFIED** (two CLEAN-03 closes + operator-gate verbatim evidence + AuthCallback forward cross-ref)

## Tier-Gating Integrity (load-bearing invariant — PRESERVED)

The removed `_shared/resolve-tier.ts` had **ZERO production importers** (only its own test referenced it). The LIVE tier-resolution path — `price-resolver.ts` `resolveTier()` consumed by `stripe-webhook-handler` (governs Stripe-driven paywall/credit/subscription tier assignment) and `resolvePriceId()` by `create-checkout-session` — is a **SEPARATE FILE** and was left **byte-identical** (`git status` empty for both `price-resolver.ts` and `shop-pack-resolver.ts`). Removing the dead resolver cannot affect paywall enforcement. `pricing-config.ts` (frontend, cross-layer, documented in 04-05) was not in scope and is untouched.

## Ollama Operator-Gate Outcome (D-07, recorded verbatim)

This plan was `autonomous: false` because the Ollama-leg liveness is a live-prod fact unknowable from the repo. The Task 2 gate was presented to the operator and **resolved = REMOVE**. The operator confirmed, against the real production project, that:

- The **canonical production Supabase project is `zjpjapgraoxdukdvpjes`**.
- **`OLLAMA_BASE_URL` is UNSET** in that project's edge-function secrets (verified via `supabase secrets list` — **no `OLLAMA_*` secret present at all**), so the Ollama leg (`cheapProviders[0]`, which `readOllamaConfig()` returns `null` for whenever `OLLAMA_BASE_URL` is absent) is **inert and dead in prod**.
- The operator **authorized removal** of the Ollama extraction leg.

Therefore Task 3 executed on the **`remove`** branch (not the defer branch). This evidence is also recorded in `RESIDUAL-REGISTER.md` under "CLEAN-03-Ollama".

## Verification (zero-functional-change spine gate)

| Gate | BEFORE | AFTER | Result |
| ---- | ------ | ----- | ------ |
| `npm run test:edge` (deno) | 284 passed / 0 failed | 284 passed / 0 failed | exit 0 |
| `npm run verify:baseline` | green (post-04-03) | vitest 79 files / 457 passed; deno 284/0; Playwright 5 passed + 1 skipped | exit 0 |

The deno count is **unchanged at 284** and this is **provably correct**: `supabase/functions/deno.json` `test:ci` allowlist does NOT include `resolve-tier.test.ts` or `ollama-client.test.ts` (those would only run via a broader `_shared/` glob), so deleting them has zero effect on the gate count. No deno delta was owed.

### `audit:deadcode` Deno reachability delta

| Stage | Reachable `_shared` modules | Total `_shared` *.ts (excl. tests) | Dead candidates |
| ----- | --- | --- | --- |
| Before plan | 36 | 39 | 3 (`resolve-tier.ts`, `test-helpers/stripe-fixtures.ts`, `test-helpers/stripe-signature.ts`) |
| After Task 1 | 36 | 38 | 2 (the 2 stripe test-helpers) |
| After Task 3 | **35** | **37** | **2 (the 2 stripe test-helpers — KEEP)** |

The Deno reachable-set dropped by **exactly one** module (`ollama-client.ts`, 36->35); `resolve-tier.ts` was already unreachable so its removal did not change the reachable count, only the file total (39->38). The two `test-helpers/stripe-*` KEEP candidates and `price-resolver.ts` (reachable/live, never a candidate) were untouched. **No new dead candidate appeared.** `rg "provider: 'mistral'|provider: 'textract'" document-extraction.ts` returns both after the edit.

## Decisions Made

- **resolve-tier.ts vs price-resolver.ts:** separate files, separate symbols — no rename needed; deleting the dead one cannot clash with the live one. (D-08.1)
- **Ollama:** removed on the operator's POSITIVE prod confirmation only (D-07). On unproven-dead evidence this would have been a zero-functional-change violation and would instead have been document-and-deferred.
- **Type union `'ollama'` and `document-quality.test.ts` 'ollama' label LEFT in place:** they are generic provider-label references, not `ollama-client.ts` consumers; removing them would exceed the plan's "no other behavioral change" boundary. (No deviation — deliberate scope discipline.)

## Deviations from Plan

None - plan executed exactly as written. Task 2's operator gate was pre-resolved (= remove) in the execution context, so Task 3 ran the documented `remove` branch with no checkpoint pause.

## Issues Encountered

None. The "deno count unchanged at 284" result was anticipated by reading `deno.json` `test:ci` first (neither deleted test was in the allowlist) — verified, not a missed regression.

## User Setup Required

None - no external service configuration required. (The operator's prod-secret check for the Ollama gate was a read-only verification, already completed.)

## Next Phase Readiness

- **04-05 (CLEAN-02 React half)** is unblocked and owns the `AuthCallback.tsx` knip dead-file candidate (forward cross-reference recorded in the residual register). 04-04 made no React-tree change.
- **Phase 8 (Database)** carries the canonical-prod-ref note forward, now reinforced: this plan independently used `zjpjapgraoxdukdvpjes` as the prod ref for the Ollama secret check.
- CLEAN-03 + CLEAN-04 (Deno half) satisfied; baseline green; residual register current.

## Self-Check: PASSED

- Deleted (absent on disk): `resolve-tier.ts`, `resolve-tier.test.ts`, `ollama-client.ts`, `ollama-client.test.ts`.
- Present/intact: `price-resolver.ts`, `shop-pack-resolver.ts` (both byte-identical/unmodified), `document-extraction.ts` (edited), `RESIDUAL-REGISTER.md`, this SUMMARY.
- Commits exist: `f2338ca` (Task 1), `48e583f` (Task 3 source), `d4b4e07` (Task 3 doc).

---
*Phase: 04-dead-code-refactor-cleanup*
*Completed: 2026-06-14*
