# Phase 02 — Measurement Prerequisites (02-PREREQS.md)

**Status:** Section A confirmed, Section B **LOCKED**, Section D approved (Tasks 2 and 3 of plan 02-01 closed 2026-07-21).
**Consumed by:** plan 02-05 (TEMP cap lockstep edit) and plan 02-06 (the 21 measurement runs).
**Rule:** no lockstep source file is edited until Section D carries both approvals.

---

## Section A — Account requirement (BLOCKING)

### Why a second account is mandatory

`supabase/functions/_shared/auth.ts` elevates the admin email to `elite` **unconditionally**, on
both authenticated paths:

| Site | Path | Behaviour |
|---|---|---|
| `auth.ts:31`, `:34` | `ADMIN_EMAIL` constant | defaults to `strivolife@gmail.com` |
| `auth.ts:155-167` | user-auth (JWT) path | `isAdmin` ⇒ tier forced to `'elite'` |
| `auth.ts:224-255` | internal / job path | `isAdmin` ⇒ tier forced to `'elite'` |

There is **no request-body override** — a `tier` field in the request body cannot down-shift an
admin to free. Therefore the operator's own admin account can produce **ZERO free-tier telemetry
rows**. Every free-tier row it would emit is stamped `elite`.

Consequence: the 9 free-tier runs (Resume ×3, LinkedIn ×3, Career Compass ×3) **require a second,
non-admin production account**. This is the only dependency RESEARCH §5/§16 classifies as
"missing with no fallback".

### Explicitly NOT recommended: temporarily overriding `ADMIN_EMAIL`

Do **not** repoint the `ADMIN_EMAIL` Supabase secret for the measurement window. That secret is
not scoped to tier resolution — it also gates:

- **admin-panel access** (the admin RPC surface keys off the same identity), and
- **the billing-period guard exemption**
  (`supabase/migrations/20260717000000_fix_billing_period_guard_admin_exemption.sql`).

Flipping it would silently change two unrelated production behaviours for the duration of the
window, and any run performed while it is flipped is un-auditable after it is flipped back.
Use a second real account instead.

### Confirmed run-account design (Task 2, operator, 2026-07-21)

The operator's design uses **six accounts — 3 free-tier and 3 Elite** — not one account per tier.
The Elite accounts are upgraded to Elite **via the admin panel**, so they are ordinary users whose
`profiles.subscription_tier` is `elite`; none of them is `ADMIN_EMAIL`, so none of them takes the
`auth.ts` tier-forcing path. That keeps every run's tier a genuine database fact rather than an
elevation artifact.

| Slot | Email | Tier | Verified |
|---|---|---|---|
| `FREE_ACCOUNT_1` | `x9gns@web-library.net` | free | ✅ prod, read-only, 2026-07-21 |
| `FREE_ACCOUNT_2` | _supplied by operator at run time (02-06)_ | free | pending |
| `FREE_ACCOUNT_3` | _supplied by operator at run time (02-06)_ | free | pending |
| `ELITE_ACCOUNT_1` | _supplied by operator at run time (02-06)_ | elite (admin-panel upgrade) | pending |
| `ELITE_ACCOUNT_2` | _supplied by operator at run time (02-06)_ | elite (admin-panel upgrade) | pending |
| `ELITE_ACCOUNT_3` | _supplied by operator at run time (02-06)_ | elite (admin-panel upgrade) | pending |

Placeholders are named, not invented — do **not** substitute guessed addresses.

**Prod verification of `FREE_ACCOUNT_1` (read-only via prod Supabase MCP, orchestrator-run):**

- `auth.users` / `public.profiles`: `x9gns@web-library.net` → user_id `51238564-4e75-4cbb-a661-1ab173e338ba`,
  `subscription_tier = 'free'`. Confirmed **not** `ADMIN_EMAIL`.
- `public.user_merits`: `subscription_balance = 10`, `shop_balance = 0`, `lifetime_granted = 10`,
  `subscription_reset_date = 2026-08-21`, `free_linkedin_scan_used = false`.
- `public.merit_feature_costs` (free tier): `resume_analysis = 3`, `linkedin_grading = 3`,
  `career_compass = 3`.

### CONSTRAINT — free-tier Merit budget forces the 3-account split

A free account holds **10 Merits**. One full free triad (Resume 3 + LinkedIn 3 + Career 3) costs
**exactly 9**. So each free account affords **exactly one run of each feature, with 1 Merit spare**.

```
10 Merits - (3 + 3 + 3) = 1 Merit remaining
```

All 9 free runs could **NOT** have come from a single account — that would need 27 Merits. The
3-account split is therefore a hard requirement, and Section C's assignment must give each free
account **exactly one Resume + one LinkedIn + one Career run** — not, for example, 3 Resume runs on
one account. Section C is written to that constraint.

