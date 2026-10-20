# Strivo AI — Testing Strategy & Regression Baseline (v4.0)

**Status:** Active — the layered testing net for the v4.0 Codebase Hardening milestone.
**Owner:** Platform / maintainers.
**Last updated:** 2026-07-30 (Phase 03, Plan 03-17 — five-engine one-click and deliberate-rerun integrity, quarantine reconciliation, and final runtime evidence). Previously 2026-07-28 (Phase 03, Plan 03-03 — XTEST-01/XTEST-02: the 5-project cross-device Playwright matrix, the `@xdev` tag convention, the opt-in `STRIVO_REAL_CHANNELS` real-browser channels, and the measured wall-clock delta — see *Cross-device matrix* below). Previously 2026-07-12 (Phase 09, Plan 09-09 — VER-01: `verify:baseline` extended to the SEVEN-layer chain, the remote DATABASE lane folded in, CI parity, `-SkipRemoteDbLane`, measured wall-clock). Previously 2026-06-19 (Phase 05, Plan 07 — TEST-08: deploy-gate wiring + grown command set + branch-protection). Originally landed 2026-06-09 (Phase 01, Plan 04 — TEST-01).

> This document is the authoritative description of how Strivo AI is tested and how
> "zero functional change" is proven before every merge during the v4.0 Codebase
> Hardening milestone. It **supersedes** the stale `.planning/codebase/TESTING.md`
> (dated 2026-04-11), which falsely claims "no frontend test framework" and "zero
> tests in `src/`". That map is historical — do not consume it. The real layer
> counts are documented below.

---

## Why this exists

v4.0 is a brownfield hardening milestone with one hard constraint: **zero functional
change**. Cleanup, refactors, dependency bumps, and DB removals must not alter any
user-facing or internal behavior. The testing net documented here is the **safety
net that proves** behavior is preserved: every later cleanup/refactor phase re-runs
this suite, and any *new* red is treated as a regression that blocks merge.

The baseline mechanism is **the full suite passing green at a tagged pre-cleanup
commit** (`v4.0-baseline`), not golden-master output snapshots (too brittle vs.
non-deterministic AI text/timestamps). See "The regression baseline" below.

---

## The four test layers

Strivo AI already has substantial test coverage across three runner layers; v4.0
Phase 01 adds the fourth (Playwright E2E). This phase is ~70% *document & reconcile*,
~30% *new infrastructure* — the layers below were not built from scratch.

| Layer | Runner | What it owns | Scope / count | On the per-PR gate? |
| ----- | ------ | ------------ | ------------- | ------------------- |
| **Unit / integration (frontend)** | `vitest` (jsdom) | React components, hooks, pages, contexts; `_shared/__tests__/*` utilities that run under Node | **96 files / 614 tests** at the 09-09 close (was ~81 files in Phase 01) | **Yes** (`npm run test`) |
| **Contract / integration (edge)** | `deno` (`deno task test:ci`) | Edge-function pure logic: auth, CORS, merit-gateway, tier-config, cache fingerprint, JSON repair, Stripe client, prompt variants, refund/idempotency, history shape; the deterministic prompt-injection sanitizer corpus + `anthropic` env-branch characterization (Phase 05) | **offline allowlist** (single source of truth in `supabase/functions/deno.json`) — **grown** from the 34-file Phase-01 set to `698` at the 05-05 close to **`1262 passed \| 0 failed`** at the 09-08 close. NB the allowlist is an explicit **file list**, not a directory walk: an unlisted test runs in **no lane at all** (that rot is how five history suites and 32 further files went dead — see D9-05) | **Yes** (`npm run test:edge`) |
| **Database (edge, remote)** | `deno` (`deno task test:remote`) | Real-DB history persistence for all five migrated features against the **preview** project: a real analysis writes its durable rows + the linked `usage_tracking` row | `8 passed \| 0 failed \| 0 ignored`. **Fails loudly** when unconfigured/unreachable and **refuses to run against production** (it writes rows) | **Yes** (`npm run test:edge:remote`) — added to the gate in 09-09 (D-06) |
| **Browser E2E (critical flows)** | `Playwright` (Chromium — plus, since Phase 03, a 4-project `@xdev` cross-device matrix: firefox / webkit / iPhone 14 / Pixel 7) | The 3 critical browser flows end-to-end against a local `vite preview`: **auth/session persistence**, **resume analysis**, **Stripe checkout (test mode)** — all chromium-only; the `@xdev`-tagged subset additionally runs on the 4 cross-device projects | `e2e/` specs (greenfield in Phase 01; specs land in Plan 03) | **Yes** (`npm run test:e2e`) |
| **Adversarial / prompt-injection** | `promptfoo` | Real-AI prompt-injection resistance for `interview-prep-analyze` **and** (Phase 05) the four high-risk user-text ingesters `analyze-resume` / `analyze-career` / `grade-linkedin` / `recruiting-lens` | `supabase/functions/<fn>/__tests__/fixtures/injection/` (config + `fixtures.yaml`) per feature | **No** — scheduled / label-only (D-09; calls real Anthropic, incurs cost). NB: the **deterministic** sanitizer corpus (the `$0`, on-gate twin) lives in the **deno** layer above (`_shared/prompt-sanitizer.test.ts`) — never conflate the two |

### Layer determinism notes

- **vitest** is deterministic after the Phase 01 TEST-02 fix (the `OutcomeOverdueBanner`
  unguarded async-effect that produced cross-worker unhandled rejections was fixed at
  the source component, plus a reusable `src/test/supabaseMock.ts` query-builder mock
  factory and an unhandled-rejection-surfacing hook in `src/test-setup.ts`). The
  failure set is now identical run-to-run.
- **deno** runs an **explicit offline allowlist**, never `deno test ./` directory
  recursion — recursion would collect live-Supabase tests that hang/fail in CI. The
  live-Supabase suites (`_tests/test-04..06`, the `interview-prep-analyze` integration
  tests, `*/history-persistence.test.ts`) stay behind `DENO_TEST_SUPABASE_REMOTE=1`
  and are **not** on the per-PR gate. The allowlist also covers the 5 deno-only
  `_shared/__tests__/*` files that vitest excludes (they use `https://deno.land`
  imports).
- **Playwright** drives a local production `vite preview` on `http://localhost:8080`
  (D-03), not staging — deterministic, $0, offline/CI-friendly. AI is stubbed at the
  edge-function boundary via the existing `AI_TEST_MODE` seam in
  `supabase/functions/_shared/anthropic.ts` (D-02); the real Supabase test project and
  real Stripe test mode (test card `4242 4242 4242 4242`) exercise the genuine
  auth/persistence/checkout plumbing (D-04). Only Anthropic is stubbed.
- **promptfoo** calls the **real** Anthropic-backed endpoint — that is why it is off
  the per-PR path (see "promptfoo is off the gate" below).

---

## Coverage philosophy (D-05): critical-path REQUIRED, global ADVISORY

