# Pitfalls Research

**Domain:** Adding a persistent AI-analysis lifecycle + Merit exactly-once accounting, centralized multi-origin CORS, deterministic evidence-based scoring, strict non-masking output validation, a retroactive security audit, and Paddle retirement — onto a LIVE Supabase (Deno edge + Postgres + Auth) + React/Vite + Anthropic system that v4.0 already hardened.
**Researched:** 2026-06-25
**Confidence:** HIGH for code-grounded pitfalls (verified against the actual edge functions, RPCs, and migrations); MEDIUM for inferred root-causes (LinkedIn score clustering, second-run drift) and multi-workstream sequencing risk.

> Scope discipline: every pitfall below is specific to ADDING these capabilities to THIS system. Each ties back to a non-negotiable guardrail (no hidden failure, no fabricated/personalized results, no fake/hardcoded scores, never charge for failed/unsaved analyses, no double charge/refund, no weakening of v4.0 protections, no "fixed because the error disappeared") and to the v4.0 `verify:baseline` gate. The roadmapper assigns concrete phase numbers; pitfalls are mapped to the six v5.0 **workstreams** (W1 Security, W2 CORS, W3 Shared lifecycle/Merit, W4 Feature repairs, W5 Dashboard, W6 Paddle retirement).

---

## Critical Pitfalls

### Pitfall 1: `withMerits` never forwards an idempotency key — the DB substrate exists but production deducts non-idempotently

**What goes wrong:**
The Merit idempotency machinery is fully built and unit-tested at the DB layer: a 4-arg `check_and_deduct_merits(uuid, text, text, text)` overload with a partial UNIQUE index on `idempotency_key` that absorbs retry-storms (`20260512000003_merit_transactions_idempotency.sql`, `merit-idempotency.test.ts`). But **every production call site goes through `withMerits`, and `withMerits` calls the 3-arg RPC** (`merit-gateway.ts` line 201: `check_and_deduct_merits` with only `p_user_id, p_feature, p_tier`). The idempotency key is never threaded from the request to the RPC. So today: two tabs, a double-click, an AbortController re-fire, or a refresh-then-resubmit each produce an independent deduction and an independent analysis. The "exactly-once" guarantee the lifecycle promises is, in the live code, "at-least-once."

**Why it happens:**
The idempotency substrate was shipped in Phase 29 ahead of the frontend wiring ("Phase 31 wires the frontend") and the gateway wiring was deferred. A reader who greps for `idempotency_key` finds tests passing and assumes the system is idempotent end-to-end. It is not — the seam is the gateway, not the RPC.

**How to avoid:**
- W3 must make the shared lifecycle generate **one idempotency key per analysis attempt** (client-supplied UUID, stable across retries of the *same* attempt) and thread it: frontend → edge function → `withMerits(ctx, feature, fn, { idempotencyKey })` → 4-arg `check_and_deduct_merits`.
- The key must be **derived from the analysis intent, not the request** (same inputs + same feature + same user + same attempt = same key) so a refresh/resubmit of an unchanged analysis returns `already_deducted` instead of charging again.
- `withMerits` must treat `already_deducted: true` as "reuse the existing transaction/result," not as a fresh deduction.

**Warning signs:**
- `merit_transactions` shows two `feature-deduct` rows with different `deduction_id` for the same user within seconds.
- `reconcile_merit_balance` drift stays 0 (balances tie out) but users report being charged twice — because each charge is internally consistent; only the *count* is wrong.
- Load/concurrency test: fire 5 parallel identical submits, observe 5 deductions.

**Phase to address:** W3 (shared lifecycle), earliest plan. This is the spine of the workstream.

**Detection:** New deno test extending `merit-idempotency.test.ts` that drives the full `withMerits` path (not just the raw RPC) with a repeated key and asserts exactly one deduction. Add to `verify:baseline`.

---

### Pitfall 2: Refunding (or erroring) AFTER the result is durably saved — the exact inverse of "never charge for failed analyses"

**What goes wrong:**
In `grade-linkedin/index.ts`, inside the paid `withMerits` callback, the sequence is: AI call → `storeAndNotify()` (which **inserts `linkedin_grades`, inserts `analysis_results`, fires the email**) → THEN `recordUsageWithAnalysis(...)`; and if that usage write fails, the code does `throw new MeritRefundable(500, 'Could not record LinkedIn grade usage.')` (lines 554-559). The comment two lines above literally says *"Non-blocking — a failed insert logs but does NOT fail the user request"* — but the code throws. Because the throw is `MeritRefundable`, `withMerits` **refunds the Merit** that paid for an analysis whose result is already persisted and emailed. Net effect: the user gets a saved grade in History, an email, a refund (free analysis), AND a 500 error toast. That is simultaneously: charge-released-on-success (double-benefit), success-reported-as-failure (hidden success), and a Merit-accounting lie. The free-scan branch (lines 518-522) has the same throw-after-save shape and reports a saved grade as a 500.

**Why it happens:**
"Throw on any DB error" is the reflex, and `MeritRefundable` is the ambient error type in these handlers. Refund classification is by *error type*, not by *lifecycle position*. Once you've crossed the "result is durably saved" line, no downstream error should ever refund or report failure — but the code has no concept of that line.