`free_linkedin_scan_used = false` may make the first LinkedIn scan free on each account. **Do not
depend on that for headroom** — the budget above assumes the scan is charged.

**PII note (T-02-01):** record the account **email only** — never a password, token, or service
key. `x9gns@web-library.net` is a disposable relay address, not a personal one.

`src/test/security/phase9-pii-guard.test.ts` was run after this value was written: **18/18 pass**.
⚠️ **But that pass is not coverage for this file.** The guard's scan roots are
`resolvePlanningPhaseDir('09-final-verification-milestone-report')` and `scripts/test-resumes/`
(`phase9-pii-guard.test.ts:26-30, 201`) — it does **not** walk
`.planning/phases/02-ai-token-cost-optimization/`. The plan's threat model T-02-01 assumed the
guard scans phase-directory markdown generally; it does not. So the email and user_id recorded
above are protected by **manual discipline only**, not by an automated gate. Treated as a
deferred item (see `deferred-items.md`), not fixed here — this plan is forbidden from editing
`src/`. If a later-supplied address is a personal one, use a `FREE_TEST_ACCOUNT` placeholder and
hold the literal out of the repo.

**Merit note:** per 02-CONTEXT the real Merit burn for these runs is accepted. Do **not** pre-grant
Merits with a hand-rolled ledger `INSERT` — repo convention is that only the `refund_merits` /
merit-gateway RPCs may write the merit ledger.

---

## Section B — TEMP diagnostic caps — **LOCKED** (operator: `approve-as-proposed`, 2026-07-21)

> **LOCKED.** The operator approved this table verbatim as `approve-as-proposed` — no narrowing,
> no per-cell substitutions. Plan **02-05 implements exactly these values** and may not re-litigate
> them. Any change requires a new operator decision recorded in Section D.

**Rationale (verbatim):** _max_tokens is a CEILING not a target — an unused ceiling costs nothing,
and a cap below the model's appetite produces a 422 + Merit refund._

Anthropic bills only tokens actually generated, so a high TEMP ceiling is free unless the model
genuinely wants the room. The caps must be raised at all because Career Compass elite `base`
truncated at exactly its 4500 cap on 2026-07-17 (`out=4500`, `outLen=17286`) → terminal 422 →
Merit refund. Measuring at today's caps reads the *ceiling* back to us, not the model's real
appetite.

### Current state (source of truth: `src/config/pricing-config.ts:114-120` — the maxtoken TRACKER is STALE)

| Feature | free | pro | elite |
|---|---|---|---|
| resumeAnalysis | 9000 | 20000 | 20000 |
| careerCompass | 4800 | 10000 | 10000 |
| recruitingLens | 0 | 15000 | 15000 |
| linkedinGrader | 12000 | 9000 | 9000 |
| interviewPrepCoach | 0 | 12000 | 12000 |
| **tier sum** | **25800** | **66000** | **66000** |

### Hard invariants every TEMP value must satisfy

1. `ABSOLUTE_MAX_TOKENS = 12000` per-**call** clamp (`_shared/anthropic.ts:7-14`)
2. per-tier `CALL_CONFIGS` sum ≤ `getMaxOutput(feature, tier)` (boot-time throw)
3. **GATE-09**: resume free < 50% of resume elite (`analyze-resume/index.ts:377-379`)
4. Career brevity ratio: `CAREER_BREVITY_TARGET_TOKENS[tier] * 1.8 <= ceiling`
   (`analyze-career/index.ts:127-147`)

### Proposal

| Feature × tier | Current | TEMP proposal | Ceiling change | Invariant recheck |
|---|---|---|---|---|
| Resume **free** | 9000 | **9000 (KEEP)** | none | GATE-09 forbids ≥ 10000 while elite is 20000. Already 1.8× the pre-TEMP 5000. |
| Resume **pro/elite** (per call) | 5000 / 5000 / 5000 / 3000 = 20000 | **8000 / 8000 / 8000 / 6000 = 30000** | 20000 → **30000** | Each call ≤ 12000 ✅. Sum 30000 = ceiling 30000 ✅. GATE-09: free 9000 < 15000 ✅ (raising elite *relaxes* the gate). |
| Career **free** (base) | 4800 | **9000** | 4800 → **9000** | Single call 9000 ≤ 12000 ✅. Also set `base.maxTokensFree` 9000. Brevity: 2200 × 1.8 = 3960 ≤ 9000 ✅. |
| Career **pro/elite** | 4500 / 3500 / 2000 = 10000 | **9000 / 6000 / 4000 = 19000** | 10000 → **19000** | Each call ≤ 12000 ✅. Sum 19000 = ceiling 19000 ✅. Brevity: 4500 × 1.8 = 8100 ≤ 19000 ✅. |
| LinkedIn **free** | 12000 | **12000 (KEEP)** | none | Already exactly at `ABSOLUTE_MAX_TOKENS`; cannot go higher. |
| LinkedIn **pro/elite** | 9000 | **12000** | 9000 → **12000** | Single call 12000 = clamp ✅ (at the limit, not over). |
| Recruiting Lens **pro/elite** (per call) | 5000 × 3 = 15000 | **9000 × 3 = 27000** | 15000 → **27000** | Each call 9000 ≤ 12000 ✅. Sum 27000 = ceiling 27000 ✅. |
| Recruiting Lens **free** | 0 | **0 (KEEP)** | none | Feature is locked at free. |
| Interview Prep (all tiers) | 0 / 12000 / 12000 | **unchanged** | none | Deferred out of Phase 02 measurement. |