Coverage on this large brownfield suite is governed by **critical-path-required,
global-advisory** — chosen over hard numeric thresholds (which would force low-value
tests and could stall cleanup phases) and over pure-advisory (which lets coverage
silently erode during cleanup).

**REQUIRED (must stay covered and green — a regression here blocks merge):**

- The **3 E2E critical flows**: auth/session persistence, resume analysis end-to-end,
  Stripe checkout (test mode).
- **Merit / tier-gating** behavior (deduction, refund-on-failure, idempotency, tier
  caps, prompt-variant routing).
- **Auth** (`requireAuth` / `requireInternalOrUserAuth` contracts on every endpoint).
- **Per-feature analyze contracts** (parse / merge / JSON-repair / routing / persistence
  shape for each active AI feature).

**ADVISORY (tracked and reported, NOT a hard blocker):**

- Global line / branch coverage percentage. It is measured and reported so erosion is
  visible, but a drop does not by itself block a merge. The blocking signal is the
  REQUIRED set staying green, not a global percentage.

---

## The regression baseline (D-01 / TEST-06)

- The regression baseline **IS the full test suite passing green at a tagged
  pre-cleanup commit**, anchored by the git tag **`v4.0-baseline`**.
- Later phases re-run the suite (`npm run verify:baseline`); any *new* red is a
  regression. The tag is the anchor for `git diff v4.0-baseline` behavior comparison
  and for re-running the recorded suite.
- The baseline must be **green before it is tagged** (D-01 / D-07) — tagging a red
  suite poisons every downstream phase's gate. Phase 01 reconciled the pre-existing
  RED before the tag is cut (Plan 05 owns cutting the tag): the `tier-config` and
  `reset-subscription-merits` Pro→Elite drifts were reconciled as **stale tests**
  (see "Tier-config reconciliation record" below), and the `OutcomeOverdueBanner`
  flakiness was fixed at source.
- AI is **stubbed at the boundary** (D-02) so the baseline and E2E never call real
  Claude — the behavior under test is *our* parse/merge/JSON-repair/tier-gating/
  routing/persistence logic, deterministic and $0 to re-run on every phase.

---

## The gate: `verify:baseline` (D-06 / D-08 / D-09)

The single command that proves zero functional change is:

```bash
npm run verify:baseline
```

It chains, fail-fast (`&&`), exactly **seven** layers (extended in Phase 09 · 09-09 to
VER-01's full list — **extended, not replaced**: `scripts/deploy.ps1` knows only this one
command, so a parallel `verify:full` would have left the real deploy gate at its old
strength, which is the failure VER-01 exists to prevent):

```
npm run lint             # 1. eslint                          (seconds, deterministic)
&& npm run type-check    # 2. tsc --noEmit                    (seconds, deterministic)
&& npm run test          # 3. vitest (frontend unit/integration)
&& npm run test:edge     # 4. deno OFFLINE allowlist          (cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci)
&& npm run test:edge:remote  # 5. deno REMOTE DATABASE lane   (cross-env DENO_TEST_SUPABASE_REMOTE=1 deno task test:remote)
&& npm run test:e2e      # 6. Playwright (browser E2E, AI stubbed)
&& npm run build         # 7. production vite build
```

**Ordering rationale** (the fail-fast `&&` idiom is the existing convention): `lint` and
`type-check` first — seconds, fully deterministic, cheapest failure. Then the layers in
ascending cost *and* ascending EXTERNAL dependency, with the remote DB lane **after** the
offline Deno lane so a plain logic regression fails before spending a network round-trip on
preview. `build` last: the slowest pure-local step, whose failure mode (a type/import error)
is almost always already caught by `type-check`.

**Measured wall-clock (09-09 — a real `Measure-Command`, not an estimate):**

```
PS> Measure-Command { npm run verify:baseline }   # exit 0
    TotalSeconds: 393.6      ->  06:33
```

**≈ 6 min 34 s** for the full green chain on the maintainer's Windows host (a second timed run
measured 431 s / 7 min 11 s, so **budget ~6.5–7.5 min**). Lane evidence from that run: lint
0 errors / 159 warnings · type-check clean · vitest **614 passed** (96 files) · deno offline
**1262 passed** · deno remote/DB **8 passed, 0 ignored** · Playwright **7 passed**, 2
quarantined-skip · build ok.

This runs on **every** `deploy.ps1` invocation and every PR, and that cost is **accepted**, not
engineered around. If it ever feels too slow, the sanctioned mitigation is to accept the deploy
latency (deploys are infrequent and operator-gated), **never to drop a lane** — the real failure
mode of a slow gate is operators reaching for `-SkipVerify`, which defeats the whole thing.

**Every gated lane can FAIL — verified by mutation, not by observing green** (09-09). A lane
that cannot go red is not a gate, and this phase caught six checks that reported success while
proving nothing:

| Lane | Mutation | Result |
| ---- | -------- | ------ |
| `lint` | insert a `debugger` statement (an eslint **error**; warnings alone do **not** block) | exit 1 |
| `type-check` | assign a `string` to a `number` | exit 2 (TS2322) |
| `test:edge:remote` | point at the prod ref / the placeholder URL / an unknown ref / drop the service-role key | exit 1 (each) |
| `test:e2e` | restore the static resume fixture (the pre-09-09 dedup path) | exit 1 — see the remote/E2E notes below |
| `build` | add an unresolvable import to `src/main.tsx` | exit 1 |

- **`verify:baseline` does NOT include promptfoo / `test:adversarial`** (D-09 / D-07). This is
  a source-asserted invariant: neither `verify:baseline` nor `regression-gate.yml`
  references `test:adversarial` or `promptfoo`. **RE-VERIFIED in 09-09** (mandatory, because
  that plan *edited* `verify:baseline` — an invariant asserted against a value that has since
  changed is not an invariant). Fresh check: all eight gate script values
  (`verify:baseline`, `lint`, `type-check`, `test`, `test:edge`, `test:edge:remote`,
  `test:e2e`, `build`) reference promptfoo/adversarial **zero** times; the six
  `test:adversarial:*` scripts remain present in `package.json` and **off** the gate; the only
  hit in `regression-gate.yml` is a prose comment stating they are deliberately off it.
- The gate is **BLOCKING** (D-06 / NFR-01): a red `verify:baseline` re-run means the
  change does **not** merge until it is green or the diff is explicitly justified. The gate
  must have teeth.
- The per-PR gate composition uses `SUPABASE_TEST_*` / `STRIPE_TEST_*` / `E2E_TEST_PASSWORD`
  secrets stored in GitHub Actions. promptfoo runs scheduled or via a label, never on every PR.

This composition was finalized in Phase 01 Plan 02 (the `verify:baseline`,
`test:edge`, `test:e2e`, `test:quarantine` scripts + the offline `deno task test:ci`
allowlist) and Plan 01 (the deterministic vitest + green deno tier-config prerequisite), and
extended to the seven-layer chain in Phase 09 Plan 09-09 (VER-01 / D-05 / D-06).

