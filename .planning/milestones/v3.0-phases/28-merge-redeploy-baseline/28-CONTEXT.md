# Phase 28: Merge & Redeploy Baseline - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator-led prerequisite gate for v3.0. Three procedural deliverables:

1. Reconcile `by/env-fixes` (174 commits carrying Phases 25/26/27) onto `main`.
2. Redeploy all edge functions from post-merge `main` to staging and production.
3. Delete the legacy `interview-prep-coach` Supabase function from staging and production.

Then verify whether the production Interview Prep 503 was a deploy-drift symptom (200 = drift confirmed) or a code defect (persistent 503 = handed off to Phase 41).

This phase ships no new feature code. Locked Success Criteria from ROADMAP.md:
1. `git log main..by/env-fixes --oneline` returns empty after merge.
2. `supabase functions list` no longer shows `interview-prep-coach` in either env.
3. Production Interview Prep failure repro returns 200 (or persistent 503 is reproduced against fresh-deploy code and triaged into Phase 41 with new evidence).
4. Phase 25/26/27 functionality observable on `main`: `MeritCostPreview` mounts on `/career-compass`; `refundMeritsForJob` `already_refunded` recognition is live for both async workers; 410-Gone shim responds at legacy `/stripe-webhook` path.

</domain>

<decisions>
## Implementation Decisions

### Merge strategy

