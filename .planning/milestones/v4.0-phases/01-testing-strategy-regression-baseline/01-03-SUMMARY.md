---
phase: 01-testing-strategy-regression-baseline
plan: 03
subsystem: testing
tags: [playwright, e2e, supabase-auth, stripe, ai-test-mode, storage-state, cors, service-role]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Deterministic vitest suite (cross-worker rejection fixed) so the verify:baseline vitest layer is a stable known set"
  - phase: 01-02
    provides: "playwright.config.ts (setup+chromium projects, vite preview :8080, storageState reuse), e2e/global-setup.ts placeholder, verify:baseline/test:e2e scripts, dotenv(.env.test.local) wiring"
provides:
  - "e2e/global-setup.ts — idempotent service-role admin.createUser seed for e2e+baseline@strivo.test + onboarded resume/profile rows (service-role key Node-side ONLY)"
  - "e2e/auth.setup.ts — login setup project that drives the real #email/#password form and saves .auth/user.json storageState"
  - "e2e/fixtures/test-resume.pdf — text-extractable fixture PDF that clears the >65-word/>320-char client extraction quality gate (no OCR fallback)"
  - "e2e/auth-session.spec.ts (Flow 1) — login + reload → session persists, no /auth redirect (PASSES live)"
  - "e2e/resume-analysis.spec.ts (Flow 2) — upload → analyze (AI stubbed server-side) → shaped Results render"
  - "e2e/stripe-checkout.spec.ts (Flow 3) — clientSecret + iframe-mount + reconcile blocking set; quarantined 4242 card-submit (integration-proven)"
  - "scripts/make-e2e-fixture-pdf.cjs — reproducible fixture-PDF generator"
  - ".gitattributes — *.pdf binary so CI checkout never CRLF-mangles the fixture"
