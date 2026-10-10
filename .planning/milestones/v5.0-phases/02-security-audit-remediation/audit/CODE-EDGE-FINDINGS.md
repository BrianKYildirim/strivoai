# Phase 2 — CODE-EDGE-FINDINGS (Plan 02-02)

**Phase:** 02 — Security Audit & Remediation
**Plan:** 02-02 (code/edge domain sweep — the pure-code half; no prod write, no secret read)
**Run date:** 2026-07-01
**HEAD SHA at sweep:** `5151d3c7` (branch `staging`)
**Owns domains:** 1 (auth/session), 2 (authz), 5 (cross-origin — VERIFY-ONLY), 6 (input validation),
7 (file-upload), 9 (sensitive-data), 10 (logging/error-safety), 11 (rate limiting), 14 (AI prompt exposure).
**Routes into:** `SECURITY-AUDIT.md` 17-domain index (each finding cites its Domain # + a rubric severity).

> ## NAMES-ONLY DISCIPLINE (T-02-07)
>
> This doc is committed to a tracked repo. It records variable/function/env NAMES, source line
> anchors, findings, and severity classifications ONLY — never a key, token, JWT, price ID, webhook
> secret, or connection-string VALUE. Project-refs `zjpjapgraoxdukdvpjes` (prod) /
> `cimjltzovkahkqecpwgi` (preview/test) are identifiers, not secrets. The no-secret-leak static guard
> (`src/test/security/security-audit-docs.test.ts`) greps this doc and MUST return zero.

***

## Verdict / Status

| Field | Value |
| ----- | ----- |
| Sweep type | Static + read-driven; **read-only** (no source file modified — `git status` clean for `supabase/functions/**` + `src/**`). |
| Domains classified | 1, 2, 5 (verify), 6, 7, 9, 10, 11, 14 — each with a rubric severity token + route (`plan 02-0X` / `clean` / `residual (Low)`). |
| Grounding | Every finding re-confirmed against **current HEAD** source (D-04: the v3.0 CONCERNS catalog is stale — re-confirm, not trust). |
| KEEP-LIST gate | Every removable/insecure candidate cross-checked against `.planning/audit/KEEP-LIST.md`; no gated-but-live item is mis-reported as a removal. |
| Cross-origin (domain 5) | **VERIFY-ONLY (Phase 1)** — `_shared/cors.ts` NOT modified; `cors-audit.test.ts` re-run **64 passed / 0 failed**. |
| NEW findings beyond the known set (Open Q5) | **1** — the `error.message`-into-500-body pattern (domain 10) spans ~8 prod-active functions (RUN-03 body-leak class the Ph7.1 sweep only fixed for compare-jobs). Classified LOW-MEDIUM → routed 02-06. Not crit/high → no forced 02-05 split. |

**Enumerated surface:** 38 edge functions with an `index.ts`. 31 import the shared `requireAuth` /
`requireInternalOrUserAuth` helpers; the 7 that roll custom/inline auth (paddle-webhook,
stripe-webhook, stripe-webhook-handler, admin-delete-user, get-analysis-job-status,
notify-upgrade-request, test-email) are each individually verified below (domain 1).

***

## Severity Rubric (from 02-01)

Impact × exploitability, `Severity = max-of-reasoning` (see `SECURITY-AUDIT.md` §Severity Rubric).
`Critical impact × (Easy|Moderate) → Critical`; `High × Easy → Critical`, `× Moderate → High`;
`Medium × Easy → High`, `× Moderate → Medium`; `Low → Low` regardless.
D-01 threshold: **Critical + High + Medium remediated in-phase; only Low → tracked residual.**

***

## Domain 1 — Auth / Session

**Technique:** read `_shared/auth.ts`; grep `requireAuth`/`requireInternalOrUserAuth`/`requireUserAuth`
across all 38 `index.ts`; individually verify the 7 non-shared-helper functions; re-verify the deferred
R-04 `analyze-skills-gap` inside-`serve`-arrow guard against the Phase-1 `withCors` seam.

**Findings (grounded at HEAD):**

- **Centralized enforcement — CLEAN.** `_shared/auth.ts` provides `requireUserAuth` (validates the
  Supabase JWT via `supabase.auth.getUser(token)`, then loads `profiles.subscription_tier`),
  `requireInternalAuth` (compares `x-internal-job-secret` against `INTERNAL_JOB_SECRET` with
  `timingSafeEqual` from `std@0.224.0`, length-guarded, and **fail-closed** when the env secret is
  unset — `auth.ts:148-152`), and `requireInternalOrUserAuth`. The 401 body is invariant
  `{ error: 'Unauthorized' }` (D-13, no detail leak) and carries origin-aware CORS for `user` type.
  31 of 38 functions consume these helpers.
- **The 7 non-shared-helper functions — each individually verified, all safe:**
  - `paddle-webhook` — HMAC-SHA256 over `${ts}:${payload}` + `timingSafeEqual`, length-guarded
    (`paddle-webhook/index.ts:12-54`). Correct. **KEEP-LIST Keep-Class 2** (Paddle gated-but-live).
  - `stripe-webhook` — 410-Gone shim (Phase 27); no auth needed by design (blanket-reject legacy URL).
  - `stripe-webhook-handler` — `stripe.webhooks.constructEventAsync` SDK signature verify (D-18),
    never hand-rolled (`index.ts:135`). Correct; preserve.
  - `admin-delete-user` — inline `getUser(token)` + **server-side admin gate**: queries
    `user_roles` for `role='admin'` for the caller and returns **403** otherwise
    (`admin-delete-user/index.ts:47-59`); also blocks self-delete (L61). Privileged op correctly gated.
  - `get-analysis-job-status` — custom `authenticateRequest` (Bearer → `getUser`) for the user path +
    an `INTERNAL_JOB_SECRET`-gated internal forward for the due-for-processing path (`index.ts:9-19,82-99`).
  - `notify-upgrade-request` — inline `getUser()` (anon client w/ caller JWT) + a
    `checkRateLimitByKey('auth:<email>', 10, 900)` abuse cap (`index.ts:30-45`).
  - `test-email` — inline `getUser()` gate (admin/test utility, `index.ts:13-28`).
- **R-04 `analyze-skills-gap` inside-`serve`-arrow guard — RESOLVED (verdict recorded).** The deferred
  RUNTIME-RELIABILITY follow-up (does a thrown 401 `Response` inside the arrow route to a misleading
  500?) is **cleared by the Phase-1 `withCors` seam**. `analyze-skills-gap` is
  `serve((req) => withCors(req, 'user', async () => { ... }))`; its catch at
  `analyze-skills-gap/index.ts:286-287` does `if (error instanceof Response) throw error`, and
  `withCors`'s own `catch (e) { if (e instanceof Response) return mergeCors(e, cors); }`
  (`_shared/cors.ts:163-166`) **returns** the thrown 401 as-is (CORS overlaid). So the 401 propagates
  correctly regardless of how `std` `serve` treats thrown Responses. The old R-04 concern predates the
  Phase-1 wrapper and is superseded.
- **Admin-elevation chokepoint — CLEAN.** `ADMIN_EMAIL` → `elite` tier resolves at the single auth
  chokepoint (`auth.ts:31-35,121-124`); admin-only endpoints additionally gate on the `user_roles`
  `admin` role (admin-delete-user, admin-merit-metrics).

**Severity:** **LOW** (centralized, fail-closed, timing-safe; the one deferred R-04 item is CLEARED).
**Route:** `clean` (R-04 verdict = resolved-by-withCors; no remediation needed).

***

## Domain 2 — Authz / Access Control

**Technique:** grep `.rpc(`/`.from(` call-sites vs tier/role gates; confirm every AI function gates
before the Anthropic call; confirm the admin-elevation `has_role`/`user_roles` chokepoint.

**Findings (grounded at HEAD):**

- **Tier gating before spend — CLEAN.** AI functions gate through `usage-checker` / `withMerits`
  (`_shared/merit-gateway.ts`) before the Anthropic call — the pooled rate-limit + `check_and_deduct_merits`
  RPC run first (D-09 ordering: rate-limit → deduct → invoke). `chat-agent` gates on `requireAuth` +
  `checkRateLimit` before `invokeAnthropicText` (`chat-agent/index.ts:16-31,60`).
- **Admin authz chokepoint — CLEAN.** Privileged writes gate on the `user_roles` `role='admin'`
  server-side check (admin-delete-user 403-on-non-admin, verified above). No authenticated-user path
  reaches a cross-user delete.
- **No string-built SQL (SEC-03 preview).** All DB access is PostgREST `.from()`/`.rpc()` or
  `SECURITY DEFINER` RPCs — 28 `index.ts` files use `.from(`/`.rpc(`; a targeted grep for raw
  `.sql(` / `execute(` / template-literal query strings returned **zero**. (Full SEC-03 write-up in
  domain 6.)

**Severity:** **LOW.** **Route:** `clean`.

***

## Domain 5 — Cross-Origin Handling (VERIFY-ONLY — Phase 1)

**Technique:** confirm `_shared/cors-audit.test.ts` exists + passes; confirm no per-endpoint
`Access-Control-Allow-Origin` literal remains; record verify-only, **do NOT modify `_shared/cors.ts`**.

**Findings (grounded at HEAD):**

- **`cors-audit.test.ts` exists and PASSES.** Re-run this sweep:
  `cd supabase/functions && deno test --no-check --allow-read --allow-env _shared/cors-audit.test.ts`
  → **64 passed / 0 failed**. It asserts all 21 user functions adopt `withCors(req, 'user', …)`, route
  OPTIONS via the shared helper, and hardcode **no** ACAO literal.
- **Zero ACAO literals.** A repo-wide grep for `Access-Control-Allow-Origin` across all
  `supabase/functions/**/index.ts` returned **No matches** — every origin decision flows through
  `_shared/cors.ts` `corsCore` (env-driven `ALLOWED_ORIGINS` allowlist, exact-match reflect,
  fail-closed omit, `Vary: Origin`, never `*`).
- **Phase-1 contract frozen.** `_shared/cors.ts` was **NOT modified** by this sweep (read-only).

**Severity:** N/A (verify-only). **Route:** `verify-only — Phase 1; _shared/cors.ts NOT modified` — **clean**.

***

## Domain 10 — Logging / Error-Message Safety

**Technique:** read `_shared/logger.ts` + the RUN-03 taxonomy; grep raw `error.message` echoed into a
Response **body** (vs a structured log); explicitly record the paddle-webhook 500 config-leak.

**Findings (grounded at HEAD):**

- **FINDING 10-A — paddle-webhook 500 config-leak (KNOWN, confirmed).** When `PADDLE_WEBHOOK_SECRET`
  is unset, the handler returns a **500 body naming the env var**:
  `message: "PADDLE_WEBHOOK_SECRET environment variable is not set"` (`paddle-webhook/index.ts:105-114`).
  Leaks config/env-name state. The secret is currently **unset on prod** (ENV-04 remediation) → the
  endpoint fail-closes today, which lowers live exploitability, but the code path must be non-leaky if
  the secret is ever restored. **KEEP-LIST Keep-Class 2** cross-check: paddle-webhook is gated-but-live
  → this is a *hardening* finding on a KEEP function, **not** a removal.
  - Impact Low-Medium (config/info leak) × exploit Easy → **MEDIUM**. **Route: plan 02-06** (webhook
    auth/replay + non-leaky-error hardening; the replay-window half is domain 13 / 02-03).

- **FINDING 10-B — `error.message` echoed into client 500 bodies (NEW, beyond the known set — Open Q5).**
  The RUN-03 taxonomy (the project's own frozen spec) states `error.message` is NEVER placed in a client
  response **body** — the Ph7.1 sweep retired exactly this leak for `compare-jobs`, but only fixed its 3
  auth-swallow sites. A current-HEAD grep finds the **same leak class live in ~8 prod-active functions**:

  | Function | Line (body site) | Notes |
  | -------- | ---------------- | ----- |
  | `analyze-resume` | `index.ts:1076` (`{ error: errorMessage }`) + SSE `{type:'error',message:err.message}` at `:822,:933` | high-traffic; streaming path also emits `err.message` |
  | `analyze-career` | `index.ts:1810` (`{ error: errorMessage }`) | high-traffic |
  | `grade-linkedin` | `index.ts:876` (`{ error: errorMessage }`) | prod-active |
  | `get-analysis-job-status` | `index.ts:174` (`{ error: message }`) | also uses fragile `message.includes("Invalid user token")` to pick 401-vs-500 |
  | `submit-resume-analysis-job` | `index.ts:270` (`{ error: message }`) | same string-match auth-detection |
  | `submit-career-analysis-job` | `index.ts:262` (`{ error: message }`) | same |
  | `analyze-skills-gap` | `index.ts:290` (`{ error: error.message }`) | the R-04 function; only non-Response errors reach here |
  | `notify-upgrade-request` | `index.ts:120` (`{ error: error.message }`) | live utility |
  | `test-email` | `index.ts:180` (`{ error: error.message }`) | admin/test utility |

  `extract-analysis-structure:137,227` also surface `error.message`, but into an **internal** summary
  object on an internal-auth function (not a browser-facing body) — lower concern.
  - **KEEP-LIST cross-check:** all listed functions are live/registered (Keep-Class 3, invoked by
    name/worker) — these are *hardening* findings on live functions, never removals.
  - Impact **Low-Medium** (internal error-text disclosure; DB/implementation detail, **not** a secret,
    PII, or cross-user datum — secrets are never in these `error.message` strings) × exploit Easy
    (trigger any 500). Under the rubric this is a defense-in-depth info-leak; the project already deemed
    the identical `compare-jobs` case worth retiring. **Classified LOW-MEDIUM.**
    **Route: plan 02-06** (error-message-safety consolidation — apply the RUN-03 generic-body pattern to
    the remaining ~8 sites). **Flagged as the sweep's one NEW finding (Open Q5); not crit/high → no
    forced 02-05 split.**

- **Structured logger — CLEAN.** `_shared/logger.ts` + the RUN-03 allow/deny discipline keep secrets /
  PII / raw provider payloads out of logs (reason codes only); `error.message` in a **log** field is
  permitted and is not a finding.

**Severity (domain max):** **MEDIUM** (10-A paddle leak). 10-B LOW-MEDIUM.
**Route:** 10-A → `plan 02-06`; 10-B → `plan 02-06` (NEW).

***

## Domain 11 — Rate Limiting / Abuse

**Technique:** read `_shared/rate-limiter.ts` + the merit-gateway pooled 60/hr limiter; note the
fail-open-on-DB-error availability choice; classify coverage per function.

**Findings (grounded at HEAD):**

- **Pooled abuse limiter — PRESENT.** `_shared/merit-gateway.ts` applies a pooled **60/hr** limiter at
  key `ai-analyses-all`, identical cap for all tiers (D-08), and runs the rate-limit **before** the
  deduct RPC (D-09 ordering, `merit-gateway.ts:35-38,192-193`).
- **Per-function limiters — PRESENT where relevant.** `chat-agent` 5/15/30 per-hour by tier
  (`chat-agent/index.ts:18-22`); `notify-upgrade-request` `checkRateLimitByKey('auth:<email>', 10, 900)`.
- **Fail-open on DB error — documented availability choice (not a finding).** `checkRateLimit` /
  `checkRateLimitByKey` log-and-allow when the counter RPC errors (`rate-limiter.ts:95-98,134-137`) —
  an intentional availability-over-strictness trade recorded in the module header. Distinct error code
  `rate_limit_exceeded` (429 + `Retry-After`), separate from `usage_limit_reached`.

**Severity:** **LOW.** **Route:** `clean` (fail-open is a documented, intentional residual, not a vuln).

***

## Domain 6 — Input Validation / Output Encoding

**Technique:** grep zod usage + `getMaxInputChars` wiring per AI feature; confirm the CONCERNS "not
wired" claim is stale; check grade-linkedin / recruiting-lens / analyze-skills-gap caps; confirm no
raw string-built SQL (SEC-03).

**Findings (grounded at HEAD):**

- **`getMaxInputChars` per-tier INPUT caps — WIRED (CONCERNS "not wired" is STALE, D-04 confirmed).**
  Grep confirms the per-tier char cap is applied at HEAD for:
  - `analyze-resume` — `getMaxInputChars('resumeAnalysis', tier)` (`index.ts:672`)
  - `analyze-career` — `getMaxInputChars('careerCompass', tier)` (`index.ts:1173,1539`)
  - `grade-linkedin` — `getMaxInputChars('linkedinGrader', tier)` (`index.ts:396,602`)
  - `recruiting-lens` — `getMaxInputChars('recruitingLens', tier)` (`index.ts:507`) + hard field slices
    (resumeSummary 5000 / jobDescription 3000 / linkedinText 4000, `index.ts:454-462`)
  - `interview-prep-analyze` — `getMaxInputChars('interviewPrepCoach', tier)` (`index.ts:342`)
- **The three functions WITHOUT the per-tier helper use hard slice caps instead (no gap):**
  - `analyze-skills-gap` — `MAX_JOB_SIZE` / `MAX_RESUME_SIZE` / `MAX_URL_LENGTH` slice caps
    (`index.ts:46-48,116-119`).
  - `compare-jobs` — same `MAX_RESUME_SIZE` / `MAX_JOB_SIZE` / `MAX_URL_LENGTH` slice caps
    (`index.ts:81-82,154-173`).
  - `chat-agent` — `MAX_MESSAGE_LENGTH = 2000` per-message slice + only the last message forwarded +
    role forced to `'user'` (`chat-agent/index.ts:8,49-55`).
  So every AI text-ingester bounds its input; the two forms (per-tier helper vs. fixed slice) are a
  minor **consistency** difference, not a DoS gap. Routing the fixed-slice trio onto the shared
  `getMaxInputChars` helper is a `residual (Low)` hardening item.
- **SEC-03 (SQL injection) — CLEAN (accepted-with-justification, parameterized-by-construction).**
  No raw/string-built SQL anywhere: a grep for `.sql(` / `execute(` / template-literal query strings
  (excluding `.rpc(`/`.from(`) returned **zero**; all DB access is PostgREST `.from()`/`.rpc()` or
  `SECURITY DEFINER` RPCs with pinned `search_path` (v4.0 Ph8). 28 `index.ts` files use `.from(`/`.rpc(`.

**Severity:** **LOW** (caps present everywhere; SEC-03 clean).
**Route:** `clean`; fixed-slice → `getMaxInputChars` consolidation = `residual (Low)`.

***

## Domain 7 — File-Upload / Document-Processing Safety

**Technique:** read `_shared/document-extraction.ts` chain; confirm content-type + size caps; confirm
the Ollama leg removed in Ph4.

**Findings (grounded at HEAD):**

- **Parser-first chain — CONFIRMED.** `document-extraction.ts` runs a provider chain
  `mistral → textract → claude_ocr` (`_shared/mistral-ocr-client.ts`, `textract-client.ts`, then a
  `claude_ocr` leg gated by a per-tier policy, `document-extraction.ts:80-183`). Empty/whitespace
  images are filtered (`params.images?.filter(image => image.trim().length > 0)`, L80). The
  **Ollama leg is NOT present** — confirmed removed in Ph4 (no `ollama`/`Ollama` reference in the chain).
- **Size caps applied upstream.** The submit handlers bound the payload before extraction/analysis
  (`submit-resume-analysis-job/index.ts:53` slices `resumeText` to 100000 chars;
  `submit-career-analysis-job` bounds `resumeOcrImages` to 3). The dedicated `ocr-pdf` function owns
  the PDF-bytes path.
- **Residual note:** the content-type / max-bytes assertion for the raw upload lives at the `ocr-pdf`
  boundary rather than in `document-extraction.ts` itself — a `residual (Low)` "confirm the ocr-pdf
  size/content-type guard" item (no active exposure observed; parser-first + tier-gating + downstream
  slice caps bound the blast radius).

**Severity:** **LOW-MEDIUM** → effective **LOW** (parser-first chain + tier gating + slice caps).
**Route:** `clean`; ocr-pdf content-type/size assertion = `residual (Low)`.

***

## Domain 9 — Sensitive-Data Exposure

**Technique:** grep for PII/secret in log bodies + response bodies; confirm the RUN-03 reason-code
discipline; confirm the single `dangerouslySetInnerHTML` sink is a shadcn CSS-var injection with NO
user-controlled data.

**Findings (grounded at HEAD):**

- **SEC-04 XSS sink — CLEAN (single sink, no user data).** A repo-wide grep for
  `dangerouslySetInnerHTML` across `src/**` returns **exactly one** hit:
  `src/components/ui/chart.tsx:70`. The `__html` is built from the static `THEMES` constant and the
  chart `config` object (developer-supplied component props — `--color-${key}: ${color}` CSS variables),
  with **no user-controlled data** reaching the sink. This is the standard shadcn `ChartStyle` CSS-var
  injection. Confirmed clean.
  - **Route:** `plan 02-07` — DONE. Locked by the static regression guard
    (`src/test/security/xss-sink-guard.test.ts`, vitest Class-B, auto-discovered into `verify:baseline`)
    that fails if any NEW `dangerouslySetInnerHTML` appears outside the allowlisted `chart.tsx` (fail-before
    demonstrated: a temporary second sink drove the guard RED). chart.tsx sink preserved (benign, no user data).
- **Reason-code logging discipline — CLEAN.** `_shared/logger.ts` + RUN-03 allow/deny list keep
  secrets / resume-LinkedIn text / prompts / raw provider payloads out of logs (reason codes only).
- **`error.message` in response bodies — cross-referenced to domain 10 (10-B).** The information-leak
  aspect (internal error text into a client body) is classified and routed under domain 10; not
  re-counted here. No secret/PII/cross-user datum was found in any response body.

**Severity:** **LOW** (XSS sink clean; reason-code discipline intact).
**Route:** `plan 02-07` (XSS regression guard); logging `clean`.

***

## Domain 14 — AI Prompt / Provider-Response Exposure (SEC-07)

**Technique:** grep each AI text-ingester's source for `sanitizeMessages` / `sanitizeUserContent` /
`prompt-sanitizer` at current HEAD; confirm the 3-of-8 coverage; confirm no raw provider payload leaks.

**SEC-07 coverage table — 8 AI text-ingesters, CONFIRMED by grep at HEAD `5151d3c7`:**

| # | AI text-ingester | `sanitizeMessages`/`sanitizeUserContent`? | Ingests user text into Anthropic | Verdict |
| - | ---------------- | ----------------------------------------- | -------------------------------- | ------- |
| 1 | `grade-linkedin` | **YES** (3 refs) | LinkedIn text | COVERED |
| 2 | `recruiting-lens` | **YES** (11 refs) | resume/JD/LinkedIn | COVERED |
| 3 | `interview-prep-analyze` | **YES** (3 refs) | resume/JD | COVERED |
| 4 | `analyze-resume` | **NO** (0) | resume text | **NOT covered** |
| 5 | `analyze-career` | **NO** (0) | resume/career context | **NOT covered** |
| 6 | `analyze-skills-gap` | **NO** (0) | resume/job input | **NOT covered** |
| 7 | `compare-jobs` | **NO** (0) | resume + job inputs | **NOT covered** |
| 8 | `chat-agent` | **NO** (0) | chat message | **NOT covered** |

**3 covered / 5 not** — matches the SEC-07 disposition (`SECURITY-AUDIT.md` SEC-11 row). (Note: a
`sanitize` grep also hits `send-welcome-email`, but that is `sanitizedName = String(name).slice(0,100)`
— an email name-length clamp, **not** a prompt sanitizer and **not** an AI ingester; excluded.)

**Classification + routing (resolves RESEARCH Open Question 2):**

- **`analyze-resume` + `analyze-career` → MEDIUM — REMEDIATED (02-07, closed).** High-traffic,
  business-critical resume/career ingesters. Impact Medium (defense-in-depth; system prompts robust +
  off-gate promptfoo covers resume/career) × exploit Moderate → **MEDIUM**. **Fixed in plan 02-07**
  (commit 949b761b): both now call `sanitizeUserContent` on the user-role resume/career text before the
  Anthropic invoke (analyze-resume on `normalizedText` feeding `buildUserPrompt`; analyze-career on the
  resume/LinkedIn content in both the free single-call and pro/elite paths). Locked by the static
  coverage guard `_shared/sanitizer-coverage.test.ts` (5 enrolled ingesters, `=== 5` length guard so a
  6th fails until it calls the sanitizer), registered in `deno.json` `test:ci` → `verify:baseline`
  (SEC-14). Pre-ingestion step only — no output-schema / wire-contract / tier-model change.
- **`analyze-skills-gap` + `compare-jobs` + `chat-agent` → FINAL DISPOSITION: Low residual, NOT
  remediated (02-07 decision — resolves RESEARCH Open Question 2).** The 02-07 remediation deliberately
  scopes the sanitizer + coverage guard to the high-traffic five and does **not** enroll these three.
  Justification (D-01: only Low → tracked residual): all three are lower-traffic / more-tightly-bounded —
  each applies hard input slice caps (domain 6); `chat-agent` additionally **forces `role: 'user'`**
  (prevents role injection, D-13) + caps each message at 2000 chars + forwards only the last message;
  their system prompts are robust and the primary features carry off-gate promptfoo adversarial coverage.
  The exploitability (Moderate) × impact (Low, defense-in-depth) nets **Low**, below the D-01 in-phase
  remediation threshold. **Carried into the RESIDUAL-REGISTER by 02-08** with clearance criterion =
  "enroll into `_shared/sanitizer-coverage.test.ts` + add `sanitizeUserContent` when/if any of the three
  moves to a high-traffic surface." (The maximal-thoroughness stance of covering all five was considered
  and declined for this phase to avoid over-stripping legitimate short chat/compare inputs; the coverage
  guard makes a later enrollment a one-line change.)