### The remote DATABASE lane (`test:edge:remote`) — D-06

**What it proves.** VER-01 requires *database* tests in the gate. This lane runs the Deno
history-persistence suites against the **real preview Supabase project**
(`cimjltzovkahkqecpwgi`): a real analysis is invoked, and the lane asserts the durable rows it
must write (`resumes` / `analysis_results` / `linkedin_grades`, plus the linked
`usage_tracking` row). It covers all five migrated features and produces **real DB evidence on
every deploy**, not a side evidence run.

**It FAILS LOUDLY; it never silently skips.** Every other remote-gated test in this repo uses
skip-without-failing semantics (`DENO_TEST_SUPABASE_REMOTE=0` ⇒ log SKIP, report ok). That is
correct for the *offline* lane, but it would be catastrophic here: a lane invoked without
credentials would report **green having executed zero assertions**, and every deploy behind it
would then be gated on nothing. So `_tests/remote-preflight.test.ts` inverts the polarity — it
**throws** when `DENO_TEST_SUPABASE_REMOTE !== '1'`, when the URL is empty/the placeholder,
when the project is unreachable, and (T-09-07-C) when the URL resolves to the **production**
ref. That last one is structural: this lane **writes rows**, so it is made incapable of
writing them to production. The lane's healthy shape is `8 passed | 0 failed | 0 ignored` —
**`0 passed; N ignored` is the vacuous-green shape it exists to prevent.**

**If preview is unreachable, UNPAUSE it — do not skip the lane.** The preview project was
paused for the entirety of v4.0. Pausing it again turns the gate red *by design*: that is the
lane working, not the lane misbehaving.

**Credentials.** The lane resolves the preview URL / service-role key from
`SUPABASE_URL_STAGING` → `STAGING_SUPABASE_URL` → `SUPABASE_TEST_URL` (and the analogous chain
for the key + anon key). **staging == test == preview is ONE project**, so the long-standing
`SUPABASE_TEST_*` secrets already point at exactly the project this lane needs — **no new
GitHub secret is required**. Locally, `scripts/with-preview-env.mjs` loads `.env.test.local`
for the Deno child (existing env always wins, so CI secrets are never shadowed; a missing file
is not an error). A name fallback is **not** a validation relaxation: whichever alias supplies
the value still runs the full gauntlet (non-empty · not the placeholder · **not production** ·
positively the preview ref).

**`-SkipRemoteDbLane` is an emergency-only, default-OFF escape hatch.** `scripts/deploy.ps1
-Env <env> -SkipRemoteDbLane` runs every *other* layer and prints an unmissable warning that
the DATABASE lane was skipped and the deploy is therefore **not fully gated**. It exists so
that an unreachable preview cannot leave an operator with only the nuclear `-SkipVerify` — a
gate whose sole escape hatch is "skip everything" gets used that way. It still aborts before
`supabase link` on any red lane. Neither escape hatch is reachable through
`deploy-staging.ps1` / `deploy-production.ps1` (they accept only `-Functions`), so a **shim
deploy is always fully gated**.

### The E2E lane is no longer vacuous (09-09 / D9-03)

`e2e/resume-analysis.spec.ts` sat in this blocking gate while the flow it is named for had not
executed since **2026-06-11**. `Upload.tsx` de-duplicates on `file_hash`, so the static
committed fixture short-circuited to the *existing* June-11 analysis on every run: ~3.2 s
(a real AI_TEST_MODE analysis takes ~10–19 s), **zero** new rows, with every assertion
satisfied by a month-old report. It was green, and it proved nothing.

The fix is structural, and it is the pattern to copy for any spec that must prove a *real* run:

1. **Submit a per-run unique document** (`e2e/fixtures/make-unique-resume.ts`) so the dedup
   path is unreachable by construction.
2. **Assert a durable DB delta** — exactly one completed analysis **for the document this run
   submitted**. Pixel assertions cannot distinguish "I ran an analysis" from "I was shown a
   stored one"; a row-delta assertion can. (Scoped to the run's unique `file_name`, because the
   seeded E2E user is a *shared* resource and specs run in parallel workers.)