affects: [01-05, regression-baseline, ci-gate, testing-strategy-doc, stripe-checkout, resume-analysis, ai-test-mode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service-role Supabase seed runs ONLY in e2e/global-setup.ts (Node-side); never reaches page context, never in a .spec.ts (threat T-03-01)"
    - "AI is stubbed SERVER-SIDE via the existing AI_TEST_MODE seam on the TEST project — specs contain NO Anthropic mock and NO AI_TEST_MODE literal (reuse, not rebuild)"
    - "Stripe integration-proven blocking set (clientSecret + iframe-mount + reconcile); card-submit quarantined via test.skip + // QUARANTINE(...) tag (Pitfall 4)"
    - "Fixture PDF authored to clear the client extraction quality gate so Flow 2 stays on the pure extract→analyze path (no server OCR dependency)"

key-files:
  created:
    - "e2e/auth.setup.ts"
    - "e2e/auth-session.spec.ts"
    - "e2e/resume-analysis.spec.ts"
    - "e2e/stripe-checkout.spec.ts"
    - "e2e/fixtures/test-resume.pdf"
    - "scripts/make-e2e-fixture-pdf.cjs"
    - ".gitattributes"
  modified:
    - "e2e/global-setup.ts"
    - ".gitignore"

key-decisions:
  - "Task 3a = integration-proven (operator-decided): the 3 blocking Stripe assertions are clientSecret + EmbeddedCheckout iframe-mount + ?checkout=complete reconcile; the 4242 card-SUBMIT is quarantine-eligible (test.skip + QUARANTINE tag), OUT of the blocking gate."
  - "AI_TEST_MODE is a TEST-project-only server-side function secret — prod deploy scripts UNTOUCHED; the literal does not appear anywhere in e2e/ (server-side reuse seam)."
  - "Seeded test-user identity: e2e+baseline@strivo.test (password from E2E_TEST_PASSWORD env). global-setup also seeds an onboarded resume row so login settles on /dashboard, not /onboarding."
  - "Enriched the fixture PDF to >65 words/>320 chars with doc signals so PDF.js client extraction is ACCEPTED and the resume flow never hits the CORS-gated ocr-pdf fallback."

patterns-established:
  - "Quarantine convention applied: // QUARANTINE(id, owner, date) + test.skip keeps a flaky-by-design assertion visible but out of the blocking gate (D-06/D-07)."
  - "E2E specs reuse storageState from the setup project (no per-test login); service-role seed self-heals the user + password idempotently across runs."

requirements-completed: [TEST-04]

# Metrics
duration: 18min
completed: 2026-06-10
---

# Phase 01 Plan 03: Critical-Flow E2E Specs (auth/session, resume analysis, Stripe checkout) Summary

**Authored the 3 critical-flow Playwright E2E specs plus the service-role Supabase test-user seed and login storageState fixture against the LIVE Supabase TEST project + Stripe test mode (only Anthropic stubbed). Flow 1 (auth/session) and the Stripe reconcile assertion are GREEN live; Flow 2 (resume) and the Stripe clientSecret/iframe assertions are BLOCKED by a single TEST-project edge-function CORS precondition (`APP_URL` ≠ the localhost preview origin) that is outside this plan's authority to change.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-10T01:13:03Z
- **Completed:** 2026-06-10T01:31Z
- **Tasks:** 5 (Task 0 operator-approved; Tasks 1, 2, 3a-decided, 3b authored + run; Task 4 = this human-verify evidence)
- **Files modified:** 7 created + 2 modified

## Accomplishments
- **Seed + login fixture (Task 1) — verified GREEN live:** `npx playwright test --project=setup` seeds `e2e+baseline@strivo.test` via service-role `admin.createUser` (idempotent, self-healing password) + an onboarded resume row, drives the real `#email`/`#password` login form, and writes `.auth/user.json` (gitignored). Reproduced multiple times.
- **Flow 1 (auth/session) — GREEN live:** login state → `/dashboard` → `page.reload()` → still authenticated, no `/auth` redirect. Proves the real `persistSession`/`autoRefreshToken` path.
- **Flow 2 (resume) authored + path-proven:** spec drives upload → analyze → shaped Results assertion. Interactive driving confirmed the full path works up to the `analyze-resume` CORS wall (PDF.js extraction ACCEPTED → navigate to `/results/:id?stream=true`).
- **Flow 3 (Stripe) authored per integration-proven:** 3-assertion blocking set (clientSecret + iframe-mount + reconcile); the `?checkout=complete` reconcile assertion is GREEN live; card-submit quarantined.
- **AI_TEST_MODE prod-untouched, confirmed:** the literal `AI_TEST_MODE` appears in ZERO e2e files; no spec mocks Anthropic; the stub is the TEST-project server-side seam. No deploy scripts touched.

## Task Commits

Each task was committed atomically:

1. **Task 1: seed test user + login storage-state fixture + fixture PDF** - `7bc113c` (feat)
2. **Task 1 (follow-on): mark *.pdf binary so CI checkout never CRLF-mangles the fixture** - `d3601ce` (chore)
3. **Task 2: auth/session + resume-analysis E2E specs (Flows 1 & 2) + enriched fixture** - `ab0febf` (feat)
4. **Task 3b: Stripe checkout E2E spec (Flow 3, integration-proven) + gitignore .playwright-cli/** - `5ae7662` (feat)

**Plan metadata:** (docs commit — STATE.md / ROADMAP.md / this SUMMARY / deferred-items.md)

## Files Created/Modified
- `e2e/global-setup.ts` — service-role idempotent `admin.createUser` seed + onboarded resume/profile rows; service-role key Node-side ONLY; pages the admin list to find/sync an existing user.
- `e2e/auth.setup.ts` — Playwright setup project: real login form → asserts authed `/dashboard` → `storageState({ path: '.auth/user.json' })`.
- `e2e/fixtures/test-resume.pdf` — minimal valid, text-extractable PDF (137 words/~1084 chars) that clears the resume quality gate.
- `scripts/make-e2e-fixture-pdf.cjs` — reproducible generator for the fixture PDF.
- `e2e/auth-session.spec.ts` — Flow 1 (reload → session persists, no /auth redirect).
- `e2e/resume-analysis.spec.ts` — Flow 2 (upload → analyze stubbed → shaped Results; presence/shape assertions only).
- `e2e/stripe-checkout.spec.ts` — Flow 3 (clientSecret + iframe-mount + reconcile blocking set; quarantined 4242 card-submit).
- `.gitattributes` — `*.pdf binary`.
- `.gitignore` — added `.playwright-cli/` (local authoring scratch dir).

## Stripe scope decision (Task 3a) — what is blocking vs. quarantined

**Decision: `integration-proven`** (operator-decided; recorded).

| Assertion | Status | Live result |
|-----------|--------|-------------|
| (1) `create-checkout-session` returns a real test-mode `clientSecret` | **BLOCKING** | RED — `create-checkout-session` CORS-blocked from `localhost:8080` |
| (2) `EmbeddedCheckout` iframe mounts | **BLOCKING** | RED — gated on (1) returning a clientSecret |
| (3) `?checkout=complete` → reconcile fires (param cleaned, toast) | **BLOCKING** | **GREEN** — pure client routing, not edge-function-gated |
| (4) 4242 card-fill + SUBMIT | **QUARANTINED** (`test.skip` + `// QUARANTINE(TEST-04-stripe-card-submit, ...)`) | SKIPPED by design (Stripe anti-automation, Pitfall 4) |

Only the literal `4242 4242 4242 4242` test card is used; no real card numbers.

## Decisions Made
- **integration-proven Stripe scope** (Task 3a, operator) — see table above.
- **Seed an onboarded resume row** so the login flow settles on an authed app route (ProtectedRoute bounces resume-less users to `/onboarding`); the auth.setup explicitly asserts `/dashboard`.
- **Enrich the fixture PDF** past the client extraction quality gate (Rule 1/3, see Deviations) so Flow 2 stays on the pure extract→analyze path rather than the CORS-gated OCR fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mark *.pdf binary in .gitattributes**
- **Found during:** Task 1 (commit of the fixture PDF)
- **Issue:** autocrlf flagged LF→CRLF on `e2e/fixtures/test-resume.pdf`; a line-ending-mangled PDF would fail client-side PDF.js extraction on a fresh CI/Linux checkout.
- **Fix:** Added `.gitattributes` with `*.pdf binary`; renormalized the blob (`git check-attr text` → `unset`).
- **Files modified:** `.gitattributes`
- **Verification:** stored blob byte-identical (1126→2271 bytes after enrich); `file` confirms a valid 1-page PDF.
- **Committed in:** `d3601ce`

**2. [Rule 1 - Bug] Fixture PDF too short → triggered the CORS-gated OCR fallback**
- **Found during:** Task 2/Task 4 (running Flow 2 live)
- **Issue:** the initial fixture (~50 words/~280 chars) was BELOW the resume extraction quality gate (`minWords: 65, minChars: 320` in `src/lib/document-extraction.ts`), so `pdfjsQuality.ok` was false and the flow fell through to the server `ocr-pdf` edge function — which is CORS-blocked from `localhost:8080` on the TEST project. The upload aborted with "Document text extraction failed".
- **Fix:** Enriched the fixture to 137 words/~1084 chars with document signals (email, years, City/ST, Title-Case name, bullets) so PDF.js client extraction is ACCEPTED and the OCR path is never taken. Verified interactively: extraction accepted → upload → navigate to `/results/:id?stream=true`.
- **Files modified:** `scripts/make-e2e-fixture-pdf.cjs`, `e2e/fixtures/test-resume.pdf`
- **Verification:** interactive playwright-cli run reached the streaming Results page (no `ocr-pdf` call after the fix in the staging step).
- **Committed in:** `ab0febf`

**3. [Rule 3 - Blocking] gitignore .playwright-cli/ scratch dir**
- **Found during:** Task 3b commit
- **Issue:** interactive selector-authoring (playwright-cli) created an untracked `.playwright-cli/` dir that must not be committed.
- **Fix:** added `.playwright-cli/` to `.gitignore`.
- **Committed in:** `5ae7662`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug). No scope creep — all three were necessary to keep the fixture committable and the resume flow on the intended (non-OCR) path.

## Issues Encountered — TEST-project edge-function CORS blocks the localhost E2E origin (environmental, Rule 4)

**This is the central, honest finding (logged in `deferred-items.md`).** It is NOT a spec defect and NOT maskable; it is outside this plan's authority (the plan forbids deploying / changing TEST-project secrets).

The TEST project (`cimjltzovkahkqecpwgi`) deploys its user edge functions with `APP_URL = https://strivoai-git-preview-kapura3-stars-projects.vercel.app`. `_shared/cors.ts` is **fail-closed single-origin** (`Access-Control-Allow-Origin: APP_URL`), so every `type:'user'` function rejects the Playwright preview origin `http://localhost:8080` (D-03) at the CORS preflight. Reproduced live (playwright-cli console):

```
Access to fetch at '.../functions/v1/analyze-resume' from origin 'http://localhost:8080'
blocked by CORS policy: 'Access-Control-Allow-Origin' header value
'https://strivoai-git-preview-kapura3-stars-projects.vercel.app' is not equal to the supplied origin.
```

Same block hits `ocr-pdf` and `create-checkout-session`. **Flow 1 passes** because Supabase Auth/GoTrue is not `APP_URL`-gated.

**Fix (operator/infra, one of):** (1) set `APP_URL=http://localhost:8080` on the TEST project's function env and redeploy the user functions (TEST ONLY); (2) multi-origin allowlist in `_shared/cors.ts` (larger, Phase-5/CI-env scope); or (3) point the gate's preview at the already-allowed Vercel origin (tensions with D-03). The specs go green unchanged once the localhost origin is allowed.

## Live verify:baseline evidence (Task 4 human-verify)

Honest, unmasked results (no retries, no weakened assertions):

| Layer | Command | Result |
|-------|---------|--------|
| vitest | `npm run test` | `7 failed | 464 passed` — the 7 are the PRE-EXISTING, deterministic, out-of-scope set from 01-01/01-02 (see deferred-items.md); NOT a new regression from this plan. |
| deno offline | `npm run test:edge` | **`284 passed | 0 failed`** (GREEN). |
| Playwright E2E | `npm run test:e2e` | `3 passed | 2 failed | 1 skipped`. PASS: setup, Flow 1 (auth/session), Flow 3 reconcile. FAIL: Flow 2 (resume) + Flow 3 clientSecret/iframe — both solely from the TEST-project CORS precondition above. SKIP: quarantined card-submit (by design). |

`verify:baseline` is therefore **GREEN at the deno layer, at-known-baseline at the vitest layer, and blocked only at the two CORS-gated E2E flows** — a single operator/infra fix (allow the localhost origin on the TEST project) turns Flows 2 & 3 green.

## User Setup Required

**One TEST-project infra change unblocks Flows 2 & 3 (operator action — never production):**
- Allow the Playwright preview origin `http://localhost:8080` through the TEST project's user-facing edge-function CORS — e.g. set the TEST project's `APP_URL` function secret to `http://localhost:8080` and redeploy the user functions, OR extend `_shared/cors.ts` to a TEST-only multi-origin allowlist. AI_TEST_MODE stays TEST-only; production deploy scripts must NOT be touched.

## Next Phase Readiness
- **All 3 specs + seed + storageState fixture are authored, committed, and parse/list cleanly.** Flow 1 is green live; Flow 3 reconcile is green live; Flow 2 + Flow 3 clientSecret/iframe are correct and will pass once the TEST CORS origin is fixed.
- **Plan 01-05 (gate doc / required-check):** must document (a) the integration-proven Stripe scope + the quarantine register row for the 4242 card-submit, (b) the AI_TEST_MODE TEST-only guard, and (c) the TEST-project localhost-CORS precondition as a gate prerequisite.
- **Blocker:** the localhost-origin CORS allowance on the TEST project is the one outstanding item before the full `verify:baseline` E2E layer is green end-to-end.

## Self-Check: PASSED

- FOUND: e2e/global-setup.ts, e2e/auth.setup.ts, e2e/auth-session.spec.ts, e2e/resume-analysis.spec.ts, e2e/stripe-checkout.spec.ts
- FOUND: e2e/fixtures/test-resume.pdf (valid 1-page PDF), scripts/make-e2e-fixture-pdf.cjs, .gitattributes
- FOUND: .planning/phases/01-testing-strategy-regression-baseline/01-03-SUMMARY.md
- FOUND commits: 7bc113c (Task 1), d3601ce (gitattributes), ab0febf (Flows 1&2), 5ae7662 (Flow 3)
- Negative security assertions VERIFIED: service-role key in ZERO .spec.ts; `AI_TEST_MODE`/`anthropic` appear ONLY in explanatory comments (no env read, no mock, no page.route to Anthropic); Stripe spec uses only the literal `4242 4242 4242 4242`; `.auth/user.json` + `.env.test.local` gitignored and never staged.
- Live evidence recorded honestly: setup + Flow 1 + Flow 3 reconcile GREEN; Flow 2 + Flow 3 clientSecret/iframe RED solely from the TEST-project CORS precondition (logged in deferred-items.md); quarantined card-submit SKIPPED by design.

---
*Phase: 01-testing-strategy-regression-baseline*
*Completed: 2026-06-10*