- **D-01:** Use **fast-forward merge** of `by/env-fixes` → `main`. Preserves every per-plan GSD commit; no merge-commit noise. Squash and rebase explicitly rejected (squash destroys GSD's intentionally-granular commit history; rebase rewrites 174 commit hashes).
- **D-02:** Pre-merge dirty-tree handling: `git stash -u --keep-index` BEFORE the FF, restore after. Working tree contains 10 deleted `.planning/phases/*-SUMMARY.md` files and `supabase/.temp/` modifications. Per CLAUDE.md and project memory rule, **NEVER commit anything under `.planning/` or `.gitignore`** — these stay stashed/discarded, never staged.
- **D-03:** Pre-FF preflight gate (both must pass before the real merge):
  - `git log by/env-fixes..main` is empty (confirms `main` has not diverged so FF is possible).
  - `git merge --ff-only --no-commit` dry-run executed and aborted (confirms zero conflicts).
- **D-04:** **Operator runs `git push origin main` manually.** Claude does NOT push without explicit per-step authorization. Aligns with CLAUDE.md "only commit when asked" + the harness git safety protocol. The plan's push step is a `[OPERATOR]` step, not an automated one.

### Deploy sequencing

- **D-05:** **Staging first → smoke gate → production.** Run `scripts/deploy-staging.ps1` first, soak/verify, only then run `scripts/deploy-production.ps1`. Inverted order or parallel deploy explicitly rejected.
- **D-06:** **Redeploy ALL edge functions from `main`.** MERGE-02 reads literally; the deploy-drift hypothesis applies to the whole surface, not just IPC. The existing PowerShell deploy scripts already enumerate the function list.
- **D-07:** Staging smoke gate (all four must pass before promoting to prod):
  1. **IPC 503 repro returns 200** — direct SC #3 evidence.
  2. **Phase 25/26/27 surfaces observable** — `MeritCostPreview` on `/career-compass`; `refundMeritsForJob` `already_refunded` for both async workers (`process-resume-analysis-job`, `process-career-analysis-job`); 410-Gone shim responds at legacy `/stripe-webhook`. Direct SC #4 evidence.
  3. **All 5 features run a one-shot smoke** — Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens, Interview Prep each get one analyze call to confirm no merge-induced regressions.
  4. **Edge function logs clean for ~5 minutes** — watch Supabase function logs for new error spikes after staging deploy before promoting.
- **D-08:** **Soak window: ~5 minutes** post-staging-deploy after smoke passes, before running `deploy-production.ps1`.
- **D-09:** **Post-prod verification battery = same battery as staging gate.** Re-run all four smoke items against production. Direct evidence for SC #1–4 in the actual prod environment, not just staging.

### Legacy `interview-prep-coach` delete

- **D-10:** **Run `supabase functions delete interview-prep-coach` AFTER prod redeploy + smoke passes.** Legacy function stays available as a fallback until the replacement is verified live in prod. If prod redeploy/smoke fails, the legacy is still serving traffic.
- **D-11:** Per-env order: **staging first, then production** (mirrors the redeploy safety pattern).
- **D-12:** Pre-delete preflight: `rg -n interview-prep-coach src/ supabase/`. Expect zero live refs in `src/` or `supabase/functions/`; only `.planning/` references are allowed (those are documentation, not runtime). Halt if a live ref exists.
- **D-13:** Verification artifact for SC #2: capture `supabase functions list --project-ref <STAGING>` AND `<PROD>` output post-delete; both lists must exclude `interview-prep-coach`. Trusting the delete CLI's exit code alone explicitly rejected.

### 503 verification + rollback

- **D-14:** **SC #3 repro = replay the original failing payload** that produced the production 503 (logged with `sonnet-4` model name despite Haiku-only `_shared/tier-config.ts` post-`260419-hku` — that mismatch IS the deploy-drift signal). Replay against post-redeploy production. Fresh end-to-end IPC flow rejected as the canonical repro because it doesn't directly hit the failing path.
- **D-15:** Repro tier coverage: **the tier the original 503 was logged under (primary), plus Pro and Elite**. Free is not in the matrix unless the original 503 came from Free.
- **D-16:** **If IPC alone is 503ing post-redeploy** (everything else healthy): hand off to **Phase 41** with fresh-deploy evidence (post-redeploy log lines, payload, tier, error shape). Phase 28 SC #3 is satisfied via ROADMAP's alternate branch. Do NOT revert the merge.
- **D-17:** **Revert triggers** (any one fires a rollback):
  - Regression in Resume Analysis, LinkedIn Grader, Career Compass, or Recruiting Lens beyond IPC.
  - Phase 25/26/27 surfaces missing post-deploy (SC #4 fails: MeritCostPreview not mounting, `refundMeritsForJob` not recognizing `already_refunded`, or 410-Gone shim missing).
  - Merit balance / Stripe webhook regression. Stripe Live points only at `/stripe-webhook-handler`; if shop purchases stop crediting or merit balance breaks post-deploy, revert immediately.
- **D-18:** **Closing artifact:** VERIFICATION.md is structured as an SC #1–4 checklist with the exact command run + its captured output inline below each SC item (`git log main..by/env-fixes`, `supabase functions list` for both envs, IPC repro response body+status, Phase 25/26/27 observable evidence). Free-form retrospective and tag-only proofs explicitly rejected — must be machine-extractable for downstream audit/intel.

### Claude's Discretion

- Exact PowerShell incantation / parameter set for `deploy-staging.ps1` / `deploy-production.ps1` invocation — Claude / planner picks based on script signatures.
- Specific log query strings used during the 5-minute log soak.
- Format of the captured `supabase functions list` output (raw paste vs. table reformat) — operator/planner choice.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 28: Merge & Redeploy Baseline" (lines 70–86) — Goal, dependencies, requirements, Success Criteria #1–4, out-of-scope.
- `.planning/REQUIREMENTS.md` MERGE-01, MERGE-02, MERGE-03 — exact requirement text including the deploy-drift hypothesis (`sonnet-4` model name in 503 logs vs. Haiku-only `_shared/tier-config.ts` post-`260419-hku`).
- `.planning/STATE.md` §"Accumulated Context" + §"v2.0 Tech Debt" — v2.0 closure, the operator-deferred `interview-prep-coach` delete, and the `by/env-fixes` carry-forward note.
- `.planning/v2.0-MILESTONE-AUDIT.md` — context on Phase 25/26/27 outputs that must remain observable post-merge.

### Project conventions and constraints
- `CLAUDE.md` — working agreement (small reversible changes, never commit `.planning/`), reliability priorities (Resume Analysis / Career Compass are business-critical; treat repeated `OPTIONS`/`503` as platform routing failures), git safety protocol.
- `README.md` §"Deployment" — confirms staging/prod deploy via Supabase CLI + environment-specific PowerShell scripts.

### Deploy and tooling artifacts
- `scripts/deploy-staging.ps1` — staging deploy entry point (will be invoked by D-05/D-06).
- `scripts/deploy-production.ps1` — production deploy entry point (gated by D-07/D-08).
- `supabase/functions/_shared/tier-config.ts` — Haiku-only post-`260419-hku`; the file whose state is implicitly under test by SC #3.
- `supabase/functions/interview-prep-analyze/` — current canonical IPC backend (rebuilt in Phase 23).
- `supabase/functions/interview-prep-evaluate/` — companion IPC function.

### Phase 25/26/27 surfaces under SC #4 verification
- `src/pages/CareerCompass.tsx` — must show `MeritCostPreview` mount post-deploy (Phase 25).
- `supabase/functions/process-resume-analysis-job/` and `supabase/functions/process-career-analysis-job/` — both must recognize `already_refunded` in `refundMeritsForJob` (Phase 26).
- `supabase/functions/stripe-webhook/` — 410-Gone shim must respond on the legacy path (Phase 27 defense-in-depth; not load-bearing today since Stripe Live points exclusively at `/stripe-webhook-handler`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **PowerShell deploy scripts** (`scripts/deploy-staging.ps1`, `scripts/deploy-production.ps1`) already swap `supabase/config.toml`, link to the target Supabase project, and deploy the function list. Plan invokes these directly — no new deploy logic needed.
- **`refundMeritsForJob`** helper is wired into both async-job processors on `by/env-fixes` (per recent commits `0e366bc`, `fdb8f51`). Smoke gate verifies the wiring lands on `main` post-merge.
- **`MeritCostPreview`** mount on `CareerCompass.tsx` is part of Phase 25 carry-forward (commit `1d5653c`). Smoke gate verifies it survives the FF.

### Established Patterns
- **Atomic commit history is sacred** — GSD commits each plan step separately; squash merge would destroy this. FF is the only strategy that preserves it AND avoids merge-commit noise.
- **`.planning/` and `.gitignore` MUST NEVER be committed** — enforced by CLAUDE.md and persistent memory rule. The dirty-tree stash is critical because the working tree currently has staged-able `.planning/` deletions.
- **Operator-led phases** — Phase 28 is explicitly operator-led; Claude does NOT execute `git push` or destructive ops without per-step authorization.
- **Staging-first deploys** — both deploy scripts exist as separate entry points specifically to support staged rollouts; both are required, in order.

### Integration Points
- Post-merge state is the v3.0 baseline. Every subsequent v3.0 phase (29 onward) `Depends on: Phase 28` — there is zero downstream work that can begin until SC #1–4 are documented as passing.
- `interview-prep-coach` removal is the closing operator action from the v2.0 audit; Phase 41 will revisit IPC functionality after Phase 28's redeploy hypothesis is resolved.

</code_context>

<specifics>
## Specific Ideas

- The IPC 503 production failure log captured `sonnet-4` as the model name despite `_shared/tier-config.ts` being Haiku-only post-`260419-hku`. THAT specific mismatch is the deploy-drift evidence; the SC #3 repro is designed to test whether redeploying a Haiku-routed `tier-config.ts` resolves the 503.
- Phase 28 has no SPEC.md — requirements are fully captured in ROADMAP.md SC #1–4 plus REQUIREMENTS.md MERGE-01/02/03. No re-derivation needed.

</specifics>

<deferred>
## Deferred Ideas

- **Persistent IPC 503 investigation** — if SC #3 fails, Phase 41 (Interview Prep Production Fix + History + Cache) owns the fix per ROADMAP. Phase 28 only captures fresh-deploy evidence.
- **VERIFICATION backfill for v2.0 phases (10, 19, 22, 24, 27)** — flagged in STATE.md tech debt, not in Phase 28 scope.
- **Live tier-output validation harness, Docker pgTAP for Phase 11, perf p99 live-run** — operator-deferred ops from v2.0; not Phase 28.

</deferred>

---

*Phase: 28-merge-redeploy-baseline*
*Context gathered: 2026-04-28*