3. **Reset the consumables once per run** in `e2e/global-setup.ts` (D9-04): the Merit balance
   (a real analysis really spends 3 of the user's 10 lifetime Merits) and the `analyze-resume`
   rate-limit counter (a free user gets 5/hour; the 6th gate run in an hour would 429 and the
   spec would fail on a *timeout*, not an assertion). Both are resource-exhaustion time-bombs
   in a blocking gate, and a flaky gate is a bypassed gate.

### Where the gate is wired (TEST-08)

The `verify:baseline` gate has teeth in **two** enforcement points, both intentionally
the *same* command so local and CI agree:

1. **CI / PR gate** — `.github/workflows/regression-gate.yml` runs **`npm run verify:baseline`
   itself** — literally the same command as the deploy gate — on every PR to `main` /
   `staging`. Before 09-09 it *re-implemented* the gate as separate hand-listed steps, which is
   exactly how a CI gate silently ends up weaker than the deploy gate it is supposed to mirror;
   it now invokes the one command, so the two cannot drift. (It also no longer pins
   `DENO_TEST_SUPABASE_REMOTE` at the job level: each lane sets it via `cross-env` —
   `test:edge` ⇒ `0`, `test:edge:remote` ⇒ `1` — and a hardcoded job-level value is precisely
   the silent-skip footgun the remote lane's preflight exists to catch.) The YAML reports
   status; the **blocking** teeth come from GitHub branch-protection (see "Branch protection"
   below — operator action).
2. **Deploy gate (D-06)** — `scripts/deploy.ps1` runs `npm run verify:baseline` as a
   **HARD precondition before `supabase link`**. A red suite aborts the deploy
   (`$LASTEXITCODE -ne 0 → Write-Error + exit 1`) **before any project is linked or any
   function is deployed** — you cannot ship a regression. The precondition sits strictly
   between `Set-Location $repoRoot` and the `supabase link --project-ref $ref` line; the
   env→ref mapping and the link/auth path are untouched. The two backward-compat shims
   (`scripts/deploy-staging.ps1` / `scripts/deploy-production.ps1`) are 12-line forwarders
   that invoke `deploy.ps1` under `$ErrorActionPreference = "Stop"`, so they **inherit the
   gate automatically** — the gate lives in exactly one place (no duplication, no drift).
   - **Local prerequisites:** because `deploy.ps1` runs on the operator's Windows host,
     `verify:baseline` needs **Node + Deno + Playwright** present locally, plus reachable
     **preview** Supabase credentials for the DATABASE lane (`.env.test.local`, loaded for the
     Deno child by `scripts/with-preview-env.mjs`).
   - **Escape hatches (two, both explicit, loud, and default OFF):**
     - `scripts/deploy.ps1 -Env <env> -SkipVerify` bypasses the **entire** gate. **Emergency
       hotfix deploys only** — using it knowingly forgoes the zero-functional-change proof.
     - `scripts/deploy.ps1 -Env <env> -SkipRemoteDbLane` runs every layer **except** the
       DATABASE lane, for the one case where preview is genuinely unreachable and a deploy
       cannot wait. It prints an unmissable warning that the deploy is **not fully gated**, and
       it still aborts before `supabase link` on any red lane. The correct fix for an
       unreachable preview is to **unpause it**, never to skip the lane.

     Neither is reachable through `deploy-staging.ps1` / `deploy-production.ps1` (they accept
     only `-Functions`), so a **shim deploy is always fully gated**. Neither is ever
     default-on, and neither is used in routine deploys.

### The 8 validation checkpoints

Each of these is an observable, assertable point where a downstream phase's regression
would surface (the Nyquist sampling points the gate covers):

1. **vitest green** — `npm test`, exit 0, stable failure set.
2. **deno offline suite green** — `deno task test:ci` (`DENO_TEST_SUPABASE_REMOTE=0`), exit 0.
3. **E2E Flow 1 (auth/session)** — dashboard reachable after reload, no `/auth` redirect.
4. **E2E Flow 2 (resume analysis)** — results page renders a stubbed-but-shaped analysis (assert presence/shape, not AI wording).
5. **E2E Flow 3 (Stripe checkout)** — `clientSecret` returned + `EmbeddedCheckout` iframe mounts + post-checkout reconcile fires (the robust plumbing assertions; card-submit happy-path is quarantine-eligible per Pitfall 4 — Stripe documents anti-automation on the Payment Element).
6. **promptfoo adversarial clean** — all injection fixtures PASS the assertions (`npm run test:adversarial`, scheduled/label — real Anthropic, off the PR gate).
7. **Blocking gate** — required check red ⇒ no merge (GitHub branch protection + `regression-gate.yml`); and red `verify:baseline` ⇒ no deploy (`scripts/deploy.ps1` aborts before `supabase link`).
8. **Baseline anchor** — `git diff v4.0-baseline` + re-run reports pass/fail (tag `v4.0-baseline` + `verify:baseline`).

---

## promptfoo is OFF the gate (D-09)

The `test:adversarial*` family (promptfoo) is **scheduled / label-only** and is **NOT**
part of `verify:baseline` or `regression-gate.yml`. Rationale:

- promptfoo calls the **real** Anthropic-backed endpoints and incurs **per-run cost** —
  running it on every PR would be expensive and noisy, and folding a costed real-AI call
  into the per-PR gate would risk a **fail-open** if Anthropic is down (T-05-13).
- Adversarial coverage is **retained and extended in place** (TEST-07). The original
  `interview-prep-analyze` suite was joined in **Phase 05 (Plan 06)** by four off-gate
  per-feature suites covering the high-risk user-text ingesters — `analyze-resume`
  (`resumeText`), `analyze-career` (`resumeTextContent`), `grade-linkedin`
  (`profileContent`), and `recruiting-lens` (`resumeSummary` + `jobDescription`,
  Elite-gated). Each reuses the leak/JSON `defaultTest.assert` contracts with a
  feature-correct `no_variant_escalation` check, and carries **only**
  `${ANALYZE_URL}`/`${TEST_JWT}` placeholders + synthetic payloads (no committed secrets,
  T-05-12).
- The live run is the **operator / scheduled** step: the operator injects `ANALYZE_URL`
  (the deployed function URL) + `TEST_JWT` (a Pro/Elite test JWT for recruiting-lens) and
  invokes the relevant `npm run test:adversarial[:<feature>]`. Each fixture asserts: no
  system-prompt-leak (×3 contracts), no tier/variant escalation from body content, and a
  valid-JSON response (the handler must not fail open).
- **Do not conflate** this off-gate real-AI layer with the **on-gate deterministic**
  sanitizer corpus (Phase 05 Plan 05): the deterministic `_shared/prompt-sanitizer.test.ts`
  (injection-strip variants + false-positive-preservation + the `sanitizeMessages`
  central-seam case) and the `anthropic` env-branch characterization run `$0` **on** the
  deno layer of `verify:baseline` — they are the gate-side twin, never the promptfoo path.

This is a source-asserted negative invariant: `verify:baseline`, `test:edge`, and
`test:e2e` (and `regression-gate.yml`) contain **no** reference to `promptfoo` or any
`test:adversarial*` script.

---

## Quarantine Register (D-06 / D-07)

Flaky tests are **quarantined, never used to weaken the gate**. A blocking gate is only
trustworthy once the suite is deterministic, so the TEST-02 `OutcomeOverdueBanner` fix
was a hard prerequisite (and was fixed at **source**, not quarantined). Quarantine is
reserved for *residual, unknown* flakiness only.

**Convention (required):**

1. Tag the flaky test with a `it.skip` (or `test.skip`) annotated by a comment in this
   exact form, with an **owner and a date/expiry**:

   ```
   // QUARANTINE(#<issue>, <owner>, <YYYY-MM-DD expiry>): <reason>
   ```

2. Add a row to the **register table** below (owner + expiry are mandatory).
3. The quarantined test still **RUNS** in a visible, non-blocking lane —
   `npm run test:quarantine` — so it is never silently `.skip`-ped out of existence.
4. `verify:baseline` (the blocking gate) excludes **only** the registered quarantine
   set — nothing more. The gate is never weakened with `continue-on-error` or a blanket
   `dangerouslyIgnoreUnhandledErrors`.

**Register:**

| Test (file::name) | Issue | Owner | Quarantined | Expiry | Reason |
| ----------------- | ----- | ----- | ----------- | ------ | ------ |
| `e2e/stripe-checkout.spec.ts::QUARANTINE: 4242 card-fill + submit completes checkout` | Pitfall 4 (01-RESEARCH) | phase-01 | 2026-06-10 | — | Stripe's embedded Payment Element documents anti-automation that makes a card-submit CI-flaky. Pre-existing; recorded here for completeness (the blocking plumbing assertions in the same file DO run). |
| `e2e/two-tab-concurrency.spec.ts::QUARANTINE: tab B recovers tab A's SAME run_id and the run carries exactly ONE merit debit` | S-20-LIFECYCLE-DORMANT (09-06) | phase-09-executor | 2026-07-11 | 2026-10-11 | **NOT flaky — environment-gated; D-27 applies.** The lifecycle flag remains default-off by decision. Cross-context `run_id` recovery requires `VITE_FEATURE_ANALYSIS_LIFECYCLE=true`, matching edge flags, and a writing Merit ledger. Enabling that is a Merit-ledger activation Preview structurally cannot validate, so this case remains quarantined until the P-1 activation risk assessment/operator pass; its existing expiry is retained rather than extended. The blocking request-integrity half runs unconditionally in the same file. |
| `e2e/cross-device/realtime-fallback.spec.ts::QUARANTINE: OT-11: reload restores the waiting surface inside the 2000ms budget` | OT-11-WEBKIT-RESTORE-BUDGET (04.2-05) | phase-04.2-executor | 2026-08-02 | 2026-11-02 | webkit-only, load-dependent. Restore budget 2000ms exceeded (2258-2335ms observed) only inside the full ~370-test matrix; passes 31/31 standalone across all five projects and 5/5 on webkit alone, and was green during the operator's own `deploy.ps1` run on identical frontend code. Not on Phase 04.2's code path — the spec drives `/results/:id` and `Results.tsx` is untouched by this phase; the one 04.2-touched import, `useResumeStream`, changed only in its submit and terminal branches. Harness contention, not a performance regression. Budget deliberately **NOT** widened. The other four assertions in the same file (OT-10 polling fallback, OT-10 healthy control, offline→online reconnect note, hidden→visible catch-up poll) DO run and stay blocking. |
| `e2e/cross-device/realtime-fallback.spec.ts::QUARANTINE: OT-11: navigating away and back restores inside the 2000ms budget` | OT-11-WEBKIT-RESTORE-BUDGET (04.2-05) | phase-04.2-executor | 2026-08-02 | 2026-11-02 | Same root cause and the same `RESTORE_BUDGET_MS` constant as the reload row above — quarantining only one would leave the gate red on the next contended run. webkit-only, load-dependent. Restore budget 2000ms exceeded (2258-2335ms observed) only inside the full ~370-test matrix; passes 31/31 standalone across all five projects and 5/5 on webkit alone, and was green during the operator's own `deploy.ps1` run on identical frontend code. Not on Phase 04.2's code path (see the row above). Harness contention, not a performance regression. Budget deliberately **NOT** widened. |

> **`OutcomeOverdueBanner` is fixed at source, not quarantined.** Quarantine is for
> residual unknown flakiness that cannot be fixed immediately — each entry must carry an
> owner and an expiry so the register self-prunes and the gate's strictness stays
> explicit and trustworthy.

**Register audit (09-09).** The register holds exactly **two** rows and both are genuine (each
is a real `test.skip` that runs in the visible `test:quarantine` lane; neither was added to
green this phase's gate). One hygiene gap is recorded rather than silently tidied: the Phase-01
**Stripe card-fill** row carries **no expiry** (`—`), which violates this register's own
"owner + expiry are mandatory" rule, so it cannot self-prune. It is not re-dated here because
setting an expiry for a Phase-01 acceptance is that owner's call, not this plan's — it is
flagged so it stops being invisible. The 09-06 two-tab row is compliant (owner
`phase-09-executor`, expiry `2026-10-11`) and is **environment-gated, not flaky**: it un-skips
at lifecycle activation (D-01/D-02).

**Register audit (04.2-05).** The register now holds **four** rows; the two added here are the
webkit OT-11 restore-budget pair, quarantined on explicit operator disposition after the budget
was deliberately not widened and the gate was not self-declared green. One pre-existing hygiene
gap is recorded rather than silently tidied, in the same spirit as the 09-09 audit's note about
the missing Phase-01 expiry:

> **Rule 3 is not literally true for the Playwright rows.** Rule 3 says a quarantined test
> "still **RUNS** in a visible, non-blocking lane — `npm run test:quarantine`". That script is
> `vitest run --dir src/test/quarantine`, which is vitest-only and **cannot execute a Playwright
> spec**. All four register rows are Playwright specs, so none of them actually runs in that
> lane — including the two pre-existing rows, which the 09-09 audit described as running there.
> This gap therefore **predates Phase 04.2** and is not introduced by it. The four rows are
> genuine `test.skip`s with owners and expiries, and `verify:baseline` excludes exactly the
> registered set and nothing more, so the gate's strictness is unchanged — but the "visible
> non-blocking lane" guarantee is currently unmet for Playwright. Closing it (a
> `test:quarantine:e2e` lane, or folding a `--grep QUARANTINE` Playwright run into
> `test:quarantine`) is a **future phase's** call, not this one's: 04.2-05 was scoped to a
> costing-telemetry disposition, and restructuring quarantine tooling from inside it would be
> exactly the kind of scope creep this register exists to prevent. Flagged so it stops being
> invisible.

---

## Tier-config reconciliation record (Phase 01)

A pre-existing RED in the canonical offline deno suite was reconciled in Phase 01 as a
**stale test**, with **zero product behavior change** (the source was left
byte-identical). Recorded here so later phases trust the baseline:

- **Root cause:** `getTimeout(tier)` and the `reset-subscription-merits` handler both
  call `normalizeActiveTier(tier)`, which collapses `'pro' → 'elite'` (the deployed
  merit-milestone behavior — saved Pro users are granted the Elite allowance so no path
  falls into an inactive middle tier). Pre-collapse Pro-specific test expectations were
  therefore stale.
- **`supabase/functions/_shared/tier-config.test.ts` (Plan 01):** 3 Pro-timeout
  assertions reconciled to the Pro→Elite collapse — `getTimeout('pro','core')` →
  `155000`, `getTimeout('pro','elite-preview')` → *throws*, `getTimeout('pro','quiz')`
  → `80000`. `tier-config.ts` source unchanged (`git diff` empty). Deno result:
  `21 passed | 0 failed`.
- **`supabase/functions/reset-subscription-merits/index.test.ts` (Plan 02):** the
  `batch-due-users` assertion `p_tier === 'pro'` reconciled to `'elite'` (handler applies
  `normalizeActiveTier`). Handler source byte-identical. `deno task test:ci` →
  `284 passed | 0 failed`.
- **Classification:** both are test/source reconciliations, **not** product behavior
  changes — explicitly allowed by D-01 ("the baseline IS the suite passing green"). No
  live per-tier timeout or merit allowance changed.

---

## Drifted-test reconciliation record (Phase 05, Plan 05-01)

Phase 05 Plan 05-01 grew the offline deno allowlist by **harvesting** previously
off-gate tests onto `test:ci` (284 → 566 passed | 0 failed) and **reconciling** the
5 drifted-RED off-gate files the same Phase-1 way (assert CURRENT behavior; product
source left byte-identical). All 5 were **reconciled, none retired** — every drift
was a test/source mismatch, not a product behavior change (`git diff v4.0-baseline`
of each underlying `index.ts` / `_shared/*.ts` is empty):

- **`grade-linkedin` / `recruiting-lens` / `analyze-career` `phase22-contract.test.ts`** —
  asserted an inline `rpc('record_ai_usage'` call + `p_action_type: '<action>'` object
  key in the handler. That call form was **0 at both `v4.0-baseline` AND HEAD** (which
  is exactly why these files were never on the offline gate). Usage is recorded via the
  shared `recordUsageWithAnalysis(userId, '<action>', <credits>, recordId)` helper in
  `_shared/usage-checker.ts`, which owns the `rpc('record_ai_usage', …)` write.
  Reconciled to assert the current helper-call form.
- **`grade-linkedin/entitlement.test.ts`** — Wave-0 RED scaffold expecting an atomic
  `checkAndRecordUsage(userId, 'linkedin_grading')`; the shipped LIG-11 design split it
  into a check-only `checkEntitlement(...)` gate + post-success
  `recordUsageWithAnalysis(...)` record. Reconciled to the split gate+record.
- **`_shared/merit-gateway.spend-ordering.test.ts`** — test-mechanism drift: it
  reassigned the immutable exported `getServiceClient` binding (now rejected by Deno).
  Reconciled to the canonical seam (patch the live singleton's `.rpc` method, per
  `merit-gateway.test.ts`). The SC-7 spend-ordering contract is unchanged.

**Classification:** all 5 are test/source reconciliations, **not** product behavior
changes (allowed by D-01: the baseline IS the suite passing green). No merit/usage
accounting, auth path, or tier-gating behavior changed.

**Allowlist growth across Phase 05.** Subsequent plans deepened the offline deno gate in
place (the single allowlist in `supabase/functions/deno.json`), each leaving every product
`index.ts` / `_shared/*.ts` byte-identical vs `v4.0-baseline`:
`284 → 566` (05-01 harvest) `→ 587` (05-02 failure-path) `→ 638` (05-03 live-AI handler
config) `→ 673` (05-04 async-workers + interview-prep handlers) `→ 698 passed | 0 failed |
11 ignored` (05-05 deterministic adversarial corpus + `anthropic` env-branch
characterization). The off-gate real-AI injection suites (05-06) were added without
touching the gate composition (negative invariant re-proven).

**Suspected-behavior register (D-08):** latent-bug-looking observations surfaced while
writing tests are pinned-and-logged in
`.planning/phases/05-deep-test-coverage-expansion/05-SUSPECTED-BEHAVIOR.md` (schema:
`id | file:handler | suspected issue | current behavior pinned (test ref) | what would
confirm a bug | severity | disposition`). Current rows — all `minor → log`, **none
escalated** (each `git diff v4.0-baseline` of the touched source is empty — T-05-02
control verification):
- **SB-05-01** — `analyze-career` single canonical `recordUsageWithAnalysis` call-site
  convergence (not a free-analysis leak from static reading).
- **SB-05-02** — `grade-linkedin` LIG-11 free-scan bounded-TOCTOU carve-out (accepted,
  documented worst-case of ≤ 1 extra free scan/cycle).
- **SB-05-04** — `interview-prep-analyze` terminal catch surfaces a thrown 401 as a 500
  (auth still fires; over-reports, never under-reports; IP gated off prod).
- **SB-05-05** — `_shared/prompt-sanitizer.ts` `ignore_instructions` does not tolerate an
  interposed article `the` (an under-stripping recall gap on one phrasing; central
  `sanitizeMessages` seam still fires; off-gate promptfoo is the defense-in-depth).

Each is a future `/gsd-debug` / security-pass candidate; fixing any of them is a behavior
change, out of scope for the zero-functional-change v4.0 milestone.

## Cross-device matrix — the `@xdev` subset (Phase 03 · Plan 03-03 · XTEST-01 / XTEST-02)

**Added 2026-07-28.** Until this plan, `playwright.config.ts` registered exactly two projects
(`setup` + `chromium`). Every cross-engine defect in this codebase was therefore structurally
invisible to the blocking gate — the 2026-07-26 `Map.prototype.getOrInsertComputed` white-screen
incident is the proof: it shipped in *current* browsers and no lane could have seen it.

### The five projects (D-01)

All five reuse the **single chromium `setup` run**. Playwright's storage-state file is
engine-agnostic JSON (`cookies[]` + `origins[].localStorage[]`), so one login seeds every engine;
there is no per-engine login and no second credential path.

| Project | Descriptor | Engine | Viewport | DPR | `grep` |
| ------- | ---------- | ------ | -------- | --- | ------ |
| `chromium` | `Desktop Chrome` | chromium | 1280×720 | 1 | **none** — runs the FULL functional suite |
| `firefox` | `Desktop Firefox` | firefox | 1280×720 | 1 | `/@xdev/` |
| `webkit` | `Desktop Safari` | webkit | 1280×720 | 1 | `/@xdev/` |
| `mobile-webkit` | `iPhone 14` | webkit | 390×664 | 3 | `/@xdev/` |
| `mobile-chromium` | `Pixel 7` | chromium | 412×839 | 2.625 | `/@xdev/` |

**Opt-in real-browser channels (D-28).** Playwright 1.61 registers genuine `msedge` / `chrome`
chromium channels, so real Microsoft Edge is automatable on the operator's Windows host — which
moves Edge **out of** XTEST-04's manual-only set. Two further projects are appended **only** when
`STRIVO_REAL_CHANNELS=1`:

| Project | Descriptor | Channel | `grep` |
| ------- | ---------- | ------- | ------ |
| `edge` | `Desktop Edge` | `msedge` | `/@xdev/` |
| `chrome-real` | `Desktop Chrome` | `chrome` | `/@xdev/` |

A `channel:` project **throws at launch** where that browser is not installed (CI Linux, the
maintainer's macOS host). Gating them behind an explicit `=== '1'` opt-in makes the default failure
mode **"not run"**, never **"red"** — an environment-shaped red in a blocking gate is how gates get
bypassed. Run them with `STRIVO_REAL_CHANNELS=1 npm run test:e2e:xdev` on a host that has them.

**No N-1 browser is automated and no second Playwright version is pinned (D-03).** Pinning a second
Playwright would be brittle and would drift from real-world N-1 anyway; the support floor is enforced
by feature detection, and N-1 is spot-checked in the XTEST-04 manual pass.

### The `@xdev` tag convention (D-02)

- **What it means:** "this spec asserts something **engine- or device-dependent**." Put the literal
  `@xdev` in the `test.describe` title (or the test title). Playwright composes
  `"<project> <file> <describe> <test> <tags>"` and matches each project's `grep` against it, so a
  tag on the describe selects every test inside it.
- **The RegExp is declared ONCE** at module scope in `playwright.config.ts` and shared by every
  filtered project, so the tag can never drift between projects.
- **Only `chromium` is unfiltered.** The full functional suite stays chromium-only. This is the whole
  reason the matrix is affordable: `verify:baseline` is a seven-layer gate, and a ~5× e2e blow-up
  drives operators to `deploy.ps1 -SkipVerify`, which disables the **entire** precondition. A gate
  that gets slow gets skipped, which is the same outcome as a gate that is wrong.
- **Admission rule:** a spec joins the `@xdev` subset **only** if it asserts something that could
  plausibly differ by engine, viewport, DPR or input modality. Anything that only exercises app logic
  belongs in the chromium-only suite, where it is paid for once instead of five times.
- **Budget remedy:** if the subset ever exceeds its wall-clock budget, the sanctioned fix is to **cut
  tests from the subset** and record the removed coverage in the phase's residual register — **never**
  to drop a project. Dropping a project re-opens the exact blind spot the matrix exists to close.

**Current `@xdev` specs (03-17):**

`browser-gate`, `capability-gate`, `leak-guard`, `matrix-smoke`, `network-conditions`,
`realtime-fallback`, `responsive`, `session-storage`, `stale-bundle`, `touch-targets`,
`upload-parity`, `waiting-surface`, `elite-rerun-merit`, and `two-tab-concurrency`.
The last two are the 03-17 extensions and run on all five projects.

### Where it is wired (XTEST-02)

`verify:baseline` reaches the matrix through its **existing** `test:e2e` step — `playwright test`
runs every registered project, including the four grep-filtered ones. The chain is unchanged:

```
lint && type-check && test && test:edge && test:edge:remote && test:e2e && build
```

`npm run test:e2e:xdev` (`playwright test --grep @xdev`) is a **convenience lane, not a gate lane**:
it exists for fast local iteration and for the operator's `STRIVO_REAL_CHANNELS=1` Windows pass. It is
deliberately **NOT** inserted into `verify:baseline` — a second lane would double the cost and invite
the two definitions to drift, which is exactly the failure VER-01 (09-09) was created to prevent.

### Measured wall-clock (real `time`, not an estimate)

Measured twice each on a quiet macOS host, same session, `test:e2e` including its `vite build` +
`vite preview` webServer bring-up. "Before" is the pre-plan project set reproduced exactly
(`--project=setup --project=chromium`, i.e. `chromium` unfiltered and nothing else).

| Run | Before (setup + chromium) | After (5-project matrix) |
| --- | ------------------------- | ------------------------ |
| 1 | 83.3 s | 87.9 s |
| 2 | 82.3 s | 88.9 s |
| **Mean** | **82.8 s** | **88.4 s** |

**Delta: +5.6 s (+4.6 s / +6.6 s across the pair).** Budget is **≤ +3 min (180 s)** — the budget
**holds**, with ~97% headroom. Nothing was cut from the subset. The delta is small because the four
added projects run **one** tagged test each and share the single `setup` run and the single preview
build; the chromium functional suite, which dominates the lane, is untouched.

> Note on those runs: 4 `chromium` specs (`resume-analysis`, `onboarding-flow`,
> `onboarding-analysis-failure`, `two-tab-concurrency`) failed **identically in the before and the
> after** measurement. That is the documented `AI_TEST_MODE` precondition, not a matrix regression:
> `AI_TEST_MODE` is set **transiently during CI only** (see *Secrets* above), so a local run drives a
> live Anthropic call that times out. The failure set is byte-identical with and without the matrix,
> and all five matrix projects were green.

**Re-measured after plan 03-05 (2026-07-28)** — the discovery suite took the `@xdev` subset from
1 test to 29 per project (5 spec files: responsive, touch-targets, network-conditions,
session-storage, upload-parity), so the 03-03 figure above is no longer the current cost:

| Run | `npm run test:e2e`, full matrix + discovery specs |
| --- | ------------------------------------------------ |
| 1 | 193 s |
| 2 | 184 s |
| **Mean** | **188.5 s** |

**Delta vs the pre-plan baseline (82.8 s): +105.7 s of the 180 s budget — the budget still holds,
with ~41 % headroom (~74 s) left for every `@xdev` spec plans 03-07…03-18 still add.** Nothing was
cut. Plan 03-17 re-measures and owns the final figure; the sanctioned remedy if the budget is ever
breached is to cut cases and record each cut in `03-RESIDUAL-REGISTER.md` — never to drop a project.

**Plan 03-17 final measurement (2026-07-30):**

| Measurement | Wall clock |
| --- | ---: |
| Focused one-click + deliberate-rerun matrix (26 tests including setup) | **39.49 s** |
| Full `npm run test:e2e` immediately before the final 03-17 case | **9.8 min** |
| Full `npm run test:e2e` after the final 03-17 case | **557.51 s (9.3 min)** |

Plan 03-17's added-runtime requirement **holds**: its complete focused five-project evidence is
39.49 s, **140.51 s below** the +180 s hard cap, and the authoritative full lane did not increase
relative to the immediately preceding validated run (the 30-second difference is normal host noise).
No case and no project was cut. The full lane is now dominated by the preserved OT-8/OT-9
60/150-second observations from 03-15; 03-17 did not weaken or rescope them.

> **The `@xdev` lane is intentionally RED between plan 03-05 and the Wave 3–5 fixes.** Those runs
> reported **67 failed / 57 passed / 34 skipped**: **63** are plan 03-05's discovery failures, which
> ARE its deliverable (a green discovery suite would mean the specs assert nothing), and **4** are
> the pre-existing `AI_TEST_MODE` failures above. Every failure is catalogued with an owning plan in
> `.planning/phases/03-cross-device-reliability-and-compatibility/03-DEFECT-REGISTER.md`. Do not
> silence a row to green the gate, and do not reach for `deploy.ps1 -SkipVerify` to route around it.

### Anti-vacuity rule for this lane (mandatory)

A matrix that runs zero tests on four of five projects reports green forever — that is the 09-09 rot
in a new costume, and it is the dominant risk of this whole design. Therefore:

> **Every `@xdev` spec must be proven able to FAIL, by mutation, on every project — never merely
> observed green.**

Seed spec: `e2e/cross-device/matrix-smoke.spec.ts` (`app boots and the document does not scroll
horizontally`). Its assertions are deliberately **structural, not timing-based** — a non-empty `#root`
plus `document.documentElement.scrollWidth <= clientWidth + 1` at each project's own default viewport
— so they cannot flake across engines. **Mutation proof (2026-07-28):** with the overflow assertion
inverted (`toBe(false)` → `toBe(true)`), `npx playwright test --grep @xdev` reported **exactly 5
failures — one for each of `chromium`, `firefox`, `webkit`, `mobile-webkit`, `mobile-chromium`**.
Assertion restored: **6 passed** (the 5 projects + `setup`). Any flake surfaced by a future mutation
proof must be **fixed or the test cut** — never retried away.

### `playwright.prod.config.ts` is deliberately EXCLUDED from the matrix

That config drives the **live** site with real accounts at `retries: 0, workers: 1, fullyParallel:
false`, precisely so that "one job / one charge per attempt" is unambiguous. Adding five projects
there would run real analyses **five times**, multiplying real Merit spend and destroying the very
evidence the config exists to produce. It stays single-project (`prod-smoke`, Desktop Chrome). Any
future prod cross-device work must go in a **separate, Merit-free** project set (checkout dialogs,
access control, auth, responsive assertions) — never by widening this one.

### What the automated lane does NOT prove

- **Actual Merit-ledger debit count:** Preview has the Merit system off; P-1 verifies one real
  Free and one real Elite attempt against the ledger.
- **Real AI output:** local/Preview browser gates use deterministic fixtures; P-1 owns a bounded
  real-feature operator pass.
- **Real Safari and physical iOS/Android devices:** Playwright engines/emulation are not hardware;
  P-2, P-3 and P-4 own those checks.
- **Real redeploy skew:** a local chunk substitution cannot reproduce deployment propagation;
  P-6 owns the open-tab redeploy check.
- **Real browser extensions:** clean Playwright contexts do not reproduce extension injection;
  P-7 owns the extension-enabled pass.

---

## Branch protection — making the gate actually block (D-06)

The GitHub Actions workflow (`.github/workflows/regression-gate.yml`, owned by Plan 05)
runs `verify:baseline` on every PR to `main` / `staging`. **The YAML alone is not
blocking.** The blocking teeth come from a **GitHub branch-protection "Required status
check"** — an operator action that must be enabled once:

1. GitHub repo → **Settings → Branches → Branch protection rules**.
2. Add (or edit) a rule for **`main`** and for **`staging`**.
3. Enable **"Require status checks to pass before merging"**.
4. Select the **Regression Gate** job (the `gate` job from `regression-gate.yml`) as a
   **required** status check.
5. (Recommended) Enable "Require branches to be up to date before merging" so the gate
   runs against the merge result.

Until this required-check setting is enabled, the workflow reports status but does not
prevent merge. Enabling it is what gives D-06 its teeth on the **PR / merge** side; the
**deploy** side is gated independently by `scripts/deploy.ps1` (see "Where the gate is
wired"). Phase 1 establishes the gate and documents this step; **Phase 5 (TEST-08, Plan
05-07) owns wiring the deploy gate and (re)confirming this branch-protection setting** —
the required-status-check on `main` / `staging` was the open item carried from Phase 1
(01-05, "branch-protection Required check still owed — only after gate green"). It is a
**manual-only** verification (a GitHub repo setting, not assertable from the codebase);
the operator enables/confirms it once, then it persists.

---

## Secrets (named here, never valued)

The gate depends on these secrets, stored in **GitHub Actions secrets** and in the
**Supabase TEST-project function secrets** — this document **names** them but contains
**no real key, URL, or password values** (threat T-04-01):

- `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY` —
  the dedicated Supabase TEST project, which IS **strivoaipreview**
  (ref `cimjltzovkahkqecpwgi`); these all map to it (service-role key is server-side
  only, never shipped to the browser).
- `STRIPE_TEST_PUBLISHABLE_KEY` — Stripe test-mode publishable key for the embedded
  checkout flow.
- `E2E_TEST_PASSWORD` — the seeded Playwright test user's password.
- `AI_TEST_MODE=true` — set **TRANSIENTLY during CI** on the TEST project =
  strivoaipreview (`cimjltzovkahkqecpwgi`): `supabase secrets set` immediately before
  the E2E step and `supabase secrets unset` immediately after (cleanup wrapped with
  `if: always()` so it runs even on failure). While set, the deployed edge functions
  return deterministic recorded fixtures instead of calling Anthropic (D-02). It is
  **NOT a permanent secret** — leaving it unset between CI runs keeps realistic AI on
  the preview site for manual use. Never set on staging/production.

No `pk_test_…`, `sk_…`, `service_role` JWT, or password literal appears anywhere in this
document or in the committed test config — all values are injected from secrets at
build/run time.

The copy-paste skeleton for this test/CI + E2E surface is `.env.test.local.example`
(names + non-secret placeholders only); the full cross-env name matrix — including which
surface (GitHub Actions secret / Supabase preview-test secret / local `.env.test.local`)
sets each — is in `docs/ENVIRONMENT.md`. Both reflect the same topology: "staging" and
"test" are the **same** Supabase project (`cimjltzovkahkqecpwgi` = strivoaipreview), so
the real separation axis is prod vs preview(=staging=test). `AI_TEST_MODE` is transient
(set immediately before the E2E step and unset after), never a permanent secret.

---

## Quick command reference

| Command | What it runs | On the gate? |
| ------- | ------------ | ------------ |
| `npm run verify:baseline` | lint + type-check + vitest + deno-offline + deno-remote/DB + Playwright + build (the whole gate; ~7 min) | **the gate** |
| `npm run lint` | `eslint .` (blocks on **errors**; warnings do not block) | yes |
| `npm run type-check` | `tsc -p tsconfig.app.json --noEmit` | yes |
| `npm run test` | vitest frontend suite | yes |
| `npm run test:edge` | `cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci` (offline allowlist; grown in Phase 05) | yes |
| `npm run test:edge:remote` | `cross-env DENO_TEST_SUPABASE_REMOTE=1 deno task test:remote` (the REMOTE DATABASE lane against preview; fails loudly, never skips) | yes |
| `npm run test:e2e` | `playwright test` (browser E2E flows — chromium full suite + the 4 `@xdev` cross-device projects) | yes |
| `npm run test:e2e:xdev` | `playwright test --grep @xdev` (the cross-device subset only; add `STRIVO_REAL_CHANNELS=1` for real Edge/Chrome) | no — convenience lane; the gate reaches the matrix via `test:e2e` |
| `npm run build` | production `vite build` | yes |
| `npm run test:quarantine` | the non-blocking quarantine visibility lane | no (visibility only) |
| `npm run test:adversarial` | promptfoo injection suite — `interview-prep-analyze` (real Anthropic) | **no** — scheduled/label (D-09) |
| `npm run test:adversarial:resume` | promptfoo injection suite — `analyze-resume` (real Anthropic) | **no** — scheduled/label (D-09) |
| `npm run test:adversarial:career` | promptfoo injection suite — `analyze-career` (real Anthropic) | **no** — scheduled/label (D-09) |
| `npm run test:adversarial:linkedin` | promptfoo injection suite — `grade-linkedin` (real Anthropic) | **no** — scheduled/label (D-09) |
| `npm run test:adversarial:recruiting` | promptfoo injection suite — `recruiting-lens` (real Anthropic) | **no** — scheduled/label (D-09) |
| `scripts/deploy.ps1 -Env <env>` | the env-parameterized Supabase deploy — **runs `verify:baseline` as a hard precondition before `supabase link`** (D-06); `-SkipVerify` bypasses the whole gate and `-SkipRemoteDbLane` drops only the DATABASE lane (both emergency-only, default OFF, loud) | **deploy gate** |

> **Off-gate-by-name guard:** every `test:adversarial*` script and `promptfoo` itself are
> the *only* adversarial references; none appears in `verify:baseline`, `test:edge`,
> `test:e2e`, or `regression-gate.yml`. The deterministic injection coverage that DOES run
> on the gate is the `_shared/prompt-sanitizer.test.ts` deno corpus, not promptfoo.

---

*This strategy doc supersedes `.planning/codebase/TESTING.md`. The deeper README/CLAUDE
reconciliation is Phase 7 (NFR-03); Phase 1 lands this artifact, the CLAUDE.md pointer,
and the quarantine register.*