**How to avoid:**
- W3's lifecycle must make **`saving → completed` the point of no return**: after the analysis row is committed, Merit is *settled* (terminal) and the request is a success regardless of best-effort side-effects (usage_tracking row, email, extract webhook, cache write).
- Best-effort post-save steps must **log-and-continue**, never `throw MeritRefundable`. Reserve `MeritRefundable` for failures *before* a durable result exists.
- Separate "reserve" (pre-work) from "settle" (post-save). Refunds may only fire from states *before* `saving`.

**Warning signs:**
- A `linkedin_grades` / `analysis_results` row exists for a request the user saw fail.
- `merit-refund` log line emitted in the same request as a successful `*_insert` / `analysis_results` insert.
- Users report "it said it failed but it's in my history."

**Phase to address:** W3 (lifecycle state machine + settle-on-saved semantics). Also a remediation target when W4 touches each feature.

**Detection:** deno test: stub the usage/email/cache writes to fail, assert (a) the analysis row persists, (b) NO refund RPC is called, (c) the handler returns 200. Add a `reconcile_merit_balance` assertion that a saved analysis leaves exactly one net deduction.

---

### Pitfall 3: Settling Merits before the result is saved (charge-then-lose)

**What goes wrong:**
The opposite ordering failure. Current sync features deduct up-front inside `withMerits` and *rely on the `fn` throwing* to trigger a refund. If a feature is refactored so the deduction commits but the save path can silently no-op (e.g. an insert that returns no error but writes nothing, an `analysis_results` insert that fails *non-throwingly*, or a return-without-persist branch), the Merit is gone and no durable result exists — and because nothing threw, no refund fires. `grade-linkedin`'s `persistLinkedInAnalysis` already *returns null* on insert failure (it `console.warn`s and returns `null`) rather than throwing; the linkedin_grades insert is the one that throws, but the `analysis_results` insert is treated as optional. A lifecycle that settles on "AI returned" rather than "result committed" would charge for unsaved analyses.