### Resulting tier sums (pre-computed for the 02-05 snapshot `tierSums` edit)

**Free: 25800 → 30000.** Re-derived by summing the actual free-tier cells under the proposal:

```
resumeAnalysis     free  9000  (unchanged)
careerCompass      free  9000  (4800 -> 9000, delta +4200)
recruitingLens     free     0  (unchanged, locked)
linkedinGrader     free 12000  (unchanged, at clamp)
interviewPrepCoach free     0  (unchanged, locked)
                        ------
                         30000
```

Check: 25800 + 4200 = 30000 ✅ — `careerCompass.free` is the **only** changed free cell.

**Pro / Elite: 66000 → 100000.**

```
resumeAnalysis     20000 -> 30000   (+10000)
careerCompass      10000 -> 19000   ( +9000)
recruitingLens     15000 -> 27000   (+12000)
linkedinGrader      9000 -> 12000   ( +3000)
interviewPrepCoach 12000 -> 12000   (     0)
                   -----    ------    -----
                   66000   100000   +34000
```

Check: 66000 + 34000 = 100000 ✅.

> **IMPORTANT for 02-05:** `src/config/__tests__/sc12-snapshot.test.ts` computes the free-tier sum
> **LIVE** from `maxTokensOutput` and compares it against the hardcoded snapshot value. An
> incorrect sum written here fails that test in 02-05. The 30000 above was re-derived by summing
> the actual free-tier cells, not by trusting the delta.

Every proposed value is ≤ `ABSOLUTE_MAX_TOKENS` (12000) **per call**, and every affected boot
invariant has been re-checked in the table above.

**Known risk carried into the window (RESEARCH Pitfall 4):** a higher cap that the model *actually
uses* generates for longer, and LinkedIn's server deadline is `LINKEDIN_TOTAL_DEADLINE_MS = 165_000`.
Treat any `408` / abort during the window as a **measurement failure, not a data point**. Do not
widen timeouts in this phase — flag it instead.

---

## Section C — The 21 runs

Composition: Resume free ×3, Resume elite ×3, LinkedIn free ×3, LinkedIn elite ×3,
Career Compass free ×3, Career Compass elite ×3, Recruiting Lens elite ×3.

Deliberate exclusions:
- **No Recruiting Lens free row** — free cap is 0, the feature is locked at free tier.
- **No Pro rows** — per 02-CONTEXT, Pro mirrors Elite (`normalizeActiveTier` collapses them).
- **No Interview Prep rows** — deferred out of this phase.

Accounts are the six slots defined in Section A. **`ADMIN_EMAIL` (`strivolife@gmail.com`) is not
used for any run** — the Elite runs use ordinary admin-panel-upgraded Elite accounts so that every
row's tier is a real database fact, not an `auth.ts` elevation artifact.

The free-run assignment is dictated by the Merit constraint in Section A: 10 Merits per free
account, 9 Merits per triad ⇒ **each free account performs exactly one Resume + one LinkedIn + one
Career run.**

| # | Feature | Tier | Account slot | Input description (fill during 02-06) |
|---|---|---|---|---|
| 1 | Resume Analysis | free | FREE_ACCOUNT_1 | |
| 2 | Resume Analysis | free | FREE_ACCOUNT_2 | |
| 3 | Resume Analysis | free | FREE_ACCOUNT_3 | |
| 4 | Resume Analysis | elite | ELITE_ACCOUNT_1 | |
| 5 | Resume Analysis | elite | ELITE_ACCOUNT_2 | |
| 6 | Resume Analysis | elite | ELITE_ACCOUNT_3 | |
| 7 | LinkedIn Grader | free | FREE_ACCOUNT_1 | |
| 8 | LinkedIn Grader | free | FREE_ACCOUNT_2 | |
| 9 | LinkedIn Grader | free | FREE_ACCOUNT_3 | |
| 10 | LinkedIn Grader | elite | ELITE_ACCOUNT_1 | |
| 11 | LinkedIn Grader | elite | ELITE_ACCOUNT_2 | |
| 12 | LinkedIn Grader | elite | ELITE_ACCOUNT_3 | |
| 13 | Career Compass | free | FREE_ACCOUNT_1 | |
| 14 | Career Compass | free | FREE_ACCOUNT_2 | |
| 15 | Career Compass | free | FREE_ACCOUNT_3 | |
| 16 | Career Compass | elite | ELITE_ACCOUNT_1 | |
| 17 | Career Compass | elite | ELITE_ACCOUNT_2 | |
| 18 | Career Compass | elite | ELITE_ACCOUNT_3 | |
| 19 | Recruiting Lens | elite | ELITE_ACCOUNT_1 | |
| 20 | Recruiting Lens | elite | ELITE_ACCOUNT_2 | |
| 21 | Recruiting Lens | elite | ELITE_ACCOUNT_3 | |

