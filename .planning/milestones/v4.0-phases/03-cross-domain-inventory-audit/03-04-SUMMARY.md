---
phase: 03-cross-domain-inventory-audit
plan: 04
subsystem: audit
tags: [env-inventory, vite-flags, edge-secrets, deno-env-get, template-literal-keys, stripe-price-ids, names-not-values, three-tier-classification, keep-list-gate, env-01]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    plan: 01
    provides: ".planning/audit scaffold (INDEX pre-listed ENV-INVENTORY.md row + KEEP-LIST gate)"
provides:
  - "ENV-INVENTORY.md (ENV-01): full env-var inventory — 9 frontend import.meta.env names (6 VITE_* + 3 Vite built-ins) + 57 distinct edge Deno.env.get names, each with consumer file(s), environment bucket (prod / OCR-optional / test-CI), and required/optional status, three-tier classified, NO values"
  - "Defused the T-3-08 template-literal landmine: STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL} (price-resolver.ts) + STRIPE_PRICE_MERIT_{3,10,25,50} (shop-pack-resolver.ts) expanded as LIVE consumers (KEEP-LIST Class 4), never falsely flagged unused"
  - "Resolved RESEARCH Open Question 1: VITE_DEBUG_PERF IS live (perf.ts:18 cast access (import.meta as any).env?.VITE_DEBUG_PERF) -> safe, not needs-investigation"
  - "Both-direction .env.example gaps flagged: ~46 code names absent from .env.example (headline VITE_STRIPE_PUBLISHABLE_KEY + Stripe/OCR/Ollama/admin families) + 2 documented-but-no-consumer (SUPABASE_TEST_ANON_KEY, STRIPE_TEST_PUBLISHABLE_KEY)"
  - "Phase-7 actionable handoff: ENV-02 (reconcile gaps), ENV-03 (canonical .env.example), ENV-04 (split 27 test/CI names from prod bucket), ENV-05 (fail-closed validation + OCR needs-investigation resolution)"
affects: [phase-7-environment-variable-audit-ENV-02, phase-7-environment-variable-audit-ENV-03, phase-7-environment-variable-audit-ENV-04, phase-7-environment-variable-audit-ENV-05]

# Tech tracking
tech-stack:
  added: []  # zero new deps — rg built-in (D-01); read-only enumeration
  patterns:
    - "Template-literal env-key defusal: every Deno.env.get(`…${…}…`) interpolation is expanded by hand to its concrete key set so a literal grep's 'consumers: tests only' never becomes a false 'unused' verdict (KEEP-LIST Class 4)"
    - "Two-form frontend env scan: the dotted import.meta.env.\\w+ pattern MUST be paired with a broad VITE_[A-Z_] scan because cast access ((import.meta as any).env?.X) bypasses the dotted pattern (perf.ts VITE_DEBUG_PERF would otherwise be a false needs-investigation)"
    - "Names-not-values evidence discipline (T-3-07): the catalog records var NAMES + consumer file(s) + bucket + required/optional ONLY; a post-write secret-pattern grep guard over the file confirms zero key/JWT/price-ID/PEM matches before commit"

key-files:
  created:
    - .planning/audit/ENV-INVENTORY.md
  modified: []  # read-only over src/ + supabase/functions/ + .env.example NAMES — zero source/env change

key-decisions:
  - "Corrected research's env bucketing: ADMIN_EMAIL/ADMIN_EMAILS are PRODUCTION (auth/notify/admin-metrics consumers), NOT test-only as research listed; STRIVO_ENV is a prod/staging runtime discriminator (anthropic.ts:546 === 'staging'), not test-only"
  - "VITE_DEBUG_PERF resolved to safe (live): perf.ts:18 reads it via a cast the dotted grep misses; Open Question 1 closed in favor of live, not needs-investigation"
  - "STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL} (6) classified unsafe/never-safe + LIVE (KEEP-LIST Class 4) — zero production LITERAL reference (only price-resolver.ts template + tests/DEPLOY_RUNBOOK.md), the exact false-unused trap this plan exists to neutralize"
  - "Found a SECOND template-literal source beyond research's single price-resolver lead: shop-pack-resolver.ts:64 STRIPE_PRICE_MERIT_${packSize} — the 4 merit keys are read via BOTH a literal map (buildShopPackMap) and the template (resolveShopPriceId), so they sit in the literal-57 set but the template form is recorded too"
  - "Test-seam-in-production-code nuance: AI_TEST_MODE/AI_FORCE_FAILURE/MERIT_TEST_FORCE_REFUNDABLE_ERROR (anthropic.ts) + IS_TEST (interview-prep-analyze) are READ by prod modules but gated inert unless set — bucketed test/CI by purpose, with the honest prod-module reader recorded"
  - "Two .env.example-documented names have NO code consumer (SUPABASE_TEST_ANON_KEY, STRIPE_TEST_PUBLISHABLE_KEY) -> Direction-B gaps for Phase 7 to reconcile (stale doc vs shell/CI-only), not removals"