**Why it happens:**
Up-front deduction is simpler and matches the v2.0 "pre-call deduction" decision. The save is an afterthought; partial-persist (one table writes, the linked table doesn't) is invisible unless you check both.

**How to avoid:**
- Lifecycle order is **reserve_merits → … → validating_output → saving → (commit) → settle**. Settlement is gated on a verified durable write, not on the AI response.
- Make the durable write **atomic** (single row, or a transaction/RPC that writes the analysis + its index together) so "saved" is unambiguous.
- On any pre-settle failure: refund (transient) or mark `failed`/`retryable_failed` and refund. Never leave a charged-but-unsaved terminal state.

**Warning signs:** `merit_transactions` deduction with no corresponding `analysis_results`/feature row; History shows fewer analyses than Merits spent; user says "I paid and got nothing."

**Phase to address:** W3.

**Detection:** Invariant test — for any settled deduction there exists exactly one durable analysis row; run `reconcile_merit_balance` + a join-count assertion in the lifecycle test suite.

---

### Pitfall 4: Stuck / never-terminal lifecycle states on a system that already has an async job queue

**What goes wrong:**
The proposed states include `retryable_failed` and intermediate states (`extracting_data`, `generating`, `saving`). The existing `analysis_jobs` queue (`submit-resume-analysis-job` / `process-resume-analysis-job`) already has `pending | retrying | processing` plus terminal states, and a worker triggered fire-and-forget. If the new shared lifecycle is layered **on top of** the job queue without reconciling them, you get two state machines and orphan states: a row stuck in `generating`/`processing` forever because the worker crashed between states, the fire-and-forget trigger never landed, or the function timed out mid-state. There is no visible error — the user just sees a spinner (this is literally the "Onboarding Resume 'Taking Longer Than Expected' hang" in W4). Merits were reserved at submit-time (`merit_transaction_id` on the job row), so a stuck job is also a stranded reservation.

**Why it happens:**
Edge functions are stateless and time-bounded; "fire-and-forget worker trigger" (`fetch(...).catch(...)`) can silently drop. A new lifecycle that adds states without adding a **reaper** (timeout sweep that moves stale non-terminal rows to `retryable_failed`/`failed` and releases reservations) inherits every existing orphan path.

**How to avoid:**
- Every non-terminal state needs a **timestamp + max-age**; a scheduled sweep (pg_cron / scheduled function) transitions stale rows to a terminal state and triggers `refundMeritsForJob` for the stranded reservation (the gateway already exports this for async processors).
- **Map, don't duplicate:** the new lifecycle states must be a single source of truth that the `analysis_jobs` worker writes into — not a parallel column set that can disagree.
- Make state transitions **idempotent and monotonic** (can't go backwards; re-entering a state is a no-op) so a re-fired worker can't resurrect a terminal row.

**Warning signs:** rows in `generating`/`processing` older than the function timeout; reservations (`merit_transaction_id`) with no settle/refund; "Taking Longer Than Expected" with no error in logs; growing count of non-terminal rows over days.

**Phase to address:** W3 (lifecycle + reaper), and W4 specifically for the Onboarding hang.

**Detection:** Query for non-terminal rows older than N minutes (should be ~0). Add an ops query + an alert. deno test that simulates a worker death mid-`generating` and asserts the reaper terminalizes + refunds.

---

### Pitfall 5: Status-window dedup mistaken for idempotency — re-running a *completed* analysis charges and duplicates

**What goes wrong:**
`submit-resume-analysis-job` guards against double-submit with a query for an existing job whose `status IN ('pending','retrying','processing')` and `payload contains resumeId` (the `WR-04` check), *before* `withMerits`. This only dedups against **active** jobs. Once a job is `completed`/`failed`, an identical resubmit sails past the guard, deducts again, and creates a second job + second `analysis_results` row — "retry duplicating a saved result." Worse, the guard is a **TOCTOU race**: two concurrent submits both run the SELECT before either INSERT lands, both see "no active job," both deduct. The active-window check is not atomic and is not idempotency.

**Why it happens:**
A status-window query *looks* like dedup and passes manual testing (rapid double-clicks usually hit the active window). The race and the completed-job gap only show under concurrency or deliberate re-run.

**How to avoid:**
- Replace/augment the window check with the **real idempotency key** (Pitfall 1) enforced atomically by the partial UNIQUE index — that closes both the race and the completed-job gap.
- For *intentional* re-analysis (user genuinely wants a fresh run of the same resume), that must be an explicit, new-key action with its own charge and its own lifecycle row — distinguished from an accidental resubmit by the key derivation.
- Cache hits (the `precheck_cache` path) should serve identical-input reruns for free; ensure the cache key is stable (see Pitfall 8) so genuine reruns hit cache instead of re-charging.

**Warning signs:** duplicate `analysis_results` rows with identical inputs minutes apart; two deductions in a concurrency test; History showing the same analysis twice.

**Phase to address:** W3.

**Detection:** Concurrency test firing N parallel identical submits → exactly one job, one deduction, one durable row.

---

### Pitfall 6: The confirmed CORS bug — single static `APP_URL` origin rejects `www`, preview, and any second approved origin

**What goes wrong:**
`corsHeaders({ type: 'user' })` returns a **single** `Access-Control-Allow-Origin: <APP_URL>` value (`cors.ts` lines 51-54). With `APP_URL = https://strivoai.net`, a browser request from `https://www.strivoai.net` receives `Access-Control-Allow-Origin: https://strivoai.net`, which does **not** match the request Origin, so the browser blocks it — the confirmed production bug. The header is a constant, not a function of the request Origin, so apex + `www` + Vercel preview URLs + localhost can never all be served by one deploy. There is also **no `Vary: Origin`** header, so once a CDN/browser caches a response for one origin it can be replayed for another (cache poisoning / silent breakage).

**Why it happens:**
v4.0's CORS centralization (D-07) deliberately chose "return origin from `APP_URL` (not wildcard)" to be fail-closed. That was correct for single-origin, but the design hard-codes one origin and never reflects/validates against an **allowlist**. The fix is not to widen to `*` (that's forbidden on credentialed requests).

**How to avoid (W2):**
- Maintain a per-environment **allowlist** (apex, approved `www`, preview pattern, dev/local per env policy). On each request, read the `Origin` header, and **if it's in the allowlist, echo that exact origin back**; otherwise omit ACAO (fail closed → browser blocks, which is correct for disallowed origins).
- Always set **`Vary: Origin`** when the ACAO value depends on the request Origin.
- Keep fail-closed behavior: unset/unknown `APP_URL` or allowlist still throws/omits rather than wildcarding.
- Apply uniformly via the shared `cors.ts` so all ~30 active functions inherit the fix — do not patch endpoint-by-endpoint.

**Warning signs:** `www` users get "Failed to fetch"/CORS console errors while apex users succeed; preview deploys can't call functions; intermittent CORS failures behind a CDN (missing `Vary`).

**Phase to address:** W2 (cross-origin reliability), early — high user impact, low behavioral risk if regression-tested.

**Detection:** Per-function regression test (extend `cors.test.ts`) asserting: apex Origin → echoed; approved `www` Origin → echoed; disallowed Origin → no ACAO; `Vary: Origin` present; preflight and actual responses agree.

---

### Pitfall 7: Auth 401s (and other early returns) carry NO CORS headers — the browser swallows the structured error body

**What goes wrong:**
`requireAuth`'s `unauthorizedResponse()` returns `new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })` — **no CORS headers** (`auth.ts` lines 48-53). Feature handlers re-throw this Response verbatim (`grade-linkedin` line 872: `if (error instanceof Response) throw error;`). So when a JWT is missing/expired, the browser sees a cross-origin response with no `Access-Control-Allow-Origin` and **blocks it before JS can read the body** — the user gets an opaque "network/CORS error" instead of "please sign in again." This both hides a real, actionable failure (violating the "no hidden failures behind generic errors" guardrail) and masks the true cause during the CORS workstream (you'll think it's a CORS allowlist bug when it's an expired token). The same shape appears anywhere a Response is built without spreading `corsHeaders(...)` (the Paddle/webhook and method-not-allowed branches, by design, but the **user-facing** 401 is the dangerous one).

**Why it happens:**
The auth module predates the request-Origin-aware design and returns a minimal 401. Error paths are the least-tested branches and are easy to build without CORS headers.