**Per-account load:**

| Slot | Runs | Composition | Free-tier Merit cost |
|---|---|---|---|
| FREE_ACCOUNT_1 | 3 | Resume 1 + LinkedIn 1 + Career 1 | 9 of 10 (1 spare) |
| FREE_ACCOUNT_2 | 3 | Resume 1 + LinkedIn 1 + Career 1 | 9 of 10 (1 spare) |
| FREE_ACCOUNT_3 | 3 | Resume 1 + LinkedIn 1 + Career 1 | 9 of 10 (1 spare) |
| ELITE_ACCOUNT_1 | 4 | Resume 1 + LinkedIn 1 + Career 1 + RCL 1 | Elite balance — confirm before run 4 |
| ELITE_ACCOUNT_2 | 4 | Resume 1 + LinkedIn 1 + Career 1 + RCL 1 | Elite balance — confirm before run 5 |
| ELITE_ACCOUNT_3 | 4 | Resume 1 + LinkedIn 1 + Career 1 + RCL 1 | Elite balance — confirm before run 6 |

There is **no spare capacity on the free accounts** beyond 1 Merit. A failed free run that still
burns a Merit (i.e. one that is not refunded) leaves that account unable to complete its triad —
so verify the refund landed before moving on, and be prepared to have a fourth free account
available if a run has to be repeated.

For each triple, vary the input along **length / density / sparsity** (e.g. one short-and-sparse,
one typical, one long-and-dense) so the measured peak reflects the worst realistic case, not one
input shape repeated three times.

### Cache-busting note (RESEARCH Open Q3) — READ BEFORE RUN 1

A **cache hit returns with ZERO Anthropic calls and therefore emits ZERO telemetry rows.** A run
that "succeeded" from the UI's point of view can contribute nothing to the dataset.

Two consequences:

1. Inputs must be **genuinely distinct** across runs — not the same resume/profile/role with a
   trivial edit. The idempotency/cache identity is a content hash.
2. Telemetry **row counts must be checked after EACH run**, not once at the end. Discovering at
   run 21 that runs 4-6 were cache hits means redoing them after the TEMP window has already been
   partly spent.

---

## Section D — Approvals

### D-1 — Non-admin free-tier account (Task 2, checkpoint: human-action)

| Field | Value |
|---|---|
| Status | ✅ **APPROVED / RESOLVED** |
| Design | 3 free accounts + 3 admin-panel-upgraded Elite accounts (`ADMIN_EMAIL` unused for runs) |
| `FREE_ACCOUNT_1` | `x9gns@web-library.net` — user_id `51238564-4e75-4cbb-a661-1ab173e338ba` |
| Tier verified `free` (prod MCP, read-only) | ✅ `profiles.subscription_tier = 'free'`, not `ADMIN_EMAIL` |
| Merit balance | `subscription_balance = 10`, `shop_balance = 0`, reset `2026-08-21` — affords exactly one triad (9) |
| Remaining 5 slots | named placeholders; operator supplies at run time in 02-06 |
| Confirmed on | 2026-07-21 |

### D-2 — TEMP diagnostic cap values (Task 3, checkpoint: decision)

| Field | Value |
|---|---|
| Status | ✅ **APPROVED — Section B LOCKED** |
| Verdict | `approve-as-proposed` (no narrowing, no per-cell substitutions) |
| Final TEMP values | Exactly the Section B table: Resume free 9000 KEEP · Resume pro/elite 8000/8000/8000/6000 = 30000 · Career free 9000 · Career pro/elite 9000/6000/4000 = 19000 · LinkedIn free 12000 KEEP · LinkedIn pro/elite 12000 · Recruiting Lens pro/elite 9000×3 = 27000 |
| Tier sums | Free **30000** · Pro/Elite **100000** |
| Approved on | 2026-07-21 |

Both blocks read **APPROVED** — 02-05 and 02-06 are unblocked. 02-05 implements Section B verbatim.