patterns-established:
  - "Pattern: pair the dotted import.meta.env.\\w+ enumeration with a broad VITE_[A-Z_] scan to catch cast/bracket access forms (the perf.ts VITE_DEBUG_PERF blind spot)"
  - "Pattern: scan BOTH Deno.env.get(`…`) (template) AND Deno.env.get([a-z]) (computed-key var) — price-resolver.ts uses both forms; expand every interpolation to its concrete set"
  - "Pattern: post-write secret-pattern grep guard (sk_/pk_/whsec_/price_/eyJ-JWT/PEM) over the catalog file itself as the T-3-07 no-values gate before committing"

requirements-completed: [ENV-01]

# Metrics
duration: 9min
completed: 2026-06-14
---

# Phase 03 Plan 04: ENV-INVENTORY.md (ENV-01) Summary

**Full environment-variable inventory across the frontend (9 distinct `import.meta.env.*` names — 6 `VITE_*` + 3 Vite built-ins) and the Supabase edge surface (exactly 57 distinct literal `Deno.env.get` names — ~3× larger than `.env.example`'s 18), each catalogued with consumer file(s), environment bucket (production / OCR-optional / test-CI), and required/optional status, three-tier classified under the KEEP-LIST gate. The #1 false-positive landmine — the `STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}` subscription keys read ONLY via the `price-resolver.ts` template literal (every literal occurrence is in `.test.ts`/`DEPLOY_RUNBOOK.md`) — is defused: all 6 expanded as LIVE (Class 4). Open Question 1 resolved (VITE_DEBUG_PERF is live via a cast access form). Both-direction `.env.example` gaps flagged. Recorded NAMES ONLY — a post-write secret-pattern grep guard returned zero matches — with zero `src/`/`supabase/functions/`/`.env*` change.**

## Performance

- **Duration:** ~9 min
- **Tasks:** 2 (Task 1 read-only enumeration captured directly into the Task-2 catalog)
- **Files:** 1 created (`.planning/audit/ENV-INVENTORY.md`); zero `src/` / `supabase/functions/` / `.env*` change

## Accomplishments

- **Frontend enumeration (9 distinct names):** the 6 `VITE_*` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_ANALYZE_CAREER_FUNCTION`, `VITE_DEBUG_PERF`, `VITE_FEATURE_INTERVIEW_PREP`) + the 3 Vite built-ins (`PROD`/`MODE`/`DEV`), each with consumer file:line, environment, required/optional, and classification.
- **Open Question 1 RESOLVED:** `VITE_DEBUG_PERF` is **live** — consumed at `src/lib/perf.ts:18` via `(import.meta as any).env?.VITE_DEBUG_PERF === 'true'`, a cast access form the plain `import.meta.env.\w+` grep misses. Classified `safe`, not `needs-investigation`.
- **Edge enumeration (exactly 57 distinct literal `Deno.env.get` names)** — matching the research estimate to the name — bucketed prod (21) / OCR-optional (10) / test-CI (27, incl. the test-seam toggles read by prod modules but inert unless set), each with consuming function(s).
- **Template-literal landmine defused (T-3-08):** found **two** construction sources (research led with one): `price-resolver.ts:31-33,70` builds `STRIPE_PRICE_{PRO,PAID,ELITE}_{MONTHLY,ANNUAL}` and `shop-pack-resolver.ts:64` builds `STRIPE_PRICE_MERIT_${packSize}`. Verified the 6 subscription keys have **zero production literal reference** (only the template + `.test.ts`/`DEPLOY_RUNBOOK.md`) — expanded all 6 as LIVE / KEEP-LIST Class 4 / never-`safe`.
- **Both-direction `.env.example` gaps flagged:** Direction A (code-not-example, ~46 names) headlined by `VITE_STRIPE_PUBLISHABLE_KEY` plus `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, the 6+4 Stripe price IDs, the OCR/Ollama family, `MERIT_SYSTEM_ENABLED`, `ADMIN_EMAIL(S)`, `STRIVO_ENV`; Direction B (example-not-code) = `SUPABASE_TEST_ANON_KEY` + `STRIPE_TEST_PUBLISHABLE_KEY` (documented, no consumer found).
- **KEEP-LIST gate proven:** `VITE_FEATURE_INTERVIEW_PREP` (Class 1), `PADDLE_WEBHOOK_SECRET` (Class 2), and the 6 subscription price keys (Class 4) are all forced never-`safe`; the catalog carries a Cross-References block to KEEP-LIST + Phase 7.
- **T-3-07 (highest-severity) closed:** the file records NAMES + consumers + required/optional only; the post-write secret-pattern grep guard (`sk_`/`pk_`/`whsec_`/`price_`/`eyJ`-JWT/PEM) returned **zero** matches.

## Task Commits

1. **Task 1 (three-form env enumeration: frontend dotted+cast, edge literal-57, edge template-literal+computed-key; consumer mapping; bucketing; KEEP-LIST gate; both-direction .env.example diff) + Task 2 (write ENV-INVENTORY.md)** — `6c2dc6c` (docs). Per the plan, Task 1 is read-only evidence-gathering captured directly into the Task-2 catalog; committed as one specific-file commit.

**Plan metadata (this SUMMARY + STATE + ROADMAP):** committed separately as the plan-close `docs` commit.

## Files Created/Modified

- `.planning/audit/ENV-INVENTORY.md` — ENV-01 catalog: header (HEAD `f131e3f`, rg tooling, names-not-values notice) + verdict/summary (9 frontend / 57 edge / 4 template-call-sites / 6+4 expanded keys / gap counts) + commands-run (3 enumerations, read-only) + Frontend `VITE_*` table + Edge production table (21) + Template-literal subscription subsection (6 expanded LIVE) + OCR/Ollama table (10) + Test/CI table (27) + both-direction `.env.example` gaps subsection + Re-Assertion block (bash + PowerShell + the secret-pattern guard) + KEEP-LIST/INDEX/RESEARCH/02-SECRET-SCAN/Phase-7 cross-references.

## Decisions Made

- **Research bucketing corrected (ADMIN_EMAIL(S), STRIVO_ENV).** Research listed `ADMIN_EMAIL(S)` and (implicitly) `STRIVO_ENV` under test/CI-only. The consumer sweep proved otherwise: `ADMIN_EMAIL`/`ADMIN_EMAILS` are read by `_shared/auth.ts`, `notify-admin-activity`, `admin-merit-metrics`, `check-merit-alerts` (production admin authz), and `STRIVO_ENV` drives a `=== 'staging'` runtime branch in `_shared/anthropic.ts:546`. Both moved to the production bucket.
- **VITE_DEBUG_PERF is live (safe), closing Open Question 1.** The cast access form (`(import.meta as any).env?.VITE_DEBUG_PERF`) is invisible to the dotted grep but is a real runtime consumer; the broad `VITE_[A-Z_]` scan caught it.
- **A second template-literal source exists (shop-pack-resolver.ts).** Research's lead named only `price-resolver.ts`; the backtick scan surfaced `shop-pack-resolver.ts:64` as well. The merit keys are read via both a literal map and the template, so they sit in the literal-57 set; the template form is documented to keep the inventory honest.
- **Test-seam toggles bucketed by purpose, reader recorded honestly.** `AI_TEST_MODE`/`AI_FORCE_FAILURE`/`MERIT_TEST_FORCE_REFUNDABLE_ERROR`/`IS_TEST` are read by production modules but gated inert (two-key defense) — bucketed test/CI with the prod-module reader noted, so Phase 7 ENV-04 separation has the full picture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug avoided] Paired the dotted frontend grep with a broad VITE_ scan to catch the cast access form (the VITE_DEBUG_PERF blind spot)**
- **Found during:** Task 1 (frontend enumeration).
- **Issue:** The plan's primary command `rg -n "import\.meta\.env\.\w+" src -o` does NOT match `(import.meta as any).env?.VITE_DEBUG_PERF` in `perf.ts:18` (cast then optional-chain access). Relying on it alone would have falsely classed `VITE_DEBUG_PERF` `needs-investigation` (no consumer), the exact wrong answer to Open Question 1.
- **Fix:** Added a second read-only scan `rg -n "VITE_[A-Z_0-9]+" src -o` (the plan's Task-1 step 2 already mandates a targeted `DEBUG_PERF` rg; this generalizes it) which surfaces the cast consumer. `VITE_DEBUG_PERF` correctly classified `safe`. Method correction recorded in the Commands-run + Re-Assertion blocks. No code changed.
- **Files modified:** none (catalog records the corrected enumeration).
- **Committed in:** `6c2dc6c`.

**2. [Rule 2 - Missing critical coverage] Caught a second template-literal env source the plan/research did not name (shop-pack-resolver.ts)**
- **Found during:** Task 1 (template-literal scan, step 4).
- **Issue:** The plan/research focused the Pitfall-2 catch on `price-resolver.ts` alone. The backtick scan (`rg -n 'Deno\.env\.get\(`' supabase/functions`) also returned `shop-pack-resolver.ts:64` (`STRIPE_PRICE_MERIT_${packSize}`). Omitting it would have under-documented the template-literal surface (and left the merit keys' dynamic-read path unrecorded).
- **Fix:** Recorded both sources; expanded `STRIPE_PRICE_MERIT_${packSize}` to `{3,10,25,50}` (also read literally in `buildShopPackMap`, so already in the 57 set) and noted the dual literal+template read in the production table.
- **Files modified:** none (classification/documentation completeness).
- **Committed in:** `6c2dc6c`.

No Rule-4 (architectural) escalations. No authentication gates. No checkpoints (fully autonomous plan).

---

**Total deviations:** 2 (both audit-method completeness corrections: 1 frontend cast-access blind spot, 1 second template-literal source) — neither touches `src/`, `supabase/functions/`, `.env.example`, or any source file.
**Impact on plan:** Both essential for inventory correctness (a false `needs-investigation` on a live flag; an under-documented template surface). No scope creep.

## Issues Encountered

- The acceptance-criteria secret guard command in the plan uses `rg -E "…"`, but ripgrep interprets `-E` as `--encoding` (it is regex-native, no `-E` needed). Re-ran without `-E`; the guard returned exit 1 (zero matches = PASS). Read-only, no artifact impact — the corrected invocation is recorded in the Re-Assertion block.

## User Setup Required

None — read-only enumeration over `src/`, `supabase/functions/`, and `.env.example` NAMES. No live secret store was read; no credentials involved.

## Next Phase Readiness

- **Phase 7 (ENV-02..05) has a fully actionable inventory:** ENV-02 = reconcile the ~46 code-not-example gaps + the 2 example-not-code gaps; ENV-03 = canonical `.env.example` adding `VITE_STRIPE_PUBLISHABLE_KEY` + the Stripe (secret/webhook/6 subscription/4 merit), OCR/Ollama, `MERIT_SYSTEM_ENABLED`, `ADMIN_EMAIL(S)`, `STRIVO_ENV` families; ENV-04 = split the 27 test/CI names (incl. the test-seam toggles) from the production bucket; ENV-05 = fail-closed required-set validation + resolving the 10 OCR/Ollama `needs-investigation` (parser-first fallback liveness, owned jointly with DEAD-CODE.md / Phase 4 D-08).
- The other Wave-2 catalogs (03-05 DB, 03-06 PERF) are unaffected — this plan wrote ONLY `ENV-INVENTORY.md` and never edited INDEX.md (pre-listed row) or KEEP-LIST.md.
- No blockers.

## Self-Check: PASSED

- `.planning/audit/ENV-INVENTORY.md` exists on disk (Write succeeded; `git show --stat HEAD` lists it).
- Frontend `VITE_*` table + edge-secret tables (production / template-literal subscription / OCR-Ollama / test-CI) all present, each with name / consumer / environment / required-optional / classification columns.
- Template-literal subsection lists `STRIPE_PRICE_PRO_MONTHLY` … `STRIPE_PRICE_ELITE_ANNUAL` as **LIVE** / never-`safe` (grep: 20× `STRIPE_PRICE_` matches, all with a not-unused verdict).
- `VITE_STRIPE_PUBLISHABLE_KEY` flagged code-not-example (grep-confirmed, lines 23 + 181).
- **Secret-pattern grep guard over the file returned exit 1 = NO match** (no value leaked — T-3-07 closed).
- Cross-References block references `KEEP-LIST.md` (5× in-file) + Phase 7.
- Commit `6c2dc6c` exists; `git show --stat HEAD` listed ONLY `.planning/audit/ENV-INVENTORY.md`.
- Zero functional change: `git diff --stat fa4ccb6..HEAD -- src supabase/functions` empty; `git status --short src supabase/functions .gitignore` empty (no source/env/.gitignore touched).

---
*Phase: 03-cross-domain-inventory-audit*
*Completed: 2026-06-14*
