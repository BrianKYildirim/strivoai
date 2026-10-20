---
phase: 28-merge-redeploy-baseline
wave: 3
status: in-progress
created: 2026-05-12
note: LOCAL ONLY — never committed (CLAUDE.md memory rule). SC #3 section is pre-filled per Phase 47 supersession; all other sections require operator paste.
---

# Phase 28 Wave 3 — Production Redeploy + Smoke (Evidence)

## Scope Amendment (2026-05-12)

Per the 2026-05-11 operator directive and Phase 47 supersession of Phase 41:
- **SC #3 is closed via the staging-only branch** — no prod IPC repro is performed in Wave 3. See `## SC #3` section below for the citation chain.
- **Task 3 (prod IPC repro) is SUPERSEDED** in `28-03-PLAN.md`. The Interview Prep slot in the 5-feature smoke (Task 4) is logged as `N/A — gated off prod by Phase 47`.
- All other Wave 3 tasks (prod deploy, SC #4 surfaces, 4-feature non-IPC smoke, 5-min soak) remain operator-led and must be captured below.

---

## Production Deploy (D-05/D-06/D-09)

> [OPERATOR] Paste output from `pwsh -File scripts/deploy-production.ps1 2>&1 | tee ~/strivo-ipc-payload/deploy-production.log`.
>
> Requirements (per Task 1 acceptance criteria):
> - Final exit code: `0`
> - ≥35 lines matching `^Deploying [a-z\-]+ to production\.\.\.$`
> - Both `Deploying interview-prep-analyze to production...` and `Deploying interview-prep-evaluate to production...` present
> - Literal `Production deploy complete.` footer (NOT `Staging deploy complete.` — T-28-01 mitigation)

```
<paste deploy log tail here — final ~50 lines including the per-function "Deploying ..." headers and the "Production deploy complete." footer>
```

- Exit code: `<0 / non-zero>`
- Deploy start UTC: `<timestamp>`
- Deploy end UTC: `<timestamp>`
- Total runtime: `<seconds>`
- 35-function attestation: `<PASS / FAIL>`

---

## SC #4: Phase 25/26/27 Surfaces (Production)

### Surface 1 — `MeritCostPreview` mounts on `https://strivo.ai/career-compass`

Static check (env-agnostic; same as Wave 2):
```bash
git show main:src/pages/CareerCompass.tsx | grep -nE "MeritCostPreview"
```

```
<paste output — expect 2+ hits: import + mount>
```

Live: screenshot to `~/strivo-ipc-payload/sc4-meritcostpreview-prod.png` — `<path captured / TODO>`.

### Surface 2 — `refundMeritsForJob` `alreadyRefunded` recognition (worker tests env-agnostic)

Per Wave 2 §"SC #4 Surface 2" — `deno test --allow-all` was already 8/8 + 9/9 PASS on post-FF main. Re-running here is optional. Operator notes: `<re-ran / relied on W2 evidence>`.

### Surface 3 — Phase 27 410-Gone shim at PROD `/stripe-webhook`

```bash
curl -X POST -i "https://zjpjapgraoxdukdvpjes.functions.supabase.co/stripe-webhook" \
  -H "content-type: application/json" -d '{}' 2>&1 | head -20
```

```
<paste curl output — first line MUST match HTTP/.* 410; body MUST contain endpoint_deprecated>
```

CRITICAL (T-28-01 + Pitfall 5): URL probed is `/stripe-webhook` (legacy shim), NOT `/stripe-webhook-handler` (active handler).

**Surface verdict (3/3):** `<PASS / FAIL>`. D-17.2 trigger: `<NOT FIRED / FIRED — details>`.

---

## SC #3: IPC 503 — Closed via Staging-Only Branch (Phase 47 Supersession)

**This section is pre-filled. No prod IPC work is performed in Wave 3.**

### Closure citation chain

1. **Operator directive (2026-05-11)** narrowed SC #3 scope. Captured in `.planning/ROADMAP.md` Phase 28 SC #3:
   > "Interview Prep 503 verification narrowed to **staging only** ... Production-side Interview Prep is gated off entirely via Phase 47 — no production repro required."
2. **Phase 47 shipped (2026-05-11)** — landed Coming Soon treatment on every Interview Prep surface on production via `VITE_FEATURE_INTERVIEW_PREP=false` on Production scope; `=true` on Preview + Development. Backend IPC functions remain deployed but no user-facing surface reaches them on production. See `.planning/STATE.md` Phase 47 closure entry.
3. **Phase 41 superseded** — IPC-01..04 / CACHE-08 / TEST-04 deferred to a future Interview Prep milestone (ROADMAP.md). No Phase 41 hand-off ticket from this wave.
4. **Wave 2 staging evidence (2026-05-07)** — `28-W2-EVIDENCE.md` and `28-02-SUMMARY.md` Task 3 + Task 4 captured:
   - Elite tier on freshly-redeployed STAGING backend: `HTTP 200 TTFB 76.6s`, response shape-validated against `InterviewPrepResponseSchema` (all 5 top-level keys + full Elite payload).
   - IPC 503 reproduced on un-redeployed PROD backend in the same browser session (frontend env pointed at `zjpjapgraoxdukdvpjes`).
   - Combined: same browser, same payload class, two backend versions → stale prod 503 + fresh staging 200 → **drift hypothesis empirically confirmed**.

### Verdict

`SC #3: PASS via staging-only branch.` No prod IPC repro required; no Phase 41 hand-off; no D-16 trigger.

---

## D-09: 5-Feature Production Smoke

> [OPERATOR] Sign into `https://strivo.ai` (NOT staging) with a Pro test account. Exercise each feature once. Wait for Vercel deploy = `Ready` before starting the timer (Pitfall 4).

| Feature                            | Result   | HTTP | Notes |
|------------------------------------|:--------:|:----:|-------|
| Resume Analysis                    | `PASS / FAIL` | `...` | D-17.1 critical — MUST PASS |
| Career Compass                     | `PASS / FAIL` | `...` | D-17.1 critical — MUST PASS |
| LinkedIn Grader                    | `PASS / FAIL` | `...` | D-17.1 |
| Recruiting Lens                    | `PASS / FAIL` | `...` | D-17.1 |
| Interview Prep                     | **N/A — gated off prod by Phase 47** | — | Do NOT attempt; route hidden by `VITE_FEATURE_INTERVIEW_PREP=false` |

Optional Stripe Live shop test ($0.50): `<performed / skipped>`. `merit_shop_purchases` row inserted within 10s: `<YES / NO / N/A>`.

**Smoke verdict:** `<4/4 PASS / D-17 trigger fired — details>`.

---

## D-09: 5-Minute Production Log Soak

> [OPERATOR] Watch Supabase Dashboard prod project `zjpjapgraoxdukdvpjes` function-logs view for ≥5 minutes.

- Soak start UTC: `<timestamp>`
- Soak end UTC: `<timestamp>`
- Duration: `<≥5 min>`
- Outcome: `<clean / errors observed: ...>`
- Per-function error counts (if errors): `<...>`
- D-17 evaluation: `<NOT TRIGGERED / TRIGGERED — details>`

---

## Wave 4 Promotion Gate

- Production deploy exit 0 + 35 functions: `<GO / NO-GO>`
- SC #4 surfaces 3/3 PASS: `<GO / NO-GO>`
- Non-IPC 4-feature smoke 4/4 PASS: `<GO / NO-GO>`
- Soak clean: `<GO / NO-GO>`
- D-17 NOT triggered: `<GO / NO-GO>`

**Final decision:** `<GO Wave 4 / HALT — operator decides revert>`.

---

## Operator Sign-off

- Operator initials: `<...>`
- Timestamp: `<UTC>`
- Notes: `<any deviations from plan + rationale>`