- **No raw provider-payload leak.** No AI function echoes `invokeAnthropicText`'s raw `data`/`raw` into
  a response body; outputs are parsed/merged JSON (result-merger). `chat-agent` returns only `{ reply }`.

**Severity (domain max):** **MEDIUM** (analyze-resume + analyze-career) — **REMEDIATED in 02-07** (closed).
**Route:** `plan 02-07` — DONE (sanitizer applied to analyze-resume + analyze-career; static coverage
guard `_shared/sanitizer-coverage.test.ts` in `deno.json` `test:ci` / `verify:baseline`). The 3
low-traffic ingesters' final call is now recorded above: **Low residual, not remediated** (carried to
RESIDUAL-REGISTER by 02-08). Open Question 2 = resolved.

***

## KEEP-LIST Cross-Check Summary (D-07 gate)

Every candidate that "looks removable/insecure" was gated through `.planning/audit/KEEP-LIST.md`:

| Candidate | Looks-like | KEEP-LIST class | Verdict |
| --------- | ---------- | --------------- | ------- |
| `paddle-webhook` 500 config-leak (10-A) | insecure body | Keep-Class 2 (Paddle gated-but-live) | hardening finding on a KEEP function — **not** a removal |
| `test-email` / `notify-upgrade-request` error.message leaks (10-B) | insecure body | Keep-Class 3 (invoked by name/worker) | hardening finding on live functions |
| `interview-prep-analyze` (SEC-07 COVERED) | gated-off prod | Keep-Class 1 (gated-but-live) | its sanitizer coverage is a KEEP — never touched |
| The 5 uncovered SEC-07 ingesters | missing sanitizer | all live/registered | remediation (add sanitizer), never removal |

**No gated-but-live item is mis-reported as a finding-for-removal.** Every finding is a *hardening /
remediation* item on a live surface.

***

## Cross-References

- **`SECURITY-AUDIT.md`** — the 17-domain index + SEC-11 disposition + severity rubric this doc routes into.
- **`.planning/audit/KEEP-LIST.md`** — the D-07 false-positive gate applied above.
- **`.planning/audit/RUNTIME-RELIABILITY.md`** — RUN-03 error taxonomy (the `error.message`-in-body
  discipline 10-B extends) + the R-04 follow-up (resolved-by-withCors above).
- **`supabase/functions/_shared/cors-audit.test.ts`** — the Phase-1 cross-origin drift guard (domain 5,
  64/0) + the Class-B static-guard template for the 02-07 SEC-07 + SEC-04 guards.

*This file records names, line anchors, findings, and classifications only — no secret VALUE is pasted
anywhere in it. Project-refs are identifiers, not secrets.*
