# Phase 9: Final Verification & Milestone Report - Research

**Researched:** 2026-07-10
**Domain:** Test-gate composition, coverage-registry enforcement, staged production flag activation, evidence reporting
**Confidence:** HIGH (this is an in-repo audit; nearly every claim below is a grep-verified file path + test name, not an external-source assertion)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Flag posture and production activation**

- **D-01 — Phase 9 activates the lifecycle on production.** Verify the lifecycle-ON posture on staging first, then flip `ANALYSIS_LIFECYCLE_ENABLED` plus the five per-feature flags on production behind an operator gate. Rationale: the milestone's value (merit-safety, persistence, refresh recovery, structured errors) only reaches users if production actually runs the lifecycle. Closing v5.0 with prod on legacy paths would ship the milestone as dead code.
- **D-02 — Staged rollout in ascending blast radius.** Master flag ON, then one feature at a time in the order the migrations shipped: `recruiting_lens` → `linkedin` → `onboarding` → `resume` → `career_compass`. Each flip gets a soak window and a merit-ledger check before the next. This mirrors the design intent of the two-level gate documented in `supabase/functions/_shared/analysis-flags.ts`.
- **D-03 — `MERIT_SYSTEM_ENABLED` is verified ON in staging only; production stays `false`.** Turning it on in staging proves the Phase-13 submit-time merit-deduction path end-to-end and produces activation-readiness evidence for the report. It is a GLOBAL gate across 10+ AI functions — setting it true on production in Phase 6 flipped platform-wide behavior and had to be reverted, so its production activation remains a separate milestone-level decision.
- **D-04 — Abort/rollback criteria (Claude's discretion, resolved).** Abort any production flip and set the master flag OFF immediately on: (a) any merit-ledger anomaly — a double-charge, a missing refund on a failed run, or a settle without a saved result; (b) any run stuck non-terminal past the reaper window; (c) any new 4xx/5xx error class in edge logs that was not present in the pre-flip baseline; (d) any user-visible regression in output quality or latency. Master-off is instant and restores the legacy paths byte-identically, which is exactly what the dormancy design bought.

**Gate composition (VER-01)**

- **D-05 — Extend `verify:baseline` itself with lint + type-check + build.** These are fast and deterministic, and folding them in genuinely strengthens the `deploy.ps1` pre-deploy gate rather than producing a one-off report artifact. VER-01 requires the gate be extended, not replaced. Current gate is `test && test:edge && test:e2e`.
- **D-06 — Fold the remote database lane into the blocking gate.** Run the Deno edge suite against the preview Supabase project (`DENO_TEST_SUPABASE_REMOTE=1`) as part of `verify:baseline`, not as a side evidence run. This satisfies VER-01's database-test requirement with real DB evidence on every deploy.
  - **Constraint the planner MUST address:** this makes every deploy depend on the preview project (`cimjltzovkahkqecpwgi`) being reachable and unpaused. It was paused for all of v4.0. The gate must **fail loudly** when preview is unreachable — never silently skip, never auto-degrade to the offline lane. If an escape hatch is needed it must be explicit, opt-in, and loud, following the `-SkipVerify` precedent in `scripts/deploy.ps1`.
- **D-07 — Adversarial promptfoo suites run once as evidence, stay OFF the gate.** Execute all `test:adversarial:*` suites during Phase 9 and capture the results as the security / AI-prompt-exposure evidence for the report. They cost real Anthropic calls and are non-deterministic, so they must not gate deploys.
- **D-08 — Deployment validation is a real staged deploy plus post-deploy smoke.** Run `scripts/deploy.ps1 -Env staging` (which itself gates on `verify:baseline`), then smoke: apex + www CORS re-proof, one live analysis per feature, edge-log check. Repeat against production as part of the activation. The deploy is the activation vehicle, not a separate ceremony.

**Scenario matrix (VER-02)**

- **D-09 — Audit-first; close only genuine gaps.** Map all 23 scenarios against each feature using the tests Phases 4/5/6 already wrote (152 Deno test files, 87 vitest files, 4 Playwright specs), publish the traceability matrix, then write tests only where a cell is genuinely uncovered. Do not rebuild coverage that already exists.
- **D-10 — Matrix scope is the five migrated features:** Resume Analysis, Onboarding, LinkedIn Grader, Recruiting Lens, Career Compass. Excludes Interview Prep (Coming Soon, explicitly out of v5.0 scope), Skills Gap, and Compare Jobs.
- **D-11 — Fault-inject what is faultable; explicitly justify the rest.** Provider timeout, provider rate-limiting, invalid model JSON, and truncated output are all fault-injectable at the Anthropic client seam — automate them. Two-tab concurrency is testable in Playwright with two browser contexts. Anything genuinely impractical gets an explicit accept-with-justification entry in the registry. There are no silent gaps.
- **D-12 — The matrix is machine-enforced, not a document.** Build a coverage registry (scenario × feature → test file/name) with a test that fails if any cell is neither mapped to a live test nor carries an explicit justified waiver, and fold it into `verify:baseline`. A markdown matrix would drift the moment a test is renamed.

**Real-account verification (VER-04)**

- **D-13 — Dedicated Free + Elite test accounts on production, post-activation.** Two purpose-created accounts exercised on production after each staged flag flip. VER-04 and the activation soak become the same evidence, and it proves the real user path rather than a staging approximation. Real user accounts are never touched.
- **D-14 — Evidence schema: `run_id` + merit-ledger delta + redacted screenshot.** For each run capture the `analysis_runs` row id and its terminal state, the merit-ledger delta (proving charged-exactly-once, refunded-on-failure), and a PII-redacted screenshot. Stored under the phase directory and cited from the report. Claims must be machine-verifiable, not prose assertions.
- **D-15 — PII protection is enforced, not intended.** All resume and LinkedIn inputs come from the existing synthetic fixtures in `scripts/test-resumes/`. Add a guard test that scans phase artifacts and fixtures for real-user markers (email addresses, production user UUIDs), modeled on the doc/secret-leak guards Phase 2 already established.

**Final report (VER-05)**

- **D-16 — The report covers Phases 1–9 including the inserted 08.1 / 08.2 / 08.3**, and Phase 9 reconciles the roadmap checkbox drift (08.2's five plan checkboxes are unchecked in `ROADMAP.md` despite all five SUMMARY files existing; Phases 1 and 8 are likewise unchecked in the phase list while marked Complete in the progress table). An evidence report that contradicts the roadmap is not evidence.
- **D-17 — All 14 mandated report items are addressed**, each claim backed by test output, database evidence, deployment evidence, or a reproducible manual verification record. The per-phase VERIFICATION / VALIDATION / SECURITY artifacts are the primary source material; fresh runs supply the rest.

### Claude's Discretion

- **Rollback trigger definition** — resolved above as D-04, derived from the lifecycle's own failure taxonomy (`_shared/analysis-error-taxonomy.ts`) and the Phase 3/6 soak precedents.
- **Soak duration per flag flip** and the numeric definition of "green" for the post-flip edge-log check — planner to derive from the Phase 6 live-smoke precedent.
- **Report file location and internal structure** — planner's choice, but it lives under the phase directory and every one of the 14 items is individually addressable.

### Deferred Ideas (OUT OF SCOPE)

- **`MERIT_SYSTEM_ENABLED` production activation** — verified ON in staging during Phase 9 (D-03) and reported as activation-readiness evidence, but the production flip is deliberately NOT part of v5.0. It is a global gate across 10+ AI functions and warrants its own milestone-level decision with its own blast-radius analysis.
- **Interview Prep Coach re-enable (IP-RE-01)** — already explicitly out of v5.0 scope; stays gated behind "Coming Soon". Excluded from the VER-02 matrix (D-10).
- **Skills Gap and Compare Jobs scenario coverage** — not lifecycle-migrated, so outside the VER-02 matrix (D-10).
- **v5.x deferrals carried from research** — Elite cross-analysis depth weight tuning, role/job-specific Profile Alignment layer, LinkedIn rubric weight calibration against a labeled profile set, longitudinal trend views. Already on the roadmap backlog; the report's "remaining risks + follow-ups" item should reference them rather than re-litigate them.
</user_constraints>

---

## Summary

Phase 9 is an **audit-and-activate** phase, not a build phase. The single most important finding is that the existing test estate already covers most of the VER-02 matrix — Phases 3/4/5 built `idempotency-repeated-run.test.ts`, `runtime-validation-convergence.test.ts`, `analysis-lifecycle.classifier.test.ts`, `analysis-lifecycle.refund-boundary.test.ts`, `refund-after-save.test.ts`, `cors-matrix.test.ts`, and a deep `useAnalysisRun.test.ts` — but that coverage is **shaped by function, not by feature**, and it is **lopsided**: Recruiting Lens is the thinnest column despite being the first flag flipped, and five `history-persistence.test.ts` files (the entire History-correctness row) are currently **dead code** — remote-gated AND absent from the `test:ci` allowlist, so they have not executed in CI at all.

Four hard structural corrections the planner must absorb before writing tasks. **(1) There is no `analysis_runs` table.** The lifecycle lives on `public.analysis_jobs`, which Phase 3 extended with `state` (an 11-value text CHECK), `merit_settled`, `refunded`, and `merit_transaction_id` (`supabase/migrations/20260702000001_analysis_lifecycle_ledger.sql`). Every D-14 evidence query in CONTEXT.md that says "`analysis_runs` row" must target `analysis_jobs`. The merit ledger is `public.merit_transactions` (+ the `user_merits` balance row). **(2) Onboarding is not a separate edge function** — it is `analyze-resume` with `origin: 'onboarding'` in the request body (`supabase/functions/analyze-resume/index.ts:1165-1177`). The matrix's Onboarding column is a *branch* of the Resume column, which makes several cells free and a few (the `origin` dispatch itself) uniquely load-bearing. **(3) The Anthropic seam can force a status but cannot yet force a malformed body** — D-11's "invalid model JSON" and "truncated output" are NOT injectable at the live seam today; they are only reachable by direct unit call. **(4) `docs/ENVIRONMENT.md` contains zero mentions of `ANALYSIS_LIFECYCLE_*`** — the six flags Phase 9 exists to flip are missing from the file CONTEXT.md names as their authority.

The good news on D-06: the fail-loud contract the constraint demands **already exists in the repo** and is the model to generalize — `supabase/functions/_shared/__tests__/history-persistence-remote.ts:5-22` (`skipRemote()`) throws when `DENO_TEST_SUPABASE_REMOTE=1` but the staging URL/key is missing or still a placeholder, explicitly so "a misconfigured remote run cannot pass vacuously." The work is to (a) put the five remote test files on an allowlist, (b) add a reachability preflight, and (c) make `verify:baseline` invoke a remote lane that has no silent-skip path.

**Primary recommendation:** Sequence Phase 9 as *audit → registry → gap-tests → gate extension → staged activation → report*. Build the D-12 coverage registry FIRST (as a static-source Deno guard modeled on `_shared/no-paddle-live-surface.test.ts`), because the registry is what converts the audit into an enforceable artifact and its initial red state is the authoritative gap list the rest of the phase closes.

---

## Standard Stack

No new libraries. Phase 9 is composed entirely of tools already installed and already wired into the gate. Adding a dependency here would be a smell.

### Core (already present)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `vitest` | 4.1.9 | Frontend unit/integration + doc/static guards (`src/**/*.test.ts`) | Already the `npm run test` lane; auto-discovers `src/**/*.test.ts` with no registration step |
| `deno test` | Deno 2+ | Edge contract tests + static-source guards | Already the `npm run test:edge` lane; **explicit allowlist** in `supabase/functions/deno.json` `test:ci` |
| `@playwright/test` | 1.61.0 | Browser E2E; `browser.newContext()` gives the two-tab scenario | Already the `npm run test:e2e` lane |
| `eslint` | 10.5.0 | `npm run lint` — D-05 addition to the gate | Already scripted, not yet gated |
| `tsc --noEmit` | TS 5.8.3 | `npm run type-check` — D-05 addition | Already scripted (`tsc -p tsconfig.app.json --noEmit`), not yet gated |
| `vite build` | Vite 8 | `npm run build` — D-05 "production build" | Already scripted, not yet gated |
| `promptfoo` | 0.120.13 | D-07 one-shot adversarial evidence | 6 `test:adversarial:*` scripts already exist; stays OFF the gate |
| `cross-env` | 10.1.0 | Sets `DENO_TEST_SUPABASE_REMOTE` cross-platform | Already used by `test:edge` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static-source Deno guard for the D-12 registry | A vitest registry guard in `src/test/` | Vitest auto-discovers (no `deno.json` edit) and is the natural home for a registry that must reference **both** Deno and vitest and Playwright test files. **Recommendation: vitest.** See "Pattern 2" — the registry must read across all three runners, and only the vitest lane can `node:fs`-walk the whole repo comfortably. `no-paddle-live-surface.test.ts` proves the Deno variant works too, but it would need `--allow-read` on paths outside `supabase/`. |
| A markdown matrix | The machine-enforced registry | D-12 forecloses this. A markdown matrix drifts on the first test rename — which is precisely the failure mode the registry must prevent. |
| Adding a `verify:full` alongside `verify:baseline` | Extending `verify:baseline` in place | D-05 forecloses this: VER-01 says *extended, not replaced*, and `deploy.ps1` only knows the one command. A parallel script would leave the deploy gate at its current strength. |

---

## Architecture Patterns

### The current gate, exactly

```
npm run verify:baseline
  └─ npm run test        # vitest run                                     (87 test files in src/**)
  └─ npm run test:edge   # cd supabase/functions
                         # && cross-env DENO_TEST_SUPABASE_REMOTE=0
                         # && deno task test:ci                            (~110-file EXPLICIT allowlist)
  └─ npm run test:e2e    # playwright test                                (4 specs / 5 tests)
```

Enforced at two points (`TESTING-STRATEGY.md` §"Where the gate is wired"):
1. `.github/workflows/regression-gate.yml` (sets `DENO_TEST_SUPABASE_REMOTE: '0'` at line 53) + GitHub branch protection.
2. `scripts/deploy.ps1` — HARD precondition, runs `npm run verify:baseline` **before `supabase link`**; red ⇒ `Write-Error` + `exit 1`. `-SkipVerify` is the documented emergency-only bypass (default OFF).

### Pattern 1: The gate extension (D-05 + D-06)

Target composition. Fail-fast `&&` chaining is the existing idiom; keep it.

```jsonc
// package.json §scripts — proposed
{
  "lint":         "eslint .",                       // exists
  "type-check":   "tsc -p tsconfig.app.json --noEmit", // exists
  "build":        "vite build",                     // exists
  "test":         "vitest run",                     // exists
  "test:edge":    "cd supabase/functions && cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci",
  // NEW — the remote DB lane (D-06). No silent-skip path.
  "test:edge:remote": "cd supabase/functions && cross-env DENO_TEST_SUPABASE_REMOTE=1 deno task test:remote",
  "test:e2e":     "playwright test",

  // VER-01: lint -> type-check -> unit -> edge(offline) -> edge(remote/DB) -> e2e -> build
  "verify:baseline": "npm run lint && npm run type-check && npm run test && npm run test:edge && npm run test:edge:remote && npm run test:e2e && npm run build"
}
```

**Ordering rationale:** cheapest-and-most-deterministic first (lint, type-check are seconds), then the layers in ascending cost and ascending external dependency. `build` last because it is the slowest pure-local step and its failure mode (a type/import error) is almost always already caught by `type-check`. Put `test:edge:remote` **after** the offline lane so a plain logic regression fails before you spend a network round-trip on preview.

**Cost warning the planner must weigh:** this chain now runs on *every* `deploy.ps1` invocation. Measure the wall-clock before committing — if it pushes past ~10 minutes the operator will start reaching for `-SkipVerify`, which defeats the whole gate. If it does, the mitigation is NOT to drop a lane; it is to keep the chain and accept the deploy latency, since deploys are infrequent and operator-gated anyway.

### Pattern 2: The D-12 coverage registry (the phase's keystone)

**The requirement restated precisely:** a cell (scenario × feature) is *covered* only if it maps to a test that **actually exists right now under that exact name**. A rename must turn the cell red, not silently un-cover it.

The repo already has three static-source guards that prove this mechanism works:

| Guard | Runner | Mechanism |
|-------|--------|-----------|
| `supabase/functions/_shared/no-paddle-live-surface.test.ts` | deno | Explicit file list (**deliberately NOT a directory walk**, "so this guard's coverage is auditable and intentional"), line-by-line scan, `ALLOWED_LINE_PATTERNS` escape valve |
| `supabase/functions/_shared/cors-audit.test.ts` | deno | Static sweep of 21 user functions asserting each is `withCors`-wrapped |
| `src/test/security/security-audit-docs.test.ts` | vitest | `node:fs` reads relative to `process.cwd()`, auto-discovered by vitest; regex table (`SECRET_PATTERNS`) + structural assertions on planning docs |

**Recommended mechanism: a vitest guard at `src/test/coverage/ver02-matrix.test.ts`.** Rationale: the registry must resolve test names living in *three* runners (`supabase/functions/**` Deno, `src/**` vitest, `e2e/**` Playwright). `security-audit-docs.test.ts:7` already establishes the "read repo files with `node:fs` from `process.cwd()`, auto-discovered by vitest, no registration needed" precedent — and critically, **no `deno.json` allowlist edit is required**, so the registry can never be accidentally dropped from `test:ci`.

Concrete sketch:

```ts
// src/test/coverage/ver02-matrix.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

type Feature = 'resume' | 'onboarding' | 'linkedin' | 'recruiting_lens' | 'career_compass';

type Cell =
  | { kind: 'test'; file: string; name: string }          // must exist, verbatim
  | { kind: 'waiver'; reason: string; approvedBy: string }; // D-11 explicit justification

// The registry IS the matrix. One entry per scenario x feature. No cell may be omitted.
const REGISTRY: Record<string, Record<Feature, Cell[]>> = {
  'S-14 invalid model JSON': {
    resume: [{ kind: 'test',
      file: 'supabase/functions/analyze-resume/__tests__/runtime-validation-convergence.test.ts',
      name: 'FEAT-02: garbage (non-JSON) output → MODEL_INVALID_RESPONSE' }],
    // ...
  },
  // ...
};

describe('VER-02 scenario x feature coverage registry', () => {
  it('every scenario x feature cell is present (no silent omission)', () => {
    for (const scenario of SCENARIOS) {
      for (const feature of FEATURES) {
        expect(REGISTRY[scenario]?.[feature], `${scenario} x ${feature}`).toBeDefined();
        expect(REGISTRY[scenario][feature].length).toBeGreaterThan(0);
      }
    }
  });

  it('every mapped test file EXISTS on disk', () => { /* existsSync */ });

  // THE anti-drift assertion — a rename turns the cell red.
  it('every mapped test NAME appears verbatim in its file', () => {
    for (const [scenario, byFeature] of Object.entries(REGISTRY)) {
      for (const [feature, cells] of Object.entries(byFeature)) {
        for (const cell of cells) {
          if (cell.kind === 'waiver') continue;
          const src = readFileSync(cell.file, 'utf8');
          expect(src.includes(cell.name), `${scenario} x ${feature}: "${cell.name}" not found in ${cell.file}`)
            .toBe(true);
        }
      }
    }
  });

  it('every waiver carries a non-empty reason + approver (no silent gaps — D-11)', () => { /* ... */ });
});
```

**Why the `name` check is the load-bearing one:** `existsSync(file)` alone would let a rename slip through. Asserting the verbatim `Deno.test('...')` / `it('...')` title string appears in the file source is what makes "a renamed test fails the gate rather than silently un-covering a cell" literally true — exactly the D-12 requirement. This is a substring assertion against source text, not a test-runner introspection, which is why it works uniformly across Deno/vitest/Playwright.

**Pitfall the planner must handle:** test names in this repo contain apostrophes and `→` characters and are written in both `'...'` and `"..."` quoting. Store the *inner* title text only and substring-match it; do not try to reconstruct the full `Deno.test('...')` call.

### Pattern 3: Fail-loud remote lane (D-06)

The contract already exists — generalize it, do not invent it:

```ts
// supabase/functions/_shared/__tests__/history-persistence-remote.ts:5-22  (VERBATIM, existing)
export function skipRemote(label: string): boolean {
  if (!remoteEnabled()) {
    console.log(`[history-persistence] SKIP ${label} - set DENO_TEST_SUPABASE_REMOTE=1 to run staging persistence tests`);
    return true;
  }
  // Remote IS enabled: fail loudly (do NOT silently skip) when staging secrets are
  // missing or still the placeholder, so a misconfigured remote run cannot pass vacuously.
  const url = optionalEnv("SUPABASE_URL_STAGING");
  if (!url || url.includes("test.supabase.co")) {
    throw new Error(
      "DENO_TEST_SUPABASE_REMOTE=1 but SUPABASE_URL_STAGING is empty or still the placeholder https://test.supabase.co; set it to the real staging project URL.",
    );
  }
  if (!optionalEnv("SUPABASE_SERVICE_ROLE_KEY_STAGING")) {
    throw new Error("DENO_TEST_SUPABASE_REMOTE=1 but SUPABASE_SERVICE_ROLE_KEY_STAGING is empty; set it to the staging service role key.");
  }
  return false;
}
```

This already does exactly what D-06 demands for the *misconfigured* case. What it does NOT do is cover the *unreachable* case (preview paused → the `fetch` hangs or 5xx's, and each test fails with a confusing per-test network error rather than one clear "preview is down" message).

**Three changes needed:**

1. **A new `test:remote` task in `supabase/functions/deno.json`** listing the five currently-orphaned remote files (they are on NO allowlist today — see the gap table). Keep it a separate task from `test:ci` so the offline lane stays offline and CI's `DENO_TEST_SUPABASE_REMOTE: '0'` job keeps working unchanged.
2. **A reachability preflight test that runs first and fails with one loud, unambiguous message.** Model it on `skipRemote`'s throw:
   ```ts
   // supabase/functions/_tests/remote-preflight.test.ts   (new; first entry in test:remote)
   Deno.test("REMOTE PREFLIGHT: preview project is reachable (fail-loud, never auto-degrade)", async () => {
     if (Deno.env.get("DENO_TEST_SUPABASE_REMOTE") !== "1") {
       throw new Error(
         "test:remote was invoked without DENO_TEST_SUPABASE_REMOTE=1. The remote DB lane must never " +
         "silently degrade to the offline lane. Run `npm run test:edge:remote`, or bypass explicitly " +
         "and loudly with `deploy.ps1 -SkipRemoteDbLane` (emergency only)."
       );
     }
     // ...assert SUPABASE_URL_STAGING / SUPABASE_SERVICE_ROLE_KEY_STAGING (reuse skipRemote's checks)...
     const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key }, signal: AbortSignal.timeout(10_000) });
     if (!res.ok && res.status !== 404) {
       throw new Error(
         `REMOTE PREFLIGHT FAILED: preview project ${url} returned ${res.status}. ` +
         `The preview Supabase project (cimjltzovkahkqecpwgi) is likely PAUSED or unreachable. ` +
         `Unpause it — do NOT skip this lane. (It was paused for all of v4.0.)`
       );
     }
   });
   ```
   The negative assertion (`!== "1"` ⇒ throw) is what forecloses the silent-degrade path: even if someone wires `test:remote` without the env var, the lane fails rather than vacuously passing.
3. **A `-SkipRemoteDbLane` switch in `scripts/deploy.ps1`**, modeled 1:1 on the existing `-SkipVerify` — default OFF, prints a loud `Write-Warning` banner, documented as emergency-only. **`scripts/deploy.ps1` must stay pure ASCII** (Windows PowerShell 5.1 reads it as cp1252; em-dashes and box-drawing characters break parsing with a "missing terminator" error — this broke and was fixed in Phase 05-07, commit `cf654246`). Verify with `grep -c $'\xe2' scripts/deploy.ps1` → must be `0`.

**Env names the remote lane needs** (names, not values — per `docs/ENVIRONMENT.md:121` and `.env.test.local.example:58`):

| Name | Surface | Note |
|------|---------|------|
| `DENO_TEST_SUPABASE_REMOTE` | local `.env.test.local`, CI env | `"1"` ⇒ run remote lane. Currently hardcoded `'0'` in `regression-gate.yml:53` |
| `SUPABASE_URL_STAGING` | local, GitHub Actions secret | Must be the real preview URL; the placeholder `https://test.supabase.co` is explicitly rejected |
| `SUPABASE_SERVICE_ROLE_KEY_STAGING` | local, GitHub Actions secret | Server-side only, never browser-shipped |
| `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` / `SUPABASE_TEST_SERVICE_ROLE_KEY` | GitHub Actions secrets | Per `TESTING-STRATEGY.md` §Secrets, these all map to the SAME project — `strivoaipreview` (`cimjltzovkahkqecpwgi`). **Staging == test == preview.** There is one non-prod project, not two. |
| `AI_TEST_MODE` | Supabase preview secrets, TRANSIENT | Set immediately before the lane, `secrets unset` after (`if: always()`). Needed for deterministic remote runs — `history-persistence-remote.ts:87` explicitly hints "for deterministic TEST-05 runs, deploy the function with AI_TEST_MODE=true on staging." Never set on prod. |

### Anti-Patterns to Avoid

- **Adding `test:adversarial*` to the gate.** `TESTING-STRATEGY.md:212-214` declares a *source-asserted negative invariant*: "`verify:baseline`, `test:edge`, and `test:e2e` (and `regression-gate.yml`) contain **no** reference to `promptfoo` or any `test:adversarial*` script." D-07 preserves this. If the planner extends `verify:baseline`, that invariant statement in TESTING-STRATEGY.md must be **re-verified**, not just left standing.
- **Directory-walking the registry.** `no-paddle-live-surface.test.ts` explicitly chose an explicit file list "so this guard's coverage is auditable and intentional rather than accidentally scanning everything." The D-12 registry should be an explicit literal table for the same reason — an auto-discovered registry can't tell you what's *missing*.
- **Weakening the gate to accommodate a flaky lane.** `TESTING-STRATEGY.md:236-239`: quarantine is the only sanctioned mechanism, it requires an owner + expiry, and "the gate is never weakened with `continue-on-error`." The register is currently **empty** — keep it that way if possible.
- **Querying `analysis_runs`.** It does not exist. See below.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fail-loud remote env validation | A new env-checker | `_shared/__tests__/history-persistence-remote.ts` `skipRemote()` / `requireRemoteEnv()` | Already implements the exact "never pass vacuously" contract D-06 demands, including the placeholder-URL rejection |
| Static source guard (registry, PII guard) | A bespoke AST parse | The `no-paddle-live-surface.test.ts` / `cors-audit.test.ts` / `security-audit-docs.test.ts` line-scan + regex-table idiom | Three shipped precedents; zero dependencies; deliberately auditable |
| Forcing a refundable provider error live | A new env flag | `MERIT_TEST_FORCE_REFUNDABLE_ERROR` (`_shared/anthropic.ts:541-555`) — takes a **configurable 3-digit status** and is **staging-host-gated** (inert in prod even if set) | Already drives "all 7 sync/async refund paths"; `=429` and `=408` give you provider-rate-limit and provider-timeout live |
| Deterministic AI in E2E/remote runs | A mock server | `AI_TEST_MODE` (`_shared/anthropic.ts:575`) | Returns recorded fixtures with a deterministic per-resume score offset; already the Playwright + TEST-05 seam |
| Failure classification | New retry/permanent logic | `_shared/analysis-error-taxonomy.ts` (13 codes) + `analysis-lifecycle.classifier.test.ts` | The 13 codes ARE the D-04 "error class" vocabulary |
| Reaping stuck runs | A manual sweep | `reap-stale-analysis-runs` + `REAP_CONFIG` | Already cron'd every 15 min |
| Two-tab concurrency | A custom harness | Playwright `browser.newContext()` | Two contexts = two independent storage/session origins = a genuine two-tab test |

**Key insight:** Phase 3 built the substrate *with verification in mind* — the taxonomy, the CAS transitions, the fault-injection seams, and the fail-loud remote helper all pre-exist. Phase 9's job is to **wire and enforce** them, not to build anything new. Any task in the plan that reads "build a new X for testing" should be challenged against this table first.

---

## VER-02 Coverage Audit (D-09 / D-12) — the core research output

### Scenario enumeration: 23, but one is a triple

ROADMAP success criterion 2 lists **23 comma-delimited scenarios**. The first, "first / second / five-consecutive," is a *bundle of three*. The planner should either treat it as three registry rows (S-01a/b/c) or one row with three required test mappings — but must not let "five-consecutive" quietly vanish into "first/second," because **five-consecutive is currently uncovered for every feature** (see below).

### Feature → function mapping (READ THIS FIRST)

| Matrix column (D-10) | Actual edge function(s) | Frontend page |
|---|---|---|
| Resume Analysis | `analyze-resume` (streaming) + `submit-resume-analysis-job` / `process-resume-analysis-job` (queue) | `src/pages/Upload.tsx`, `src/pages/Results.tsx` |
| **Onboarding** | **`analyze-resume` with `origin: 'onboarding'` in the body** (`analyze-resume/index.ts:1165-1177` → `feature: 'onboarding'`). **NOT a separate function.** | `src/pages/Onboarding.tsx` |
| LinkedIn Grader | `grade-linkedin` | `src/pages/LinkedInGrader.tsx` |
| Recruiting Lens | `recruiting-lens` (Elite-gated: `403 elite_required`) | `src/pages/RecruitingLens.tsx` |
| Career Compass | `analyze-career` + `submit-career-analysis-job` + `process-career-analysis-job` | `src/pages/CareerCompass.tsx` |

All five pages import `useAnalysisRun` (grep-confirmed: `CareerCompass.tsx`, `LinkedInGrader.tsx`, `Onboarding.tsx`, `RecruitingLens.tsx`, `Upload.tsx`, `Results.tsx`).

**Consequence for the matrix:** the Onboarding column is largely satisfied by the Resume column *plus one dispatch assertion*. `analyze-resume/__tests__/idempotency-repeated-run.test.ts` already contains `FEAT-01 (1d): the onboarding feature namespace shares the resume merit identity (same parts → same key)` — that is the pattern. The genuinely Onboarding-specific cells are the `origin:'onboarding'` routing and the Onboarding page's lifecycle wiring.

### The grid

Legend: **✅ covered** (verbatim test found) · **⚠️ partial** (shared/feature-agnostic coverage only; no per-feature assertion) · **❌ GAP** (no test found — grep-verified absent).

| # | Scenario | Resume | Onboarding | LinkedIn | Recruiting Lens | Career Compass | Evidence (file :: test name) |
|---|---|---|---|---|---|---|---|
| S-01a | First analysis | ✅ | ✅ | ✅ | ❌ | ✅ | `{analyze-resume,analyze-career,grade-linkedin}/__tests__/idempotency-repeated-run.test.ts` :: `FEAT-02 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)`; Onboarding via `FEAT-01 (1d)` |
| S-01b | Second analysis | ✅ | ⚠️ | ✅ | ❌ | ✅ | same files :: `FEAT-02 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)`, `FEAT-02 (2b): the same content re-analyzed on a new nonce keys ONLY on the nonce (History preserved)` |
| S-01c | **Five consecutive** | ❌ | ❌ | ❌ | ❌ | ❌ | **GAP — all five.** Only hit for "consecutive" is `_shared/merit-gateway.perf.test.ts` (a perf test, not a per-feature scenario). |
| S-02 | Duplicate-click submission | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | `src/hooks/__tests__/useAnalysisRun.test.ts` :: `ignores a duplicate startRun while a run is active (dup guard)`, `the dup-guard holds the original run_id when startRun fires again mid-flight (no re-charge)`, `latches isActive true while a run is in flight and false once terminal`. Feature-agnostic (hook-level). Per-feature only for CC: `src/pages/__tests__/CareerCompass.recovery.test.tsx` :: `engages a submit-lock (isLocked \|\| analysisRun.isActive) to block a duplicate concurrent submit`. Backend twin: the `idempotency-repeated-run` same-nonce tests. |
| S-03 | Refresh during analysis | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | `useAnalysisRun.test.ts` :: `recovers an active run from a persisted run_id on mount` (describe: `refresh / navigation recovery`). Per-feature only for CC: `CareerCompass.recovery.test.tsx` :: `calls startRun(careerJobId) so a refresh/navigation re-attaches to the live run` |
| S-04 | Navigate away + return | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | Same as S-03 (the hook treats them as one recovery path) |
| S-05 | Missing input | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | Taxonomy `INPUT_MISSING` (`_shared/analysis-error-taxonomy.ts` + `.test.ts`); `grade-linkedin/validation.test.ts`; `{analyze-resume,analyze-career}/failure-branches.test.ts` |
| S-06 | Corrupted PDF | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `_shared/document-quality.test.ts` :: `assessExtractionQuality rejects symbol-heavy output`, `rejects repeated-line output`, `rejects missing document signals`, `rejects short text`; `_shared/document-extraction.test.ts`; `src/lib/__tests__/extract-pdf-text-empty-worker-fallback.test.ts`. **No test literally named/scoped "corrupted PDF"** — the quality-rejection tests are the de-facto coverage. Planner call: map these as the covering tests, or write an explicit corrupted-PDF fixture case. |
| S-07 | Large PDF | ❌ | ❌ | ❌ | ❌ | ❌ | **GAP.** Grep for `MAX_FILE_SIZE\|maxSize\|too large\|oversiz` across `src/lib`, `src/pages/Upload.tsx`, `_shared/document-extraction.ts` returned **no size-limit logic and no test**. Per-tier *character* caps exist (`getMaxInputChars`, asserted in `recruiting-lens/handler-config.test.ts` :: `enforces the per-tier input cap via getMaxInputChars`) — that is a text cap, not a file-size cap. The planner must decide whether "large PDF" means the char cap (then map it) or a byte cap (then it's a genuine gap, possibly a real product gap worth flagging). |
| S-08 | Reused input | ✅ | ✅ | ✅ | ❌ | ✅ | `idempotency-repeated-run.test.ts` :: `FEAT-02 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)`, `FEAT-02 (2c): tier is part of the identity` |
| S-09 | Replacement upload | ❌ | ❌ | ❌ | ❌ | ❌ | **GAP — all five.** Grep for `replacement upload\|re-upload\|reupload\|replace.*upload` across `supabase/functions`, `src`, `e2e` returned **zero hits**. |
| S-10 | Provider timeout | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `_shared/analysis-lifecycle.classifier.test.ts` :: `classifyFailure: 408 (timeout status) → retryable`, `classifyFailure: timeout message → retryable`, `classifyFailure: typed MODEL_TIMEOUT code → retryable (taxonomy authoritative)`. **Shared/feature-agnostic** — no per-feature end-to-end timeout path. |
| S-11 | Provider rate limiting | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `analysis-lifecycle.classifier.test.ts` :: `classifyFailure: 429 (rate limited) → retryable + MODEL_RATE_LIMITED`. Same caveat. |
| S-12 | Invalid model JSON | ✅ | ⚠️ | ✅ | ❌ | ✅ | `{analyze-resume,analyze-career,grade-linkedin}/__tests__/runtime-validation-convergence.test.ts` :: `FEAT-02: garbage (non-JSON) output → MODEL_INVALID_RESPONSE`, `empty model output → MODEL_INVALID_RESPONSE (never a substituted body)`, `an empty object {} → MODEL_INVALID_RESPONSE` |
| S-13 | Truncated model output | ✅ | ⚠️ | ✅ | ❌ | ✅ | same files :: `FEAT-02: a TRUNCATED (clipped) body → MODEL_OUTPUT_TRUNCATED (rejected, never repaired-and-accepted)` |
| S-14 | Schema-validation failure | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | same files :: `missing overallScore → SCHEMA_VALIDATION_FAILED`, `empty criteria array → SCHEMA_VALIDATION_FAILED (superRefine non-empty guard)`, `all-zero criterion scores → SCHEMA_VALIDATION_FAILED (model did not score)`, `all-identical criterion scores → SCHEMA_VALIDATION_FAILED (lazy model)`. RCL partial via `recruiting-lens/schema.test.ts`. |
| S-15 | Database-save failure | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | `idempotency-repeated-run.test.ts` :: `FEAT-02 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return`; `_shared/analysis-lifecycle.refund-boundary.test.ts` :: `NO refundMeritsForJob after saving -> completed (Pitfall 2)`, `merit_settled appears ONLY after a saving transition token (Pitfall 3)`. Taxonomy: `DATABASE_SAVE_FAILED`. |
| S-16 | Insufficient Merits | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | `{analyze-resume,analyze-career}/failure-branches.test.ts`; `_shared/merit-gateway.test.ts`; `grade-linkedin/entitlement.test.ts` + `free-scan.test.ts`; RCL is **Elite-gated**, covered by `recruiting-lens/handler-config.test.ts` :: `rejects the Free tier with a 403 elite_required gate` (a different-but-adjacent gate — planner should decide if that satisfies the cell or warrants a waiver) |
| S-17 | Merit-reservation failure | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | Taxonomy `MERIT_RESERVATION_FAILED` (`analysis-error-taxonomy.test.ts`); `_shared/merit-gateway.spend-ordering.test.ts`. Shared-substrate only. |
| S-18 | Settlement failure | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | Taxonomy `MERIT_SETTLEMENT_FAILED`; `analysis-lifecycle.refund-boundary.test.ts` :: `the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)` (in `idempotency-repeated-run.test.ts` as `FEAT-02 (3b)`). Shared-substrate only. |
| S-19 | Refund / release handling | ✅ | ⚠️ | ✅ | ❌ | ✅ | `{analyze-resume,analyze-career,grade-linkedin}/refund-after-save.test.ts`; `_shared/merit-gateway.refund.test.ts`, `merit-gateway.replay-refund.test.ts`, `merit-refund-idempotency.test.ts`; `process-{resume,career}-analysis-job/__tests__/refund-on-failure.test.ts`; `reap-stale-analysis-runs/__tests__/reaper.test.ts` :: `reaper releases reservation via refundMeritsForJob(reaper_stale)`. **RCL has no `refund-after-save.test.ts`** (it does have `handler-config.test.ts` :: `classifies AI/persist failures as MeritRefundable`). |
| S-20 | **Two simultaneous browser tabs** | ❌ | ❌ | ❌ | ❌ | ❌ | **GAP — all five.** No `browser.newContext()` anywhere in `e2e/`. The 4 Playwright specs are: `auth-session.spec.ts`, `resume-analysis.spec.ts`, `stripe-checkout.spec.ts`, `dashboard-intelligence.spec.ts` (5 tests total). The hook-level dup-guard tests (S-02) are the closest existing coverage but are single-context. |
| S-21 | Previous-result preservation | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | `useAnalysisRun.test.ts` :: `keeps the last successful result when a subsequent run fails` (describe: `preserve-previous-on-failure`); CC per-feature: `CareerCompass.recovery.test.tsx` :: `references analysisRun.previousResult so a later failure never clears the last success` |
| S-22 | History correctness | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | **See the "dead lane" finding below.** Tests EXIST — `{analyze-resume,analyze-career,grade-linkedin,recruiting-lens,interview-prep-analyze}/__tests__/history-persistence.test.ts` — but they are remote-gated (`skipRemote()`) AND **absent from the `test:ci` allowlist**, so they run in NO lane today. Frontend: `src/pages/__tests__/AnalysisHistory.analysis-id.test.tsx` (on the gate). |
| S-23 | Approved/rejected cross-origin | ✅ | ✅ | ⚠️ | ✅ | ✅ | Per-feature: `{analyze-resume,analyze-career,recruiting-lens}/__tests__/cors-matrix.test.ts`. **`grade-linkedin` has NO `cors-matrix.test.ts`** — it is covered only by the static `_shared/cors-audit.test.ts` (21-function `withCors` sweep) + the table-driven `_shared/cors.test.ts`. |

### The five gap clusters (this is what the planner writes tests for)

1. **Recruiting Lens is the thinnest column** — and it is the **first flag flipped** (D-02). It has NO `idempotency-repeated-run.test.ts`, NO `runtime-validation-convergence.test.ts`, NO `refund-after-save.test.ts`. It has `handler-config.test.ts` (12 contract assertions incl. merit wiring + `MeritRefundable` classification), `schema.test.ts`, `byte-preserve.test.ts`, `cors-matrix.test.ts`, `auth-rethrow.test.ts`, `phase22-contract.test.ts`, `cache-saved-jobs.test.ts`, `history-persistence.test.ts` (dead lane). **This is the single highest-priority gap** — the feature with the least coverage is the one whose flag flips first.
2. **The dead History lane (S-22).** Five `__tests__/history-persistence.test.ts` files are orphaned: remote-gated *and* off every allowlist. **D-06 is what resurrects them.** Note there are ALSO duplicate legacy copies at `{feature}/history-persistence.test.ts` (no `__tests__/`) — the planner must determine which is live and delete or register the other; shipping two divergent copies of the History contract is itself a risk.
3. **Four scenarios with zero coverage anywhere:** five-consecutive (S-01c), replacement upload (S-09), two-tab concurrency (S-20), and large-PDF (S-07, if read as a byte cap).
4. **Feature-agnostic-only cells (the ⚠️ rows).** S-02/03/04/10/11/17/18/21 are covered by *shared substrate* tests (`useAnalysisRun.test.ts`, `analysis-lifecycle.classifier.test.ts`, `refund-boundary`) that are correct but prove the *substrate*, not that *each feature is wired to it*. Career Compass is the only feature with a page-level wiring test (`CareerCompass.recovery.test.tsx`). **Recommended registry rule:** a ⚠️ cell is covered iff (shared-substrate test) **AND** (a per-feature wiring assertion). That gives the planner a cheap, high-value task: four `{Upload,Onboarding,LinkedInGrader,RecruitingLens}.recovery.test.tsx` files modeled directly on `CareerCompass.recovery.test.tsx` (which asserts *imports + gating + startRun call + submit-lock + previousResult reference* — all static/shallow, no heavy mocking).
5. **`grade-linkedin` missing `cors-matrix.test.ts`** (S-23) — a 1-file copy of the existing per-feature pattern.

---

## Fault-Injection Seam (D-11) — a correction the planner needs

D-11 asserts all four provider faults are "fault-injectable at the Anthropic client seam." **That is only half true today.** The seam (`supabase/functions/_shared/anthropic.ts`) has exactly three env branches, in this precedence order inside `invokeAnthropicText` (L557+) and `streamAnthropicText` (L744+):

| Seam | Lines | Behavior | Gating |
|---|---|---|---|
| `MERIT_TEST_FORCE_REFUNDABLE_ERROR` | 541-562 | Returns `{ ok:false, status:<configurable>, error:'forced-refundable-error' }`. `/^\d{3}$/` ⇒ that status; `'true'` ⇒ 529. | **Staging-host-gated** — checks `SUPABASE_URL.includes('cimjltzovkahkqecpwgi')` or `STRIVO_ENV==='staging'`. **Inert in production even if set.** |
| `AI_FORCE_FAILURE` (+ `AI_TEST_MODE`) | 564-573, 756-765 | Returns `{ ok:false, status:529, error:'forced-failure' }`. **Hardcoded 529.** | Two-key defense: requires `AI_TEST_MODE=true` as well, so a lone prod flip is a no-op. |
| `AI_TEST_MODE` | 575+, 766+ | Returns deterministic recorded fixtures (with a per-resume hash-derived score offset). | Single key. |

Verified by `_shared/anthropic.test.ts` :: `AI_FORCE_FAILURE without AI_TEST_MODE does NOT short-circuit`, `AI_FORCE_FAILURE + AI_TEST_MODE short-circuits with 529 forced-failure`, `TEST-05 AI_FORCE_FAILURE two-key safety: INERT without AI_TEST_MODE, fires { ok:false, status:529 ...`.

**What this means, precisely:**

| D-11 fault | Live-injectable today? | How |
|---|---|---|
| Provider timeout | **YES** | `MERIT_TEST_FORCE_REFUNDABLE_ERROR=408` (staging only) |
| Provider rate limiting | **YES** | `MERIT_TEST_FORCE_REFUNDABLE_ERROR=429` (staging only) |
| Invalid model JSON | **NO** | Both existing seams return `{ ok:false }`. Neither can return `{ ok:true, text:'<garbage>' }`. |
| Truncated model output | **NO** | Same — no seam produces a malformed *success* body. |

**Two viable paths; the planner must pick one explicitly:**

- **(A) Deterministic-only (cheaper, sufficient for the matrix).** Invalid-JSON and truncation are *already* proven deterministically at the validation boundary by `runtime-validation-convergence.test.ts` (`MODEL_INVALID_RESPONSE`, `MODEL_OUTPUT_TRUNCATED`) — direct calls to `validateModelOutput`, no seam needed. Map those as the covering tests; close the RCL/Onboarding gaps by copying the pattern. **No source change to `anthropic.ts`.**
- **(B) Extend the seam** with a fault-mode selector so the fault is reachable end-to-end through a real deployed function. If chosen, follow the existing conventions *exactly*: staging-host gate + two-key defense + a characterization test in `anthropic.test.ts`. Sketch:
  ```ts
  // e.g. AI_FORCE_BAD_BODY = 'invalid_json' | 'truncated'   (staging-gated, AI_TEST_MODE-paired)
  // returns { ok: true, text: '<garbage>' | '<clipped-json>' } so the VALIDATION layer, not the
  // transport layer, is what rejects it — which is the behavior under test.
  ```
  **Recommendation: (A) for the matrix, (B) only if the planner wants a live end-to-end fault path in the staging soak.** (A) satisfies VER-02 as written. Note that (B) touches a production code path (`anthropic.ts`) in a verification phase, which is exactly the kind of change the milestone's guardrails discourage; if taken, it must be a strictly additive, staging-gated, inert-in-prod branch.

**Two-tab (S-20):** genuinely straightforward in Playwright:
```ts
const ctxA = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
const ctxB = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
// submit in A; in B assert useAnalysisRun recovers the SAME run_id via get-analysis-run-status
// and that merit_transactions shows exactly ONE debit for that idempotency key.
```
`e2e/auth.setup.ts` + `e2e/global-setup.ts` already establish the storage-state pattern. The backend invariant this proves is already unit-tested (`the dup-guard holds the original run_id when startRun fires again mid-flight (no re-charge)`); the E2E adds the cross-context proof.

---

## Production Activation Mechanics (D-01..D-04)

### The six flags

| Flag | Surface | Consumer | Default |
|---|---|---|---|
| `ANALYSIS_LIFECYCLE_ENABLED` | Supabase **edge secret** | `_shared/analysis-flags.ts:69,93` (master) | OFF |
| `ANALYSIS_LIFECYCLE_RECRUITING_LENS` | Supabase edge secret | `analysis-flags.ts:75` | OFF |
| `ANALYSIS_LIFECYCLE_LINKEDIN` | Supabase edge secret | `analysis-flags.ts:74` | OFF |
| `ANALYSIS_LIFECYCLE_ONBOARDING` | Supabase edge secret | `analysis-flags.ts:76` | OFF |
| `ANALYSIS_LIFECYCLE_RESUME` | Supabase edge secret | `analysis-flags.ts:73` | OFF |
| `ANALYSIS_LIFECYCLE_CAREER_COMPASS` | Supabase edge secret | `analysis-flags.ts:77` | OFF |
| `VITE_FEATURE_ANALYSIS_LIFECYCLE` | **Vercel build var** | `src/config/feature-flags.ts:42-43` (`isAnalysisLifecycleEnabled()`) | OFF |

**Semantics (`analysis-flags.ts:20-24, 55-60`):** fail-closed, **exact lowercase `'true'` only**. `'True'`, `'TRUE'`, `'1'`, `'yes'`, `'on'` are all **OFF**. Deliberately stricter than `merit-gateway`'s `.toLowerCase()==='true'`. A typo cannot wake the substrate.

**Read timing (critical, and hard-won):** `isAnalysisFeatureEnabled()` reads env at **REQUEST time**, not module load (`analysis-flags.ts:26-37`). This was the fix for the career-compass 95% hang: a module-load snapshot froze warm isolates at a stale `false`, so `submit-career-analysis-job` and `analyze-career` (independent isolates) disagreed on the same flag and split one submit into a keyless legacy row + a keyed lifecycle row. **Planning implication:** the flip takes effect on the next request — but the *frontend* flag (`VITE_FEATURE_ANALYSIS_LIFECYCLE`) is a **build-time** Vite var, so flipping it requires a **Vercel redeploy**, not just an env change. The edge flags and the frontend flag flip on different clocks. Sequence accordingly.

### 🚩 `docs/ENVIRONMENT.md` does not document ANY of these

`grep -ci "lifecycle" docs/ENVIRONMENT.md` → **0**. CONTEXT.md cites `docs/ENVIRONMENT.md` as "the authoritative per-name matrix (names, not values) for every flag the activation touches" — but all seven flags above are **absent** from it. The file documents `MERIT_SYSTEM_ENABLED` (L81), `AI_TEST_MODE` (L113), `AI_FORCE_FAILURE` (L114), `MERIT_TEST_FORCE_REFUNDABLE_ERROR` (L115), `DENO_TEST_SUPABASE_REMOTE` (L121), and `VITE_FEATURE_INTERVIEW_PREP` (L68) — but nothing lifecycle. **This is a concrete, cheap, must-do task for Phase 9.**

### The DB surface (name corrections)

| CONTEXT.md says | Reality |
|---|---|
| "the `analysis_runs` table" | **`public.analysis_jobs`** — Phase 3 added `state`, `merit_settled`, `refunded`, `merit_transaction_id` columns to the existing table (`supabase/migrations/20260702000001_analysis_lifecycle_ledger.sql:76-113`). There is no `analysis_runs` table. The *endpoint* is named `get-analysis-run-status`; the *table* is `analysis_jobs`. |
| "the merit ledger" | **`public.merit_transactions`** (`amount`, `balance_type` ∈ `subscription\|shop\|grant\|refund`, `source`, `feature`, `metadata`, `created_at`) + the `public.user_merits` balance row (`supabase/migrations/20260414000000_merit_ledger_foundation.sql:14,32`) |

**The 11 lifecycle states** (`analysis_jobs_state_check`): `created`, `validating_inputs`, `reserving_merits`, `extracting_data`, `generating`, `validating_output`, `saving`, `completed`, `retryable_failed`, `failed`, `refunded`.
**Terminal:** `completed`, `failed`, `refunded` (`reap-stale-analysis-runs/index.ts:89`).
**Financial invariant (DB-enforced):** `CHECK (NOT (merit_settled AND refunded))` — constraint `analysis_jobs_settle_refund_excl`. **A double-charge is structurally impossible at the row level**; the D-04 abort criterion (a) is therefore mostly about *cross-row* anomalies (two rows for one submit — the 95%-hang signature) rather than an in-row violation.

### The reaper window (D-04 criterion (b): "stuck non-terminal past the reaper window")

`REAP_CONFIG` (`supabase/functions/reap-stale-analysis-runs/index.ts:72-81`) — per-state max age, and the target it terminalizes to:

| State | maxAge | → target |
|---|---|---|
| `created` | 60s | `failed` |
| `validating_inputs` | 60s | `failed` |
| `reserving_merits` | 120s | `failed` |
| `extracting_data` | 300s | `retryable_failed` |
| `generating` | 300s | `retryable_failed` |
| `validating_output` | 120s | `failed` |
| `saving` | 120s | `failed` |
| `retryable_failed` | 600s | `failed` |

Cron cadence: **every 15 minutes** (`*/15 * * * *`, `supabase/migrations/20260702000003_reap_stale_analysis_runs_cron.sql:47`).

**Therefore the true worst-case reaper window = maxAge + 15 min.** For `generating` that's **300s + 15min ≈ 20 minutes**. D-04's "stuck past the reaper window" should be operationalized as: *any `analysis_jobs` row still in a non-terminal state ~20+ minutes after `state_updated_at`* (≈ 25 min for the `retryable_failed` → `failed` sweep). **This directly sets the floor on the soak duration.**

⚠️ **The cron endpoint may point at the wrong project.** `20260702000003_...cron.sql:50` schedules `net.http_post` to `https://cimjltzovkahkqecpwgi.supabase.co/...` (**preview**), while the header comment (L20) references the prod URL `zjpjapgraoxdukdvpjes`. Project memory independently records "prod cron points at preview host." **The planner must verify, before flipping any prod flag, that the prod reaper actually runs against prod** — otherwise D-04's reaper-window abort criterion has no enforcement on production and stuck runs will never be reaped there. This is a **precondition**, not a nice-to-have.

Also required for the reaper: `INTERNAL_JOB_SECRET` (edge, `Deno.env`) and the Vault `internal_job_secret` (pg_cron) must be **byte-identical**, and the function needs `type:'internal'` auth + `verify_jwt=false` in `config.toml` + `deploy.ps1`. Project memory records this exact class of failure (keep-warm 401'd on user-auth; reaper 401'd at gateway). Verify before relying on the reaper as a safety net.

### Recommended soak + numeric "green" (derived from the Phase 6 precedent)

`.planning/phases/06-*/06-03-LIVE-SMOKE-RESULTS.md` is the template to copy: it is an operator-runnable, step-numbered, curl+SQL artifact where the operator records outcomes **inline** and types "approved" before the phase closes. Claude prepared inputs; Claude did not flip flags or run smokes. `06-VALIDATION.md:95` records the flag-flip soak as an explicit `autonomous: false` manual-only verification: *"Flip `ANALYSIS_LIFECYCLE_CAREER_COMPASS` on preview first, run a real Career analysis, confirm exactly-once deduction + settle-after-save; force a failure, confirm refund-exactly-once."*

**Derived proposal (planner to confirm):**

- **Soak per flag flip: ≥ 30 minutes** — one full reaper worst-case window (~20 min) plus margin, so that "no run stuck past the reaper window" is actually *observable* within the soak rather than asserted.
- **Green definition, numeric, per flip:**
  1. `analysis_jobs`: **100%** of rows created after the flip reach a terminal state (`completed`/`failed`/`refunded`) within the reaper window. Zero non-terminal rows older than 20 min.
  2. `merit_transactions`: for each `run_id`, **exactly one** debit; on any non-`completed` terminal state, **exactly one** matching refund. Zero rows with `merit_settled AND refunded` (DB-enforced, but assert it).
  3. **Zero rows** where one submit produced two `analysis_jobs` rows (the 95%-hang signature — one keyed, one keyless).
  4. Edge logs: **zero occurrences of any error class absent from the pre-flip baseline.** The "error class" vocabulary IS the 13-code taxonomy (`_shared/analysis-error-taxonomy.ts`): `INPUT_MISSING`, `FILE_NOT_FOUND`, `FILE_EXTRACTION_FAILED`, `PROFILE_PARSE_FAILED`, `MERIT_RESERVATION_FAILED`, `MODEL_TIMEOUT`, `MODEL_RATE_LIMITED`, `MODEL_INVALID_RESPONSE`, `MODEL_OUTPUT_TRUNCATED`, `SCHEMA_VALIDATION_FAILED`, `DATABASE_SAVE_FAILED`, `MERIT_SETTLEMENT_FAILED`, `UNKNOWN_ANALYSIS_ERROR` — plus raw HTTP status classes. Any `UNKNOWN_ANALYSIS_ERROR` is by definition a new class and should trip the abort.
  5. Latency: p95 within the pre-flip baseline band (capture the band BEFORE the first flip).
- **Pre-flip baseline capture (do this ONCE, before the master flag goes on):** for a defined window (suggest 24h, or the largest window prod logs retain), record per-function counts by HTTP status class and by taxonomy code from the Supabase edge logs, plus p50/p95 latency. **Without this, D-04 criterion (c) — "any new error class not present in the pre-flip baseline" — is unevaluable.** This is a hard prerequisite for the first flip, not a parallel task.

### Rollback

Master-off (`ANALYSIS_LIFECYCLE_ENABLED` unset or ≠ `'true'`) instantly restores every legacy path, because `isAnalysisFeatureEnabled()` reads at request time and the flag-OFF path is byte-identical to the pre-lifecycle implementation. `_shared/analysis-lifecycle.dormancy.test.ts` is the static-source guard that keeps this true — **activation must not break it** (it asserts the module-load `ANALYSIS_LIFECYCLE_ENABLED` const default-derives to `false` when unset; it does NOT assert prod's actual secret value, so setting the secret in prod does not turn this test red). Byte-identical legacy fall-through is separately guarded per feature by `{analyze-resume,analyze-career,recruiting-lens}/__tests__/byte-preserve.test.ts`.

**`MERIT_SYSTEM_ENABLED` (D-03):** `docs/ENVIRONMENT.md:81` — *"unset on both stores (2026-06-23); Merit kill-switch; currently OFF everywhere."* It is a module-load snapshot in `merit-gateway.ts` (unlike the lifecycle flags' request-time reads), so flipping it requires an isolate restart to take effect — and it activates submit-time merit deduction across 10+ AI functions at once. Staging only. Enabling it also requires the four `STRIPE_PRICE_MERIT_*` IDs (`docs/ENVIRONMENT.md:92-95`).

---

## Evidence, PII Guard, and Report Source Material (D-13..D-17)

### D-14 evidence schema — corrected queries

```sql
-- Per run: terminal state + financial invariant  (table is analysis_jobs, NOT analysis_runs)
select id as run_id, user_id, state, merit_settled, refunded,
       merit_transaction_id, idempotency_key, created_at, state_updated_at
from public.analysis_jobs
where id = :run_id;

-- Merit-ledger delta: MUST be exactly one debit; exactly one refund iff non-completed terminal
select id, amount, balance_type, source, feature, metadata, created_at
from public.merit_transactions
where user_id = :user_id and created_at >= :run_started
order by created_at;
```

### D-15 PII guard — the pattern is already in the repo

`src/test/security/security-audit-docs.test.ts` is the direct model (Phase 2, SEC-11/12/14). Its shape:
- vitest, auto-discovered by `src/**/*.test.ts` — **no registration step**, cannot be dropped from the gate.
- `node:fs` reads relative to `process.cwd()` (it explicitly cites `src/pages/__tests__/pricing-token-guard.test.ts` as *its* precedent).
- A `SECRET_PATTERNS: Array<{ label: string; re: RegExp }>` table (L74-84) with labeled regexes: `sk_live_`, `sk_test_`, `pk_live_`, `service_role[^a-zA-Z0-9]{0,40}eyJ`, `eyJ[A-Za-z0-9_-]{30,}`, `price_`, `whsec_`, PEM private key, `postgres(ql)?://`.
- An **allowlist of project IDENTIFIERS** (prod + preview refs) that are not secrets and are stripped before scanning (L86-87). The D-15 guard needs the same escape valve — the phase artifacts will legitimately contain the *test accounts'* run ids and the project refs.

**Recommended:** `src/test/security/phase9-pii-guard.test.ts`, scanning `.planning/phases/09-*/**` + `scripts/test-resumes/**`, with patterns for: email addresses (`[\w.+-]+@[\w-]+\.[\w.]+`), production user UUIDs, and real-person name markers — with an allowlist for the two synthetic test-account emails and the synthetic fixture content. `src/test/security/xss-sink-guard.test.ts` is a second existing example of the same family.

**Fixture reality check (D-15):** `scripts/test-resumes/` contains exactly **`short.txt`, `medium.txt`, `long.txt`, `Profile.pdf`**. Four fixtures. The guard must cover all four, and the planner should confirm `Profile.pdf` is genuinely synthetic (it's the only binary, and it's the LinkedIn-profile input — the highest PII risk in the repo). **If `Profile.pdf` contains a real profile, that is a finding, not a fixture.**

### D-16 roadmap drift — verified, and there is MORE than CONTEXT.md flagged

| Drift | Verified | Location |
|---|---|---|
| Phase 1 unchecked in phase list, but 8/8 Complete (2026-07-01) in progress table | ✅ confirmed | `ROADMAP.md:28` vs `:327` |
| Phase 8 unchecked in phase list, but 5/5 Complete (2026-07-09) in progress table | ✅ confirmed | `ROADMAP.md:35` vs `:334` |
| Phase 9 unchecked (correct — not started) | ✅ correct, no action | `ROADMAP.md:36` |
| All five 08.2 plan checkboxes unchecked, but all five `08.2-0X-SUMMARY.md` exist | ✅ confirmed | `ROADMAP.md:281-285` vs `.planning/phases/08.2-*/` |
| **NEW — not in CONTEXT.md: `REQUIREMENTS.md` PADL-01/02/03 are `- [ ]` unchecked AND "Pending" in the traceability table, while Phase 8 is 5/5 Complete** | ✅ confirmed | `REQUIREMENTS.md` (PADL block) + traceability table |
| **NEW — not in CONTEXT.md: `VER-01/02/04/05` will need flipping to Complete at phase close** | — | `REQUIREMENTS.md` traceability table |
| **NEW: Phase 4 progress row reads `7/6` plans complete** (7 of 6) | ✅ confirmed | `ROADMAP.md:330` |

**The PADL finding is material:** the milestone report cannot claim "41/41 requirements satisfied" while REQUIREMENTS.md itself shows three PADL requirements Pending. Reconciling REQUIREMENTS.md is as much a part of D-16 as reconciling ROADMAP.md — CONTEXT.md only named the latter.

### The 08.2 verification-artifact gap — confirmed

`.planning/phases/08.2-update-career-compass-so-the-feature-structure-is-clearly-di/` contains:
`08.2-CONTEXT.md`, `08.2-RESEARCH.md`, `08.2-DISCUSSION-LOG.md`, `08.2-0{1..5}-PLAN.md`, `08.2-0{1..5}-SUMMARY.md`, `deferred-items.md`.

**Absent: `08.2-VERIFICATION.md`, `08.2-VALIDATION.md`, `08.2-SECURITY.md`, `08.2-UAT.md`.**

Compare its siblings: 08.1 has `08.1-VERIFICATION.md`; 08.3 has `08.3-VERIFICATION.md`, `08.3-UAT.md`, `08.3-SECURITY.md`, `08.3-VALIDATION.md`. 08.2 is the only inserted phase with no verification artifact of any kind.

**Recommendation: backfill a `08.2-VERIFICATION.md` rather than record an exception.** The material to do so cheaply already exists — the five SUMMARY files, plus the tests 08.2 touched (`_shared/career-shape.test.ts`, tier-validation fixtures, `src/pages/CareerCompass.*`), plus the fact that 08.2's changes are inside the current green `verify:baseline`. A backfilled verification citing "these assertions are green in the extended gate as of <date>" is honest, cheap, and stronger than an exception note. An exception in a document whose entire thesis is "every claim is evidence-backed" (VER-05/D-17) is a bad look and invites the reader to discount the rest.

### Report source material (D-17) — inventory confirmed present

All of these exist and were verified: `01-VERIFICATION.md`; `02-VERIFICATION.md` + `02-SECURITY.md` + `SECURITY-AUDIT.md` + `SECURITY-RECORD.md`; `03-VERIFICATION.md`; `04-VERIFICATION.md`; `05-VERIFICATION.md` + `05-VALIDATION.md`; `06-VERIFICATION.md` + `06-VALIDATION.md` + `06-03-LIVE-SMOKE-RESULTS.md` + `06-HANDOFF-live-smoke-blockers.md`; `07-VERIFICATION.md` + `07-VALIDATION.md`; `08-VERIFICATION.md` + `08-PADDLE-PREVIEW-MIGRATION-EVIDENCE.md`; `08.1-VERIFICATION.md`; `08.3-{VERIFICATION,UAT,SECURITY,VALIDATION}.md`.

**Mapping the 14 mandated items to their primary source** (planner should confirm each has a live artifact before writing the report):

| # | Item | Primary source |
|---|---|---|
| 1 | Root causes | Phase 1 (CORS/origin), Phase 6 `06-01-LIVE-PATH-FINDING.md` (95% hang) |
| 2 | Shared reliability improvements | Phase 3 `03-VERIFICATION.md` (lifecycle substrate) |
| 3 | Security findings + status | Phase 2 `SECURITY-AUDIT.md` + `SECURITY-RECORD.md`; **+ fresh D-07 promptfoo run** |
| 4 | Cross-origin audit results | Phase 1 `01-VERIFICATION.md`; `_shared/cors-audit.test.ts`; **+ fresh apex/www re-proof (D-08)** |
| 5 | Feature changes + verification | Phases 4/5/6 + 08.1/08.2/08.3 VERIFICATION files |
| 6 | Dashboard implementation + entitlement | Phase 7 `07-VERIFICATION.md` + `07-VALIDATION.md` |
| 7 | DB/infra migrations | `supabase/migrations/2026070200000{1,2,3,4}_*.sql` + Phase 3 |
| 8 | Paddle gate evidence + removal status | Phase 8 `08-VERIFICATION.md` + `08-PADDLE-PREVIEW-MIGRATION-EVIDENCE.md`; `_shared/no-paddle-live-surface.test.ts` |
| 9 | Tests added/updated | Extended-gate counts + the D-12 registry (**the registry IS this item's evidence**) |
| 10 | Repeated-run + concurrency results | `idempotency-repeated-run.test.ts` ×N + **the new S-01c / S-20 tests** |
| 11 | Merit charge/release/refund/idempotency | `merit-*.test.ts` family + refund-boundary + **live merit_transactions deltas from the soak (D-14)** |
| 12 | Real-account results | **Fresh — VER-04 / D-13 (this is the activation soak)** |
| 13 | Build/deploy/baseline results | **Fresh — extended `verify:baseline` output + `deploy.ps1 -Env staging` and `-Env production` logs** |
| 14 | Remaining risks + follow-ups | `deferred-items.md` per phase; `.planning/*/RESIDUAL-REGISTER*`; the CONTEXT.md deferred list; `05-SUSPECTED-BEHAVIOR.md` (SB-05-01..05) |

Items 3, 4, 12, 13 (and part of 9, 10, 11) require **fresh runs** — they cannot be assembled from existing artifacts alone. That is the phase's irreducible manual/operator work.

---

## Validation Architecture

### Observable signals for this phase

| Signal | Where observed | Proves |
|---|---|---|
| Exit code of extended `npm run verify:baseline` | Local + CI + `deploy.ps1` precondition | VER-01 (the gate is extended AND green) |
| `deno task test:remote` exit code + preflight message | The new remote lane | VER-01 database-test requirement; D-06 fail-loud |
| D-12 registry test result (`ver02-matrix.test.ts`) | vitest lane of the gate | VER-02 (every cell mapped-or-waived, no drift) |
| `analysis_jobs.state` terminal distribution post-flip | Supabase SQL (prod) | D-01/D-02/D-04 (a),(b) |
| `merit_transactions` per-`run_id` delta | Supabase SQL (prod) | VER-04, D-14, report item 11 |
| Edge-log error-class histogram vs pre-flip baseline | Supabase edge logs | D-04 (c); report item 3 |
| p50/p95 latency vs pre-flip band | Supabase edge logs / Vercel Speed Insights | D-04 (d) |
| PII guard test result | vitest lane | VER-04's "no real user data exposed"; D-15 |
| promptfoo `test:adversarial:*` pass/fail | One-shot operator run (OFF gate) | Report item 3 (AI prompt exposure); D-07 |
| apex + www curl matrix (ACAO + `Vary: Origin`, incl. on 401) | Operator curl, per `06-03-LIVE-SMOKE-RESULTS.md` | Report item 4; D-08 |
| ROADMAP/REQUIREMENTS checkbox state | `git diff` on the two files | D-16 |

### How each VER-* criterion is proven

**VER-01 — extended blocking gate.**
*Automated.* `verify:baseline` = `lint && type-check && test && test:edge && test:edge:remote && test:e2e && build`, exit 0. Proven twice: (a) locally/CI, (b) as the HARD precondition inside `scripts/deploy.ps1 -Env staging` and `-Env production` — a real deploy that reaches `supabase link` IS the proof the gate passed. Additional source-asserted invariants to re-verify after the edit: `verify:baseline` still contains **no** `promptfoo`/`test:adversarial` reference (D-07 / `TESTING-STRATEGY.md:212`), and the remote lane has **no** silent-skip path (assert `test:edge:remote` sets `DENO_TEST_SUPABASE_REMOTE=1` and that the preflight throws when it isn't `1`).
*Nyquist sampling:* run the full gate after every plan wave; the deploy gate re-samples it at deploy time.

**VER-02 — 23-scenario × 5-feature coverage.**
*Automated, machine-enforced.* The D-12 registry test is the single observable: green ⇒ every one of the (23→25) × 5 cells is either mapped to a test whose **name exists verbatim in its file** or carries an explicit waiver with a reason + approver. Red ⇒ a cell is unmapped, a file is missing, or a test was renamed. The registry is in the vitest lane, so it rides `verify:baseline` automatically and cannot be dropped from an allowlist.
*The registry's FIRST red run is the authoritative gap list* — build it before writing any gap tests.

**VER-04 — real-account Free + Elite on production.**
*Manual-only, operator-gated (`autonomous: false`).* Cannot be automated: it requires real production accounts, real Merit ledger state, and real billing tiers. Follows the Phase 6 precedent exactly (`06-03-LIVE-SMOKE-RESULTS.md`): Claude prepares the step-numbered curl + SQL inputs; the **operator** flips flags, runs the analyses, and records outcomes inline; Claude never flips a prod flag.
*Reproducible manual record* (satisfies D-17's "reproducible manual verification record"): per feature × per tier × per input-state (resume-only, resume+LinkedIn) →
  - `analysis_jobs.id` (the `run_id`) + terminal `state` + `merit_settled`/`refunded`,
  - the `merit_transactions` rows for that run (exactly-one-debit; refund iff failed),
  - a PII-redacted screenshot,
  - the pre/post edge-log error-class diff for the soak window.
*Standing constraint:* per project memory, operator checkpoints marked `autonomous: false` must **PAUSE for a human** even though auto-mode is on. **Never auto-approve a production flag flip.**

**VER-05 — 14-item evidence report.**
*Automated where possible, structured where not.* Recommend a guard test (`src/test/coverage/ver05-report.test.ts`, same `security-audit-docs.test.ts` idiom) asserting the report file exists and contains all 14 individually-addressable item anchors — the same trick `security-audit-docs.test.ts` uses on `SECURITY-AUDIT.md` (`it('has exactly 10 SEC-0x disposition rows')`). That converts "all 14 items are addressed" from a prose claim into a gate-enforced one, which is exactly the D-17 spirit.
*Plus:* a `git diff`-verifiable reconciliation of `ROADMAP.md` **and** `REQUIREMENTS.md` (D-16, incl. the PADL-01/02/03 drift found above).

### Validation gaps / risks to flag in VALIDATION.md

- **The remote lane makes every deploy depend on preview being unpaused.** If preview pauses again (it was paused for all of v4.0), `deploy.ps1` blocks. That is the *intended* fail-loud behavior — but the operator must know the escape hatch (`-SkipRemoteDbLane`) exists and is emergency-only, and must know the real fix is to unpause preview.
- **The prod reaper may be pointing at preview.** Until verified, D-04 criterion (b) is unenforceable on production. **Precondition to the first prod flip.**
- **The pre-flip edge-log baseline is a one-shot, non-reproducible capture.** If it isn't taken before the master flag goes on, D-04 criterion (c) is permanently unevaluable for this milestone. Sequence it first.
- **`VITE_FEATURE_ANALYSIS_LIFECYCLE` is build-time.** A Vercel redeploy is required; it does not flip with the edge secrets. Frontend and backend flags flip on different clocks — a window exists where they disagree.

---

## Common Pitfalls

### Pitfall 1: Querying `analysis_runs`
**What goes wrong:** Every evidence query fails; the planner writes tasks against a table that doesn't exist.
**Why:** The endpoint is `get-analysis-run-status` and CONTEXT.md says "the `analysis_runs` table," but the table is `public.analysis_jobs` (Phase 3 added lifecycle columns to it).
**Avoid:** Use `analysis_jobs`. The `run_id` is `analysis_jobs.id`.

### Pitfall 2: Treating Onboarding as a separate function
**What goes wrong:** The planner writes an `onboarding/` test directory that has nowhere to live, or double-counts Resume coverage.
**Why:** Onboarding is `analyze-resume` with `origin:'onboarding'` (`analyze-resume/index.ts:1165-1177`).
**Avoid:** Onboarding cells = Resume cells + an `origin`-dispatch assertion + the `Onboarding.tsx` wiring test. The existing `FEAT-01 (1d)` test in `analyze-resume/__tests__/idempotency-repeated-run.test.ts` is the template.

### Pitfall 3: Assuming the Anthropic seam can already inject invalid/truncated JSON
**What goes wrong:** A plan task says "inject invalid model JSON via the seam" and the executor discovers no such branch exists, then either invents an ungated one (a prod risk) or silently downgrades the test.
**Why:** Both existing seams return `{ ok:false, status }`. Neither returns a malformed *success* body. See the D-11 correction section.
**Avoid:** Choose path (A) or (B) explicitly in the plan. (A) — map the existing `runtime-validation-convergence.test.ts` deterministic tests — requires no source change and satisfies VER-02.

### Pitfall 4: Non-ASCII characters in `scripts/deploy.ps1`
**What goes wrong:** Windows PowerShell 5.1 reads the file as cp1252; an em-dash or box-drawing character produces a "missing terminator" parse error and the deploy script won't run at all.
**Why:** The `.ps1` files are BOM-less. This broke and was fixed in Phase 05-07 (`cf654246`).
**Avoid:** Pure ASCII only. Verify: `grep -c $'\xe2' scripts/deploy.ps1` → `0`.

### Pitfall 5: A silently-skipping remote lane
**What goes wrong:** `verify:baseline` goes green while the DB lane ran zero assertions — a false-green gate, which is strictly worse than no gate.
**Why:** Every existing remote-gated test uses `GATED()`/`skipRemote()` **skip-without-failing** semantics at `REMOTE=0`. Naively adding those files to the gate at `REMOTE=0` adds zero coverage and looks green.
**Avoid:** The preflight test must throw when `DENO_TEST_SUPABASE_REMOTE !== '1'`. Assert non-zero executed-test count in the remote lane. D-06 names this failure mode explicitly.

### Pitfall 6: Duplicate `history-persistence.test.ts` files
**What goes wrong:** The registry maps one copy; the other drifts silently. Two divergent copies of the History contract.
**Why:** Both `{feature}/history-persistence.test.ts` AND `{feature}/__tests__/history-persistence.test.ts` exist for analyze-resume, analyze-career, grade-linkedin, recruiting-lens, interview-prep-analyze. Only the `__tests__/` copies import the remote helper.
**Avoid:** Determine which is live, delete or register the other, before mapping S-22.

### Pitfall 7: Flipping `MERIT_SYSTEM_ENABLED` on production
**What goes wrong:** Platform-wide behavior change across 10+ AI functions. This exact mistake was made in Phase 6 (07-07) and had to be reverted.
**Why:** It is a GLOBAL gate, snapshotted at module load in `merit-gateway.ts`.
**Avoid:** D-03 — staging only. Production stays `false`. The dormant posture is `MERIT_SYSTEM_ENABLED=false` AND `ANALYSIS_LIFECYCLE_*` OFF; Phase 9 changes only the second half of that on prod.

### Pitfall 8: Case-variant flag values
**What goes wrong:** Operator sets `ANALYSIS_LIFECYCLE_ENABLED=True` or `=1`; nothing activates; the soak "passes" while measuring the legacy path.
**Why:** `analysis-flags.ts:59` — exact lowercase `'true'` ONLY. No case-folding, by design.
**Avoid:** After each flip, **positively confirm the lifecycle is actually running** (a new `analysis_jobs` row with a non-null `state` and an `idempotency_key`) before starting the soak clock. A soak that measures the legacy path is worse than no soak — it produces false confidence.

---

## Open Questions

1. **Is the production reaper cron pointing at preview?**
   - Known: `20260702000003_reap_stale_analysis_runs_cron.sql:50` posts to `cimjltzovkahkqecpwgi` (preview) while its own header comment cites the prod URL. Project memory independently records "prod cron points at preview host."
   - Unclear: what the prod DB's `cron.job` table actually contains right now.
   - **Recommendation: verify read-only via the prod Supabase MCP (`select * from cron.job`) as a HARD PRECONDITION to the first prod flip.** If it points at preview, fix it first — otherwise D-04's reaper-window abort criterion has no teeth on prod.

2. **What does "large PDF" mean (S-07)?**
   - Known: per-tier *character* caps exist (`getMaxInputChars`). No byte/file-size limit found anywhere in `src/lib`, `src/pages/Upload.tsx`, or `_shared/document-extraction.ts`.
   - Unclear: whether VER-02's "large PDF" means the char cap (covered) or a file-size guard (absent — possibly a genuine *product* gap, not just a test gap).
   - **Recommendation: planner decides and records the decision in the registry.** If there is genuinely no upload size limit, that is a finding worth surfacing in report item 14 (remaining risks), not just a test to write.

3. **Is `scripts/test-resumes/Profile.pdf` genuinely synthetic?**
   - It is the only binary fixture and the highest-PII-risk artifact in the repo (a LinkedIn profile).
   - **Recommendation: the D-15 guard must inspect it, and the planner should treat "is this a real person's profile?" as a question to answer, not assume.**

4. **Does the extended gate's wall-clock stay tolerable?**
   - Adding lint + type-check + build + a network round-trip to preview, on top of vitest + ~110 Deno files + Playwright, on **every** `deploy.ps1` run.
   - **Recommendation: measure once early. If it exceeds ~10 min, do NOT drop a lane — document the deploy latency and accept it. The failure mode of a slow gate is operators reaching for `-SkipVerify`, so the mitigation is social (document it) rather than technical (weaken it).**

5. **Does `regression-gate.yml` also get the remote lane?**
   - It currently hardcodes `DENO_TEST_SUPABASE_REMOTE: '0'` (line 53). D-06 speaks about `verify:baseline`, and CI runs `verify:baseline` — so folding the remote lane in changes CI too, and every PR then depends on preview being up.
   - **Recommendation: yes, keep local and CI identical** (that is the explicit `TESTING-STRATEGY.md` principle: "both intentionally the *same* command so local and CI agree"). But the planner must add the `SUPABASE_URL_STAGING` / `SUPABASE_SERVICE_ROLE_KEY_STAGING` GitHub Actions secrets and confirm they exist before merging the change, or every PR goes red.

---

## Sources

### Primary (HIGH confidence — read directly from this repo, 2026-07-10)
- `supabase/functions/_shared/analysis-flags.ts` — two-level gate, exact-lowercase-`'true'`, request-time reads
- `supabase/functions/_shared/analysis-error-taxonomy.ts` — the 13 failure codes
- `supabase/functions/_shared/anthropic.ts:541-575, 744-770` — the three fault-injection seams
- `supabase/functions/_shared/__tests__/history-persistence-remote.ts:5-22` — the fail-loud `skipRemote()` contract
- `supabase/functions/_shared/no-paddle-live-surface.test.ts` — the static-source-guard idiom
- `supabase/functions/deno.json` — the `test:ci` explicit allowlist
- `supabase/functions/reap-stale-analysis-runs/index.ts:72-92` — `REAP_CONFIG`, terminal states, batch limit
- `supabase/migrations/20260702000001_analysis_lifecycle_ledger.sql` — `analysis_jobs` 11-state CHECK + `NOT (merit_settled AND refunded)`
- `supabase/migrations/20260702000003_reap_stale_analysis_runs_cron.sql:47,50` — `*/15 * * * *`, preview URL
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql:14,32` — `user_merits`, `merit_transactions`
- `src/hooks/__tests__/useAnalysisRun.test.ts` — 8 describes / ~16 tests: dup-guard, refresh recovery, preserve-previous, terminal-stop
- `src/pages/__tests__/CareerCompass.recovery.test.tsx` — the per-feature wiring-test template
- `src/test/security/security-audit-docs.test.ts` — the D-15 PII-guard model
- `src/config/feature-flags.ts:42-43` — `isAnalysisLifecycleEnabled()` / `VITE_FEATURE_ANALYSIS_LIFECYCLE`
- `package.json` §scripts · `TESTING-STRATEGY.md` · `docs/ENVIRONMENT.md` · `.planning/ROADMAP.md` · `.planning/REQUIREMENTS.md`
- `.planning/phases/06-*/06-03-LIVE-SMOKE-RESULTS.md`, `06-VALIDATION.md` — the operator-gated soak precedent
- Test-name evidence throughout the VER-02 grid — each cited name was grep-extracted verbatim from its file

### Secondary (MEDIUM confidence)
- Project memory: prod cron → preview host; `MERIT_SYSTEM_ENABLED` global-gate revert; `.ps1` pure-ASCII requirement; honor-operator-checkpoints. Each is corroborated by an in-repo artifact above, which is why the derived claims are treated as HIGH.

### Not consulted
No external/web sources. This phase's domain is entirely internal — a survey of external testing libraries would have been noise. Context7 was not applicable: no new dependency is proposed.

---

## Metadata

**Confidence breakdown:**
- **Coverage audit (VER-02 grid):** HIGH — every ✅ cites a verbatim grep-extracted test name; every ❌ is a grep that returned zero hits across `supabase/functions`, `src`, and `e2e`. The ⚠️ cells are a *judgment call* (shared-substrate coverage counted as partial), and the planner may legitimately decide some ⚠️ cells are fully covered — that decision belongs in the registry, and I have flagged it rather than pre-empted it.
- **Gate mechanics (VER-01):** HIGH — `package.json`, `deno.json`, `TESTING-STRATEGY.md`, and the `skipRemote` helper all read directly.
- **Fault-injection seam (D-11):** HIGH — the three env branches were read line-by-line and cross-checked against `anthropic.test.ts`'s characterization tests.
- **Activation mechanics (D-01..D-04):** HIGH on flag names/semantics/tables/reaper config (all read from source/migrations). **MEDIUM on the prod cron target** — the migration and project memory agree it points at preview, but I did **not** query the prod `cron.job` table to confirm current live state. Flagged as Open Question 1 and as a hard precondition.
- **Soak duration + numeric green:** MEDIUM — *derived* from the reaper config (a hard number: maxAge + 15-min cadence) plus the Phase 6 precedent, not copied from an existing spec. The planner should treat the ≥30-min figure as a well-reasoned proposal, not a fact.
- **Roadmap drift (D-16):** HIGH — every drift claim was diffed against the actual files, and I found one class (PADL-01/02/03 in REQUIREMENTS.md) that CONTEXT.md did not mention.

**Research date:** 2026-07-10
**Valid until:** ~2026-08-09 (30 days). This is an audit of a repo at a point in time; it goes stale the moment a test is renamed or added — which is precisely the argument for building the D-12 registry rather than trusting this document.
</content>
</invoke>