**How to avoid (W2 + W1):**
- Every **user-type** response — success AND error, including 401/403/429/500 and preflight — must carry the (now Origin-aware) CORS headers. Centralize: an error-response helper that always spreads `corsHeaders`, used by `requireAuth` and all handlers.
- Because `requireAuth` can't know the cors type at throw time, either pass cors type into the auth helper, or have the shared handler wrapper attach CORS headers to any thrown Response before returning.
- Add an explicit invariant test: a 401 from an allowed Origin still includes ACAO so the SPA can read `{ error: 'Unauthorized' }` and trigger a token refresh / re-login.

**Warning signs:** expired-session users report a blank/opaque error; network tab shows a 401 flagged as CORS-blocked; the SPA's auto-refresh-on-401 never triggers because JS can't read the 401.

**Phase to address:** W2 (consistent headers on success+failure) — explicitly called out in the workstream scope. Coordinate with W1 (don't leak detail in the body; `{ error: 'Unauthorized' }` is the right minimal body).

**Detection:** Test matrix asserting CORS headers present on 200/400/401/402/403/429/500 for every active user-facing function. Add to `verify:baseline`.

---

### Pitfall 8: LinkedIn ~52 clustering and second-run drift — central-tendency anchoring + a cache key mutated by saving

**What goes wrong:**
Two distinct, confirmed-plausible root causes behind the W4 LinkedIn symptoms:

1. **~52/100 clustering (deterministic-ish but wrong):** The overall score is correctly computed as the **sum of section scores** (validator step 6 recomputes `rawScore` from sections; `correctedScore = scoreSum`). So the *total* is honest math-from-sections — good. The clustering comes from the **section scores themselves regressing to the mean**: `temperature: 0.3` (low) plus a rubric where the model self-assigns each of four sections out of 20/30/25/25 with no hard evidence anchors pushes Haiku toward "everything is a B-minus" (~13/20, ~19/30, ~15/25, ~16/25 ≈ 52-63). Low temperature does NOT mean correct — it means *consistently* central. If the prompt contains an example with mid-range numbers, that anchors harder.

2. **Second-run "fails"/drift:** The cache key includes `prior_grade_id: priorGradeId` (the user's most recent grade) AND the prompt injects `followUpContext` = the previous grade's JSON. After run 1 saves a grade, run 2's "latest grade" *is run 1's output*, so `prior_grade_id` **changes** → cache **misses** → the model re-runs → and now it's re-running *with run 1's grade as context*, which shifts the score and can trip validation. So identical input never caches, and each rerun is a different prompt. This is a strong candidate for both "second-run fails" and "non-deterministic re-run."

**Why it happens:**
"Use low temperature for determinism" is a common half-measure; determinism of a *wrong central value* is still wrong. Including a self-referential, save-mutated field in the cache key is an easy oversight when the key was designed for "freshest context" rather than "stable identity."

**How to avoid (W4 + W3 caching):**
- Make scoring **evidence-based**: each section score must cite specific profile evidence (quoted text → rubric criterion → points), and the prompt must give **explicit, anchored band definitions** (what a 5/20 vs 18/20 headline looks like) so the model discriminates instead of averaging. Keep the **total = sum of sections** (never let the model invent the total).
- Decide caching identity deliberately: the cache key should represent **stable input identity** (profile content hash + feature + tier + variant), NOT a field that the act of analyzing mutates. If "follow-up context" must influence output, either exclude prior-grade from the cache key or make reruns explicitly fresh — but don't let a hidden mutation silently disable caching and inject drift.
- If determinism is a hard requirement, pin section scoring to evidence + rubric so two runs on identical input converge — and verify via repeated-run tests, not by lowering temperature further.

**Warning signs:** score histogram piles up in the 48-58 band; identical profile produces different scores on consecutive runs; cache hit-rate ~0 for LinkedIn; `score-corrected` / `section-score-clamped` warnings frequent (model fighting the rubric).

**Phase to address:** W4 (LinkedIn scoring) with W3 (cache identity).

**Detection:** Score-distribution test over a fixture set (assert spread, not all-mid-band); repeated-run determinism test on identical input (assert convergence or a deliberate fresh-run charge); cache-key stability test (saving a grade must not change the next identical request's cache key).

---

### Pitfall 9: Strict validation that silently substitutes a value — masking failure to "look done"

**What goes wrong:**
The current LinkedIn validator is genuinely strict and **does not fabricate** — on a second-attempt validation failure it returns a 500 / throws `MeritRefundable`, never a fake score. The danger in W3/W4 is **regressing** this while "making analyses reliable." Tempting masks that violate the guardrails: returning a hard-coded default score (the ~52 placeholder), an empty `{}` shaped to pass validation, a generic "Improve your headline" recommendation when the model produced nothing usable, a DB default value surfacing as a score, a frontend placeholder rendered as if real, or "return the last partial buffer" on truncation. Each makes the feature *look* reliable while fabricating personalized analysis — the single most serious guardrail breach.

Two subtle existing behaviors to watch so they don't drift into masking: `clampLinkedInSectionScores` silently clamps out-of-range section scores (defensible defense-in-depth, but if it fires *often* it's hiding a prompt problem), and `correctedScore` overwrites the model's total with the section sum (correct — math-from-sections — but means a model that emits sensible sections with a nonsense total still "passes," so the sections themselves must be validated as evidence-backed).

**Why it happens:**
Pressure to eliminate user-facing errors. A fallback object is the fastest way to make a flaky feature "pass." It also makes tests green for the wrong reason.

**How to avoid (W3):**
- Validation failure after bounded retry must produce a **typed, structured error** in the lifecycle (`validating_output → retryable_failed | failed`) and a **refund** — never a substituted result. This is the literal "strict validation WITHOUT masking" requirement.
- Detection must cover: truncation (unclosed JSON / hit max_tokens), missing required sections, empty arrays, and **generic/placeholder content** (e.g. recommendation text equal to a known template string, or score equal to a sentinel default).
- Forbid DB columns from having a non-null *score* default that could surface as a real value; scores must be NULL until a validated analysis writes them.
- Frontend must render an explicit error/empty state, never a placeholder number styled as a result.

**Warning signs:** identical "recommendation" text across many users; scores exactly equal to a round default; tests assert "returns 200" without asserting *content* validity; clamp/correct warnings on a large fraction of requests.

**Phase to address:** W3 (output validation contract), enforced in W4 per feature.

**Detection:** Promptfoo adversarial + deno tests that feed truncated/empty/garbage model outputs and assert the handler returns a typed error + refund (never a 200 with a fabricated body). Add a "no sentinel score / no template recommendation" assertion.

---

### Pitfall 10: Retroactive RLS / EXECUTE / auth tightening that breaks legitimate reads (or silently re-opens what v4.0 closed)

**What goes wrong:**
W1 remediates SEC-01..10 *and* re-audits the full surface on a DB that v4.0 already tuned (advisors 73→15; `linkedin_grades` "Anyone can view" dropped to owner-scoped; ~60 anon/authenticated EXECUTE grants revoked; `security_invoker` views; `search_path` pins). Two symmetric failure modes:
1. **Over-tightening breaks users:** the frontend reads `linkedin_grades`, `analysis_results`, dashboard tables directly via PostgREST under the user JWT. Tightening an RLS policy or revoking an EXECUTE that a legitimate client path depends on returns empty results or 403s with no server error — the dashboard just goes blank. The v4.0 work already caught two such self-inflicted bugs on preview (a self-aborting verification assertion; a silent no-op REVOKE) — proof this class is live.
2. **Accidentally weakening v4.0:** a new migration that `CREATE OR REPLACE`s a view without `security_invoker`, drops a `search_path` pin, or re-grants EXECUTE to `anon` while "fixing" something silently regresses a closed advisor.

**Why it happens:**
Security remediation is additive-sounding ("just lock it down") but RLS/grants are coupled to client read paths that aren't visible from the policy. And `CREATE OR REPLACE` resets attributes (invoker/search_path/grants) unless every attribute is re-stated.

**How to avoid (W1):**
- Every RLS/grant change rides the v4.0 **preview→prod hard gate**: apply on preview, run **SELECT-as-role** no-regression checks for each affected table *as an authenticated user*, confirm advisor count does not increase, THEN operator applies prod (Claude read-only on prod).
- Maintain a **caller map**: before tightening any table/RPC, enumerate frontend + edge callers (grep PostgREST `.from('<table>')` and `.rpc('<fn>')`). No tighten without a verified caller list.
- Re-state ALL attributes on any `CREATE OR REPLACE` (security_invoker, search_path, grants) and assert them in the migration's verification DO-block (the codebase already uses this pattern — extend it).
- Every migration ships a rollback (v4.0 rule).

**Warning signs:** dashboard sections blank for normal users after a migration; advisor count ticks up; PostgREST 403/empty for owner reads; `verify:baseline` Playwright auth/dashboard flow fails.

**Phase to address:** W1, gated through the existing preview→prod pipeline.

**Detection:** SELECT-as-authenticated-role regression suite per touched table; advisor-count snapshot before/after; Playwright dashboard + LinkedIn-history flow in `verify:baseline`.

---

### Pitfall 11: Paddle removal before the expiration gate is verified — revoking access, losing billing history, or leaving a live webhook/secret

**What goes wrong:**
W6 retires Paddle, but the live `paddle-webhook/index.ts` still: verifies `PADDLE_WEBHOOK_SECRET`, updates `profiles.subscription_tier/subscription_status/current_period_end`, and implements **graceful cancellation that keeps a user's tier until `current_period_end`** (lines 252-259), with `can_perform_ai_action` enforcing access off that date. Remove Paddle columns/function/secret *before* the last in-flight Paddle subscription has actually expired and you can: (a) revoke a paying Paddle user's access early, or extend it wrongly; (b) drop `current_period_end`/`paddle_*` columns that the access-gate or billing history still reads; (c) leave a **publicly reachable webhook** (type `'webhook'` → `requireAuth` does nothing; the function self-verifies HMAC, but if you delete the secret while leaving the function deployed it returns 500 and any attacker can probe it) or, conversely, **leave `PADDLE_WEBHOOK_SECRET` configured** after removing the function (orphaned secret = audit finding). Either half-removal is a finding.

**Why it happens:**
"Stripe is primary now, Paddle is dead" — but in-flight annual Paddle subs can outlive the assumption by months, and the access gate is wired to Paddle columns. The webhook + secret + columns + frontend (`usePaddleCheckout`, `Profile.tsx`, `Refund.tsx`) must come down together, in the right order, only after expiry is proven.

**How to avoid (W6):**
- **Hard expiration gate FIRST** (the milestone's explicit ordering): prove with authoritative billing evidence (Paddle dashboard) AND app evidence (no `profiles` row with an active Paddle subscription whose `current_period_end` is in the future) that the last Paddle subscription has expired.
- If satisfied: remove **atomically and in order** — disable/redirect the webhook (a 410 shim like the existing `stripe-webhook` precedent), unset `PADDLE_WEBHOOK_SECRET`, drop `paddle_*` columns/functions, remove frontend Paddle code — each behind a reversible migration + rollback, **preserving required billing history** (don't drop history tables; archive/retain).
- If NOT satisfied: do all safe preparatory work + a reversible migration/rollback plan and **document the exact remaining blocker** (the milestone explicitly allows this).
- Verify the access gate (`can_perform_ai_action` / tier resolution) no longer depends on any Paddle column before dropping it.

**Warning signs:** a `profiles` row with `paddle_subscription_id` and `current_period_end > now()`; a paying user loses access right after a Paddle migration; `PADDLE_WEBHOOK_SECRET` present with no consuming function (or vice-versa); access-gate SQL still references `paddle_*`.

**Phase to address:** W6, LAST, gated on the expiration check. Decision already logged: "Paddle destructive removal gated on verified subscription-expiration."

**Detection:** Pre-removal query for active future-dated Paddle periods; post-removal: webhook returns 410, secret unset, advisor/env audit shows no orphaned Paddle secret; billing-history rows retained; Stripe + Merit flows unchanged in `verify:baseline`.

---

### Pitfall 12: Doing all six workstreams in one milestone on a live, paying-user app — coupled blast radius and a false-confidence gate

**What goes wrong:**
W2 (CORS) touches every edge function; W3 (lifecycle/Merit) re-plumbs the deduction seam in 5 features; W1 (RLS/grants) touches client read paths; W6 (Paddle) touches billing; W4 touches scoring; W5 touches the dashboard. These interact: a CORS change can mask a lifecycle bug (Pitfall 7 — a 401 looks like CORS), an RLS tighten can blank a dashboard that W5 just rebuilt, a Merit-seam refactor can collide with the Paddle access-gate. When something breaks in prod, six simultaneous changes make bisection expensive. The deeper trap: **`verify:baseline` proves *existing* behavior is preserved, but most of v5.0 is *new* behavior** (new states, new idempotency, new scoring, new dashboard sections). A green baseline gives false confidence unless each workstream ships its own new tests INTO the gate.

**Why it happens:**
The milestone is scoped as one trust push, and the workstreams feel related ("reliability"). But they're independent in mechanism and coupled in surface. The v4.0 gate is a regression net, not a coverage guarantee for new code.

**How to avoid:**
- **Order by risk and dependency:** W2 (CORS) + W1 (security) first — high user impact, well-bounded, regression-testable without behavior change. Then W3 (shared lifecycle/Merit idempotency) — highest risk, foundational. Then W4 (feature repairs, depends on W3). Then W5 (dashboard, derives from W3/W4 stored data, no new AI calls). W6 (Paddle) **last**, gated.
- **Extend the gate, don't just re-run it:** each workstream adds new deno/Playwright/promptfoo tests proving its *new* contract (idempotency exactly-once, settle-on-saved, CORS multi-origin matrix, no-masking validation, score distribution/determinism, Paddle-removal safety) — these become part of `verify:baseline` so later workstreams can't silently regress earlier ones.
- **Feature-flag risky cutovers** (the system already uses `MERIT_SYSTEM_ENABLED` byte-identical legacy paths) so the lifecycle and Paddle changes have a rollback switch.
- **Touch protected dashboard areas zero times** (W5 explicitly lists Career OS, readiness cards, Saved Jobs, navbar/Merits/History as untouched) — a single shared component edit can violate this.

**Warning signs:** a prod incident with 6 candidate causes; "verify:baseline is green" cited as proof for new behavior; one shared util edit (cors.ts, merit-gateway.ts, a dashboard component) rippling across workstreams.

**Phase to address:** roadmap sequencing decision (all workstreams) + per-workstream test-into-gate discipline.

**Detection:** Each phase's exit criterion = new tests added to `verify:baseline` AND the full gate green. Track which functions each workstream touched; require a no-overlap or explicit-coordination review when two workstreams edit the same shared file.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Status-window job dedup (`WR-04`) instead of a true idempotency key | Stops most double-clicks; no schema change | TOCTOU race + completed-job re-charge; not exactly-once | Never as the *only* guard once W3 ships; the partial-UNIQUE key must back it |
| `withMerits` calling the 3-arg deduct RPC | Works; ships features | Non-idempotent production charges despite a built+tested 4-arg substrate | Never going forward — W3 must wire the key |
| `throw MeritRefundable` on any DB error inside the callback | One error path | Refunds/errors *after* the result is saved (Pitfall 2) | Only for failures strictly before a durable result exists |
| Low `temperature` as the "determinism" fix for scoring | Consistent numbers | Consistent *wrong* central-tendency scores (~52 clustering) | Never as the sole mechanism; pair with evidence anchors + rubric bands |
| Cache key includes save-mutated `prior_grade_id` | "Freshest context" caching | Identical input never caches; reruns drift | Never — cache key must be stable input identity |
| Single static `APP_URL` origin in `corsHeaders` | Fail-closed, simple | Cannot serve apex+www+preview; no `Vary` | Only true single-origin deploys; v5.0 needs the allowlist |
| Returning a default/placeholder result to avoid an error | Feature "looks reliable" | Fabricated personalized analysis — top guardrail breach | Never |
| Deleting Paddle code/columns before expiry proof | Cleaner repo | Revoked access / lost billing history / orphaned webhook+secret | Never; gate on verified expiration |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic (Haiku/Sonnet) | Treating low temperature as correctness; trusting the model's self-reported total | Evidence-anchored rubric bands; total = sum of validated sections; bounded retry then typed error (never substitute) |
| Supabase Auth / JWT | 401 Response without CORS headers → browser swallows it (Pitfall 7) | Attach Origin-aware CORS to every user-facing response incl. errors; SPA reads 401 to refresh/relogin |
| Supabase Postgres RLS/PostgREST | Tightening a policy/grant that a direct client read depends on → silent blank UI | Caller map + SELECT-as-role preview verification + advisor snapshot before prod |
| Stripe webhook | Hand-rolling signature verify; trusting client amounts | `constructEventAsync` (SDK), insert-first idempotency on `stripe_webhook_events` (catch 23505), missing-profile → 200 (already the correct pattern in `stripe-webhook-handler`) — preserve it |
| Paddle webhook | Removing the function but leaving `PADDLE_WEBHOOK_SECRET` (or vice-versa); dropping `current_period_end` the access gate reads | Gate on expiry; 410-shim the endpoint; unset secret + drop columns together; retain billing history |
| Merit RPCs | Calling `refund_merits` from feature code, or refunding a saved analysis | Gateway-owned refund only (D-03); refunds only from pre-`saving` states |
| Fire-and-forget worker trigger | Assuming `fetch(...).catch()` always lands → stuck `processing` rows | Reaper sweep terminalizes stale rows + refunds stranded reservations |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Cache never hits (save-mutated key) | LinkedIn cache hit-rate ~0; every rerun calls Claude | Stable input-identity cache key | Immediately on any rerun; cost + latency scale with traffic |
| No reaper for non-terminal states | Growing count of stuck `processing`/`generating` rows; stranded reservations | Scheduled timeout sweep | Accumulates over days; worsens with traffic + cold-start drops |
| Per-request profile/previous-grade fetch before AI | Extra round-trips on every analysis | Acceptable at current scale; revisit if analysis volume grows | Only at much higher volume |
| Reconciliation drift query per-user only | Fine for support; can't catch fleet-wide drift | Add an aggregate drift scan to ops tooling | When user base grows beyond manual spot-checks |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| 401/error responses lack CORS → also lack consistent detail discipline | Opaque failures; harder incident triage | Origin-aware CORS on all responses; body stays `{ error: 'Unauthorized' }` (no detail leak) |
| `CREATE OR REPLACE` view/fn drops `security_invoker`/`search_path`/grants | Silently re-opens a v4.0-closed advisor | Re-state every attribute + assert in migration DO-block |
| Leaving Paddle webhook publicly deployed after retirement | Probeable endpoint; 500s leak config state | 410-shim + unset secret; or keep HMAC verify until removal |
| Reflecting arbitrary `Origin` to fix CORS | Credentialed cross-origin to attacker origin | Allowlist match then echo; never reflect-all; never `*` with credentials |
| Logging sensitive analysis/profile content or secrets | PII / secret exposure | v4.0 reason-code logging discipline; W1 sensitive-data/logging audit; never log secret values |
| File-upload (resume/LinkedIn PDF) trusting client content/type | Malicious payloads, oversized input | Size caps (already `slice(0,100000)` / per-tier char caps), content-type checks, OCR/parse sandboxing — verify in W1 |
| Internal worker trigger without `INTERNAL_JOB_SECRET` | Unauthenticated job execution | `requireAuth({type:'internal'})` timing-safe secret (already in place) — keep on every new lifecycle endpoint |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Success-saved-but-reported-as-failure (Pitfall 2) | "It failed" but the grade is in History; confusion + support load | Settle-on-saved; best-effort side-effects log-and-continue |
| "Taking Longer Than Expected" infinite spinner (stuck state) | User waits forever, no error, may resubmit (double charge) | Reaper + bounded timeout → explicit error/retry; recover state on refresh |
| Lost-after-refresh (no recovery) | User refreshes mid-analysis, loses result or resubmits | Persist lifecycle row; on load, reconcile by idempotency key → show in-flight/completed result |
| Placeholder score rendered as real | User trusts a fabricated number | Explicit empty/error state; never style a placeholder as a result |
| `www` users hard-blocked by CORS | Whole segment can't use the app | Multi-origin allowlist (Pitfall 6) |

## "Looks Done But Isn't" Checklist

- [ ] **Merit idempotency:** key is generated AND **forwarded through `withMerits` to the 4-arg RPC** — verify a repeated key yields one deduction end-to-end, not just in the raw-RPC unit test.
- [ ] **Lifecycle terminal states:** every non-terminal state has a **reaper** + reservation release — verify a killed worker doesn't strand a row or a Merit.
- [ ] **Settle ordering:** Merit settles only after a **verified durable write**; post-save steps can't refund/error — verify by failing usage/email/cache and asserting 200 + no refund.
- [ ] **CORS:** apex AND approved `www` AND preview all echoed; **`Vary: Origin`** present; **401/4xx/5xx carry CORS** — verify the full status matrix per function.
- [ ] **Scoring:** total = sum of validated sections; section scores **evidence-anchored**; identical input converges across reruns; cache key is **save-stable**.
- [ ] **Validation:** failure → typed error + refund, **never** a substituted score/empty/generic result — verify with truncated/empty/garbage model outputs.
- [ ] **Security remediation:** advisor count did not increase; SELECT-as-role unchanged for legitimate reads; every `CREATE OR REPLACE` re-states invoker/search_path/grants.
- [ ] **Paddle:** expiry proven before any drop; webhook 410-shimmed; secret unset; `paddle_*` columns unreferenced by the access gate; billing history retained.
- [ ] **Gate:** each workstream added NEW tests to `verify:baseline` (a green baseline alone does not cover new behavior).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Double-charge from non-idempotent deduct | MEDIUM | Identify duplicate `feature-deduct` rows by user+window; refund extras via `refund_merits` (idempotent); ship the idempotency-key wiring; reconcile balances |
| Refund-after-save (free analysis) | LOW–MEDIUM | Audit `merit-refund` log lines co-occurring with successful inserts; reverse erroneous refunds; fix settle ordering |
| Stuck non-terminal rows | LOW | Run reaper query → terminalize + `refundMeritsForJob`; deploy the scheduled sweep |
| CORS `www` block | LOW | Ship allowlist `cors.ts`; redeploy all functions; verify status matrix |
| RLS over-tighten blanked dashboard | LOW | Roll forward the policy fix (v4.0 has rollbacks per migration); SELECT-as-role verify; re-run Playwright |
| Paddle removed too early | HIGH | Restore from rollback migration; re-point access gate; reconcile affected users' tiers; re-verify billing history intact |
| Masked/fabricated result shipped | HIGH | Invalidate affected cached/stored analyses; remove fallback; re-run with strict validation; notify if scores were surfaced |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Workstream | Verification |
|---------|----------------------|--------------|
| 1. Idempotency key not forwarded | W3 | End-to-end `withMerits` repeated-key test = 1 deduction; in `verify:baseline` |
| 2. Refund/error after save | W3 (+W4 per feature) | Fail post-save steps → 200, no refund, row persists |
| 3. Settle before save | W3 | Settled-deduction ⇒ exactly one durable row (join invariant) |
| 4. Stuck non-terminal states | W3 (+W4 Onboarding) | Zero rows older than timeout; reaper test refunds stranded reservation |
| 5. Window-dedup re-charge / TOCTOU | W3 | N-parallel identical submits → 1 deduction, 1 row |
| 6. Single-origin CORS bug | W2 | Multi-origin echo + `Vary: Origin` test matrix per function |
| 7. 401 without CORS | W2 (+W1 body discipline) | CORS present on 200/4xx/5xx for all user functions |
| 8. Score clustering + rerun drift | W4 (+W3 cache identity) | Score-distribution + determinism + cache-key-stability tests |
| 9. Validation masking | W3 (enforced W4) | Truncated/empty/garbage → typed error + refund, never 200-with-body |
| 10. RLS/grant regression | W1 | Advisor snapshot + SELECT-as-role + Playwright via preview→prod gate |
| 11. Paddle premature removal | W6 (last, gated) | Expiry proof query; 410 webhook; secret unset; history retained |
| 12. Six-workstream blast radius | Roadmap sequencing | Risk-ordered phases; each adds tests to the gate; shared-file overlap review |

## Sources

- Codebase (HIGH — direct read, 2026-06-25): `supabase/functions/_shared/cors.ts`, `auth.ts`, `merit-gateway.ts`, `usage-checker.ts`, `rate-limiter.ts`; `supabase/functions/grade-linkedin/index.ts` + `validation.ts`; `submit-resume-analysis-job/index.ts`; `paddle-webhook/index.ts`; `stripe-webhook/index.ts` + `stripe-webhook-handler/index.ts`; migrations `20260415000000_merit_rpcs.sql`, `20260512000003_merit_transactions_idempotency.sql`; tests `merit-idempotency.test.ts`.
- `.planning/PROJECT.md` — v5.0 milestone scope, six workstreams, Key Decisions (Paddle-gated removal, lifecycle as shared infra, extend `verify:baseline`).
- Project memory (HIGH): v4.0 advisor 73→15 + RLS least-privilege + preview→prod hard gate; `verify:baseline` HARD gate in `deploy.ps1`; `PADDLE_WEBHOOK_SECRET` legacy gated-but-live; honor operator checkpoints for Stripe/realtime smokes.
- Inferred root-causes (MEDIUM): LinkedIn ~52 clustering (temperature 0.3 + unanchored rubric) and second-run drift (cache key includes save-mutated `prior_grade_id` + injected `followUpContext`) — derived from code, to be confirmed against production score logs in W4.

---
*Pitfalls research for: v5.0 Platform Trust, Reliability & Intelligence — adding persistent lifecycle, Merit exactly-once, multi-origin CORS, deterministic scoring, non-masking validation, security remediation, and Paddle retirement onto a live hardened Supabase+React+Anthropic system.*
*Researched: 2026-06-25*
