# Phase 23: interview-prep-runtime-overhaul - Research

**Researched:** 2026-04-20
**Domain:** Tier-gated AI interview coaching (Supabase Edge Functions + React) — Runtime §10 nine-section structured generation, STAR evaluation, streak + daily-cap state machine
**Confidence:** HIGH (CONTEXT, AI-SPEC, UI-SPEC, ROADMAP, and all cited shared utilities verified in-repo; external Anthropic docs cross-referenced in AI-SPEC §3)

---

## Summary

Phase 23 is an end-to-end rebuild of Interview Prep against the canonical Runtime PDF (§1–15). The contract is already deeply locked: CONTEXT D-01..D-19 fix schema, prompt architecture, intake UX, and frontend rewrite; AI-SPEC §1–7 lock the framework (bare Anthropic HTTP via `_shared/anthropic.ts` + Zod + `json-repair.ts` + Phase 13 `withMerits` + Phase 14 `loadPromptVariant`), the 9-section Zod schema, and a 14-dimension eval plan; UI-SPEC locks copy, state union, tokens, and component inventory. ROADMAP Success Criteria SC-1..SC-14 are the verification bar.

Research scope for this RESEARCH.md is therefore **prescriptive synthesis** rather than open discovery: consolidate the locked contracts into a planner-consumable brief, surface the standard stack with verified versions, map the 5 subsystems (schema migration, prompt assembly, edge-function orchestration, frontend state machine, evaluate path), enumerate pitfalls not already covered by AI-SPEC, and flag the handful of genuinely-open decisions the planner must resolve.

**Primary recommendation:** Rebuild on the existing shared primitives — do not introduce any new framework, package, or infrastructure. Every capability Phase 23 needs (auth, tier, resume auto-fetch, merit-gating, prompt registry with global-principles prepend, truncation repair, timeout/model config, CORS, rate-limit, logger, service-role client) already exists in `supabase/functions/_shared/`. Amend the Phase 19 migration in place per D-01, rewrite `interview-prep-prompts.ts` as shared-base + 3 tier branches per D-10, colocate the Runtime §10 Zod schema in `src/types/interviewPrep.ts` per D-17, rewrite `src/pages/InterviewPrep.tsx` per D-16 with `useReducer` state machine per D-18, and retire `interview-prep-coach` (last reference: Phase 21 cutover — still present in repo, must be confirmed removed in plan).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 through D-19)

**Schema migration (D-01..D-05):**
- D-01: Amend Phase 19 migration `supabase/migrations/20260418000000_interview_prep_tables.sql` in place. No new timestamped migration. Planner/executor verifies no environments will lose data.
- D-02: Expand `interview_quizzes.tier` CHECK to `('pro','elite','elite_taste')`. Pro-monthly-quota query: `COUNT(*) WHERE user_id=$1 AND tier='elite_taste' AND created_at >= first_of_calendar_month_utc`.
- D-03: Add to `interview_quizzes`: `interview_type text NOT NULL` CHECK (behavioral/technical/mixed_panel/executive), `question_categories text[] NOT NULL` CHECK `array_length >= 1`, `difficulty text NOT NULL` CHECK (entry/mid/senior/staff_plus), `duration smallint NOT NULL` CHECK (15/30/45/60), `format text NOT NULL` CHECK (written/voice_style/mixed), `background_context text NULLABLE` CHECK `length <= 1500`, `role_title text NULLABLE`, `company text NULLABLE` (legacy `job_title`/`company` remain), `readiness_score smallint NULLABLE` CHECK `0..100`.
- D-04: Add to `interview_streaks`: `longest_streak int NOT NULL DEFAULT 0`, `quizzes_today smallint NOT NULL DEFAULT 0`. Recompute `quizzes_today` from `COUNT(*) FROM interview_quizzes WHERE user_id=$1 AND tier='elite' AND created_at >= today_midnight_utc`. `elite_taste` does NOT count toward daily cap.
- D-05: `question_categories` is native Postgres `text[]`, not jsonb or comma-joined.

**9-section generation (D-06..D-11):**
- D-06: Single Anthropic call per session returns all 9 Runtime §10 sections. Pro 5,000 tokens, Elite 10,000 tokens. One refund path.
- D-07: Elite quiz generation returns **questions only** in the Practice Questions section; per-answer STAR scoring stays in `interview-prep-evaluate` as a separate 10K-budget call. Preserves Phase 19 D-03/D-05. No additional Merits on evaluate (Phase 19 D-14).
- D-08: Pro flashcards — Practice Questions contains 3 flashcard objects with full Situation/Task/Action/Result + coach note (<20 words). Target 180–260 words per STAR block.
- D-09: JSON truncation handled by reusing `supabase/functions/_shared/json-repair.ts` + strict Zod schema. Flow: parse → if fail, `repairTruncatedJSON` → if repair fails or required sections missing → 502 + Merit refund.
- D-10: Prompts organized as shared base + tier branches in `supabase/functions/_shared/interview-prep-prompts.ts`. All three registered via Phase 14 `loadPromptVariant` as `interview-prep-analyze-pro`, `interview-prep-analyze-elite`, `interview-prep-analyze-elite-taste` so Global AI Principles auto-prepend.
- D-11: "No silent drops" — prompt-level instruction + post-generation server-side validator. Case-insensitive substring scan across `coach_verdict`, `focus_areas`, `coaching_advice` for each filled optional field. Miss → one stricter retry; second miss → `log.warn` + ship.

**Intake form UX (D-12..D-15):**
- D-12: Single-page form with grouped sections: "Role", "What you're prepping for", "Session shape". One Generate CTA.
- D-13: Required: `job_description` (≥ 40 chars), `interview_type`, `difficulty`, `duration`, `format`, `question_categories` (≥ 1 selected). Optional: `role_title`, `company`, `background_context`.
- D-14: Defaults pre-selected: `interview_type='behavioral'`, `difficulty='mid'`, `duration=30`, `format='written'`.
- D-15: 500-char per-answer limit via live counter + color shift + server reject. Textarea shows `{count}/500`: muted 0–499, accent at exactly 500, destructive above 500. Submit disabled when any answer > 500. Server also rejects > 500 with HTTP 400.

**Frontend rewrite (D-16..D-19):**
- D-16: Full rewrite of `src/pages/InterviewPrep.tsx`. Preserve Institutional Intelligence design tokens, card shells, typography. Rebuild around `useAuth`, `useMerits` (NOT `useAiCredits`), `useTierAccess`, `ProFeatureGate`, and real edge-function calls.
- D-17: Type definitions for 9-section payload colocated in `src/types/interviewPrep.ts`, shared between frontend and edge functions (Deno barrel re-export from `supabase/functions/_shared/types/interviewPrep.ts`). Zod drives server validation AND frontend typing.
- D-18: `useReducer` with explicit status union: `'loading' | 'free-gate' | 'input-form' | 'generating' | 'flashcard-results' | 'quiz-active' | 'quiz-submitting' | 'quiz-results' | 'error'`.
- D-19: `<StreakDisplay>` standalone component at `src/components/interviewPrep/StreakDisplay.tsx` with props `{ lastQuizAt, currentStreak, longestStreak, quizzesToday, dailyCap }`. Variants: active / cold / expired / first-time / cap-reached.

### Claude's Discretion (planner decides)

- Exact retry/refund policy when the post-generation "no silent drops" validator fails on the retry attempt (D-11). Default: ship + warn rather than refund.
- Whether `elite_taste` quizzes consume any other quota (already confirmed: do NOT count toward Elite daily cap — D-04).
- Exact Zod schema field names (snake_case vs camelCase) for each §10 section. **Recommend snake_case** to match existing `_shared/*` conventions and DB column casing.
- Temperature for Anthropic calls. AI-SPEC recommends `0.4` initial / `0.2` retry — planner ratifies.
- RLS policy adjustments for new columns. Follow Phase 19 service-role-only-write / user-read-own.
- Partial indexes: `(user_id, created_at) WHERE tier='elite'` for daily-cap; `(user_id, created_at) WHERE tier='elite_taste'` for monthly quota.
- Whether to rename legacy columns (`job_title` → `role_title`, `mode` vs `tier`-derived) or keep both during the migration window.

### Deferred Ideas (OUT OF SCOPE — do not build, do not scaffold, no UI affordances)

- Voice-audio capture for quiz answers (Runtime §15).
- Dedicated quiz history page (Runtime §15). Flow returns only most recent result.
- Flashcard spaced repetition (Runtime §15).
- Resume-incomplete quiz UI (Runtime §15). Current flow is 400 no-resume + "Upload first" message.
- LinkedIn profile input (Runtime §15). Resume is the only grounding source.
- Auto-save draft of intake form.
- Word counter on JD textarea.
- "Clear form" affordance.
- Progressive-disclosure / multi-step stepper intake (rejected in D-12).
- Surgical wiring of existing `InterviewPrep.tsx` (rejected in D-16).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

REQ-IDs from `.planning/REQUIREMENTS.md` mapped to Phase 23 (inherited from Phase 19 slot per REQUIREMENTS §Traceability but re-proven against Runtime contract here).

| ID | Description | Research Support |
|----|-------------|------------------|
| IPC-01 | Free tier shows `<ProFeatureGate>` — feature not accessible | `src/components/ProFeatureGate.tsx` exists; wired at page-entry per D-16. SC-1. |
| IPC-02 | Pro tier (8 Merits, ~5,000 output tokens) — 3 STAR flashcards | D-06/D-08 + AI-SPEC §4 (`max_tokens=5000` Pro); existing `withMerits(ctx, 'interview_prep', ...)` covers the 8-Merit deduction via `check_and_deduct_merits` RPC. Cost drops from IPC-02 stated 3,000→5,000 per Runtime §12 + D-06 (planner confirms `feature_costs` row matches). |
| IPC-03 | Elite tier (5 Merits/quiz, ~10,000 output tokens) — 5–7 interactive quiz, 500-char enforced | D-06 (10K Elite budget), D-07 (questions only on analyze), D-15 (500-char client+server). SC-3, SC-5, SC-6. |
| IPC-04 | Elite quiz evaluation — AI scores answers against STAR | `interview-prep-evaluate/index.ts` present; preserves Phase 19 D-05 shape; scores all answers in single 10K call. SC-7. |
| IPC-05 | Streak system — 1 quiz/day; cold 24h; expires 48h | Runtime §8 + D-04. Existing streak logic in `interview-prep-analyze/index.ts` lines 370–431 must extend to write `longest_streak` and `quizzes_today`. SC-8. |
| IPC-06 | Daily quiz cap — max 3 quizzes/day, enforced server-side | Existing in `interview-prep-analyze/index.ts` lines 148–172 (COUNT on `mode='quiz'`). Must update to `tier='elite'` filter (D-04). SC-8. |
| IPC-07 | Schema additions — 3 tables | Already exist from Phase 19. Amend per D-01..D-05. |
| IPC-08 | Edge function `interview-prep-analyze` | Exists (539 lines); rebuilt for §10 payload per D-06..D-11. |
| IPC-09 | Edge function `interview-prep-evaluate` | Exists (329 lines); preserve Phase 19 D-05 shape, `parseInt(question_id,10) → question_order` join (SC-7). |
| IPC-10 | Quiz `maxTokens=10000`, timeout `80,000 ms` | `getTimeout(tier,'quiz')` already returns 80K for Elite per `tier-config.ts` lines 27–31. |
| UX-09 | Interview Prep Elite UI — quiz mode, 500-char counter, results screen | D-15 + D-16 + D-18 + UI-SPEC. |
| UX-10 | Streak display — flame + day count on dashboard | D-19 — new standalone `StreakDisplay` at `src/components/interviewPrep/StreakDisplay.tsx` supersedes `src/components/InterviewStreakDisplay.tsx`. |
| BACK-06 | New edge function `interview-prep-analyze` (see IPC-08) | Same file. |
| BACK-07 | New edge function `interview-prep-evaluate` (see IPC-09) | Same file. |
| BACK-12 | Quiz timeout 80,000 ms | `getTimeout('elite','quiz')` confirmed in `tier-config.ts`. |

**SC-#** references throughout map to ROADMAP §"Phase 23 Success Criteria 1–14" — all 14 must be TRUE for the phase `VERIFICATION.md` to sign off.

**Gap to flag for planner:** IPC-02 specifies "~3,000 output tokens" but Runtime §12 and D-06 both specify 5,000. Runtime wins. Planner should log this drift in the phase's VERIFICATION.md so REQ-IDs stay in sync.
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Auth + tier resolution | API / Backend (`requireAuth` in `_shared/auth.ts`) | — | Tier must be read from `profiles.subscription_tier` server-side (T-19-08); client cannot be trusted. |
| Resume auto-fetch (grounding) | API / Backend (`resumes` table + Storage via service client) | — | Runtime §5: frontend never sends resume text; existing pattern from Phase 19 D-01/D-02 and Recruiting Lens RCL-06. |
| Merit deduction + refund | API / Backend (`withMerits` in `_shared/merit-gateway.ts`) | — | NFR-01 <100 ms budget, refund taxonomy (Phase 13 D-02) — must be server-side, service-role RPCs. |
| Prompt assembly + Global AI Principles prepend | API / Backend (`loadPromptVariant` in `_shared/tier-prompts.ts`) | — | GATE-04 + Phase 14 D-03; principles block is sensitive IP and must never land in client payload. |
| Anthropic generation (9-section payload) | API / Backend (`invokeAnthropicText` in `_shared/anthropic.ts`) | — | Synchronous 30–80 s call; cannot run browser-side (API key, CORS, cost-ceiling). |
| JSON repair + Zod validation | API / Backend (`repairTruncatedJSON` + `InterviewPrepPayloadSchema.safeParse`) | Browser (render-time defensive parse) | Server owns truthful validation (502 + refund on failure). Browser may re-validate to catch wire corruption but never authoritative. |
| Quiz + answers + streak persistence | Database / Storage (`interview_quizzes`, `interview_quiz_answers`, `interview_streaks` with RLS) | API (service-role writer) | SC-11: tables must be RLS-locked to service-role writes + per-user SELECT. |
| Daily cap + monthly-quota check | API / Backend (`COUNT(*)` + date boundary) | — | Runtime §8 + D-02/D-04. Must run BEFORE Merit deduction (no charge on cap-exceeded). |
| 500-char answer enforcement | API (Hard reject, source of truth) | Browser (live counter + Submit disable) | D-15: server is authoritative; browser provides the UX (color shift + disable) but cannot be trusted. |
| State machine (loading → input → generating → results) | Browser (`useReducer` in `InterviewPrep.tsx`) | — | D-18: client-local ephemeral UI state; never persisted. |
| Streak visual state (active/cold/expired/first/cap) | Browser (`StreakDisplay` derives from server payload) | API (server emits `streak` + `daily_usage` fields) | D-19: browser derives visual state from last-quiz timestamp + current streak; API is source of numbers. |
| Copy strings (Runtime §13.4) | Browser (locked constants) | — | UI-SPEC locks byte-for-byte match; snapshot-tested. |
| History visibility | API (existing `record_ai_usage` RPC call in analyze handler) | Browser (`AnalysisHistory.tsx` consumes) | Phase 22-04 D-18/D-19 already wired; preserve the post-success RPC call at lines 312–320 of current `analyze/index.ts`. |

---

## Standard Stack

### Core (all already installed — confirmed via `package.json`, Deno imports, and `supabase/functions/_shared/`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | `^3.25.76` | Runtime schema validation for §10 nine-section payload + colocated TS types [VERIFIED: package.json] | Single source of truth for Runtime §10 contract per D-17; shared across Deno edge and frontend via `z.infer`. |
| Anthropic Messages API | `anthropic-version: 2023-06-01` stable | Structured generation (single call, no tool use, no streaming) [CITED: AI-SPEC §3] | Locked by Runtime §12 + Phase 14 `tier-config.ts`. |
| `claude-haiku-4-5-20251001` | locked | Cost-ceiling model for every tier/feature [VERIFIED: `supabase/functions/_shared/tier-config.ts` lines 54–67] | Platform-wide — never override per feature. |
| `_shared/anthropic.ts` `invokeAnthropicText` | existing | Bare HTTP wrapper; returns `{ ok, text } | { ok: false, status, error }`; handles timeout/abort, prompt-caching header, token logging, test fixtures [VERIFIED: file lines 600–691] | 20+ edge functions already use it; do not introduce `@anthropic-ai/sdk`, LangChain, LlamaIndex, Mastra, or Vercel AI SDK. |
| `_shared/merit-gateway.ts` `withMerits` + `MeritRefundable` | existing | Merit deduction, refund taxonomy (5xx/408/529/network only), pooled 60/hr rate limit [VERIFIED: file lines 1–80] | Phase 13 D-01/D-02; never call `refund_merits` directly (D-03). |
| `_shared/tier-prompts.ts` `loadPromptVariant` + `registerFeaturePrompts` | existing | Prompt registry + auto-prepend `STRIVO_GLOBAL_AI_PRINCIPLES` for Pro/Elite (GATE-04) [VERIFIED: file lines 1–112] | Phase 14 D-02/D-03 — single audit point for tier variants. |
| `_shared/tier-config.ts` `getTimeout` / `getModel` | existing | Per-tier timeout (`elite.quiz = 80_000`) + model (Haiku 4.5 everywhere) [VERIFIED: file lines 1–122] | `getTimeout` throws fail-loud on missing (tier,callType) pair. |
| `_shared/json-repair.ts` `repairTruncatedJSON` | existing | Truncation recovery for streaming-era malformed JSON [VERIFIED: re-exported in `interview-prep-analyze/index.ts` line 33] | Phase 19 — proven across resume/career/recruiting analyses. |
| `_shared/prompt-sanitizer.ts` `sanitizeUserContent` | existing | Strip multi-word injection phrases from JD + background_context | Runs at handler before Merit deduction; user-role only (D-07/D-10). |
| `_shared/auth.ts` `requireAuth({ type: 'user' })` | existing | JWT validation + tier resolution from `profiles.subscription_tier` | T-19-08 enforcement point. |
| `_shared/cors.ts` `corsHeaders` + `handleOptionsRequest` | existing | `APP_URL`-fenced CORS (fail-closed) | Reused across all user-facing edge functions. |
| `_shared/logger.ts` `createLogger('fn-name', reqId)` | existing | Structured JSON to Supabase Logs (fn, ts, reqId, durationMs, ...) | Drives monitoring dimensions in AI-SPEC §7. |
| `_shared/supabase-client.ts` `getServiceClient()` | existing | Service-role client for DB writes bypassing RLS | Used for resume fetch + quiz/answer/streak inserts. |
| `_shared/rate-limiter.ts` `checkRateLimit` | existing | Per-feature sliding-window limit | Existing limits in `analyze/index.ts`: `interview-prep-analyze` `{free:0, pro:10, elite:20}`. Keep. |
| `_shared/pdf-parser.ts` `extractPDFText` | existing | PDF → text from Storage-downloaded resume | Existing in current analyze path. |
| React 18.3.1 + `useReducer` | `^18.3.1` [VERIFIED: package.json] | State machine per D-18 | No additional state libs. |
| `react-hook-form` + `@hookform/resolvers` + `zod` | 7.61.1 / 3.10.0 / 3.25.76 | Intake form validation | Existing repo convention (intake forms elsewhere). |
| `framer-motion` | `^12.23.26` | State-transition animations per UI-SPEC | Already used in current `InterviewPrep.tsx` mock. |
| `sonner` | `^1.7.4` | Toast for errors + retry CTA | UI-SPEC Accessibility Contract. |
| shadcn/ui primitives | installed via `components.json` | Card, Button, Input, Textarea, Label, Select, RadioGroup, Checkbox, Badge, Separator, Progress, Alert, Skeleton, Dialog, Tooltip | UI-SPEC mandates no new primitives. |
| `lucide-react` `Flame` | `^0.462.0` | Streak flame icon | UI-SPEC. |

### Supporting (zero new installs; recommend for planner)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `deno test` + `fixtureKey: "interview_prep"` | existing | Unit tests with zero Anthropic spend via replay fixtures | Every PR — wired into `scripts/run-edge-tests.ps1`. |
| `promptfoo` (dev only — CI) | `^0.x` [ASSUMED: AI-SPEC §5 install note; version not pinned in repo yet] | Prompt-injection regression suite | Fast per-PR adversarial sweep (Dimension 12). |
| Arize Phoenix (OSS) | docker-pulled `arizephoenix/phoenix:latest` | Staging eval-and-tracing surface | Per AI-SPEC §5: staging immediate, production fast-follow via OTLP exporter on `invokeAnthropicText`. |
| OpenTelemetry (via esm.sh for Deno) | `@opentelemetry/api@1.9.0` + `@opentelemetry/exporter-trace-otlp-http@0.57.0` [ASSUMED versions] | Deno-compatible span emission | Gated by `PHOENIX_OTLP_ENDPOINT` env; no-op when absent. |

### Alternatives Considered (all rejected)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bare HTTP `invokeAnthropicText` | `@anthropic-ai/sdk` | SDK is Node-first; fractures the shared 20-function pattern. Reconsider as platform-wide swap, not per-phase. |
| Zod + `json-repair` | Vercel AI SDK `generateObject` | Deno-compat friction; duplicates `withMerits` and `loadPromptVariant` contracts; payoff too small. |
| Single-call 9-section | LangChain/LangGraph chained calls | No multi-step reasoning needed; opaque prompt transforms fight Runtime §11 Honest Scoring. |
| Single-call 9-section | Parallel 2-call merge (coaching + practice) | Doubles refund paths; rejected in CONTEXT 9-section table. |
| Chained (analyze → practice → synthesize) | — | 3 calls; likely blows 80 s budget; rejected in CONTEXT. |
| Prompt-level + post-validator (no silent drops) | Server-composes references post-hoc | Violates honest-voice principle (Runtime §11); rejected. |
| `useReducer` state machine | Multiple `useState` | Allows impossible state combinations; rejected in D-18. |

**Installation verification:** No new `npm install` or Deno import. Verify:

```bash
npm ls zod                                           # → zod@3.25.76
npm ls react-hook-form @hookform/resolvers           # → 7.61.1 / 3.10.0
ls supabase/functions/_shared/anthropic.ts           # → present
ls supabase/functions/_shared/merit-gateway.ts       # → present
ls supabase/functions/_shared/json-repair.ts         # → present
ls supabase/functions/_shared/tier-prompts.ts        # → present
ls supabase/functions/_shared/tier-config.ts         # → present
ls supabase/functions/_shared/interview-prep-prompts.ts       # → present (204 lines — REWRITE target)
ls supabase/functions/_shared/interview-prep-validation.ts    # → present — EDIT target
ls supabase/functions/interview-prep-analyze/index.ts         # → present (539 lines — REWRITE target)
ls supabase/functions/interview-prep-evaluate/index.ts        # → present (329 lines — EDIT target)
ls supabase/functions/interview-prep-coach/index.ts           # → STILL PRESENT — must confirm Phase 21 cutover actually deletes it
```

**Version verification (recommended one-time checks before planning):**

```bash
npm view zod version                # expect 3.25.76 current; pin if upstream moved
npm view react-hook-form version    # expect 7.61.1+
```

---

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────── BROWSER (src/) ─────────────────────────┐
│                                                          │
│  /interview-prep  →  <ProFeatureGate>  [Free → upgrade]  │
│                           ↓                              │
│   InterviewPrep.tsx (useReducer state machine, D-18)     │
│   ┌────────────────────────────────────────────────┐     │
│   │ loading → free-gate / input-form               │     │
│   │         → generating → flashcard-results       │     │
│   │                       / quiz-active            │     │
│   │                          → quiz-submitting     │     │
│   │                          → quiz-results        │     │
│   │                       → error (retry-safe)     │     │
│   └────────────────────────────────────────────────┘     │
│                                                          │
│   Components (D-19 + UI-SPEC inventory):                 │
│     IntakeForm · ReadinessHero · ReadinessBreakdown      │
│     FocusAreas · QuickTips · FlashcardDeck · QuizRunner  │
│     QuizResults · PrepRoadmap · StrengthsWatchOuts       │
│     CoachingAdvice · StreakDisplay · CharacterCounter    │
│                                                          │
│   Hooks: useAuth · useMerits · useTierAccess             │
│   Types: @/types/interviewPrep (Zod + InferredTypes)     │
└──────────────────────────────────────────────────────────┘
                   ↓ HTTPS (Bearer JWT)               ↑ 200 | 400/403/429/502
┌──────── SUPABASE EDGE FUNCTIONS (Deno) ──────────────────┐
│                                                          │
│  POST /functions/v1/interview-prep-analyze               │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 1. OPTIONS → handleOptionsRequest('user')        │    │
│  │ 2. Parse intake body (Zod at handler edge)       │    │
│  │ 3. requireAuth → tier = profiles.subscription_   │    │
│  │                  tier (NEVER from body)          │    │
│  │ 4. Free → 403 pro_or_elite_required (no Merit)   │    │
│  │ 5. Auto-fetch most-recent analyzed resume        │    │
│  │    (service client → Storage → extractPDFText)   │    │
│  │ 6. No resume → 400 no_resume (no Merit)          │    │
│  │ 7. Resolve variant (pro | elite | elite_taste)   │    │
│  │ 8. Elite: check daily cap (COUNT tier='elite'    │    │
│  │           ≥ midnight_utc) → 429 if 3/3           │    │
│  │    Pro elite-taste: check monthly quota (COUNT   │    │
│  │           tier='elite_taste' ≥ first-of-month)   │    │
│  │           → 429 if used                          │    │
│  │ 9. sanitizeUserContent(JD) + (background)        │    │
│  │10. Idempotency cache (60 s TTL on hash)          │    │
│  │11. withMerits('interview_prep', async (txId) →   │    │
│  │    a. loadPromptVariant('interview', tier,       │    │
│  │       {...intake, resumeText, variant})          │    │
│  │       → auto-prepends GLOBAL_AI_PRINCIPLES       │    │
│  │    b. invokeAnthropicText({ model: haiku-4.5,    │    │
│  │       maxTokens: variant==='pro'?5000:10000,     │    │
│  │       temperature: 0.4, timeoutMs:80_000,        │    │
│  │       fixtureKey:'interview_prep' })             │    │
│  │       !ai.ok → throw MeritRefundable(status,err) │    │
│  │    c. JSON.parse → repairTruncatedJSON →         │    │
│  │       InterviewPrepPayloadSchema.safeParse       │    │
│  │       fail → stricter retry (temp 0.2)           │    │
│  │       fail again → throw MeritRefundable(502)    │    │
│  │    d. findDroppedOptionalFields(payload, intake) │    │
│  │       miss → stricter retry once → ship+warn     │    │
│  │    e. record_ai_usage RPC (History visibility,   │    │
│  │       Phase 22-04)                               │    │
│  │    f. Persist: interview_quizzes row +           │    │
│  │       interview_quiz_answers rows +              │    │
│  │       Elite-only streak upsert (+ longest, +     │    │
│  │       quizzes_today)                             │    │
│  │    g. Return §10 payload { quiz_id, streak,      │    │
│  │       daily_usage, ...payload }                  │    │
│  │12. gated.ok ? return gated.value : gated.response│    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  POST /functions/v1/interview-prep-evaluate (Elite only) │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 1. requireAuth; tier !== 'elite' → 403           │    │
│  │ 2. Parse { quiz_id, answers[] }                  │    │
│  │ 3. Each answer_text.length > 500 → 400           │    │
│  │ 4. Verify quiz ownership (user_id === quiz.user) │    │
│  │ 5. Re-fetch original questions from              │    │
│  │    interview_quiz_answers (NEVER trust client)   │    │
│  │ 6. buildEvaluationPrompt(questions, answers, JD) │    │
│  │ 7. invokeAnthropicText(maxTokens:10000,          │    │
│  │    timeoutMs:80_000)                             │    │
│  │ 8. parse → repair → validateEvaluationScores     │    │
│  │ 9. Join by question_order = parseInt(            │    │
│  │    scoreEntry.question_id,10)    [SC-7]          │    │
│  │10. Write scores + overall_score + evaluated_at   │    │
│  │11. Return per-answer feedback + summary          │    │
│  │    NO additional Merit deduction (Phase 19 D-14) │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  /functions/v1/interview-prep-coach     [RETIRE — Ph 21] │
│      404 when removed; rewire frontend fallback path     │
└──────────────────────────────────────────────────────────┘
                   ↓
┌──────────── DATABASE (Postgres + Storage) ───────────────┐
│                                                          │
│  profiles.subscription_tier  ← read-only, tier resolve   │
│  resumes (+ Storage 'resumes' bucket) ← auto-fetch       │
│  user_merits + merit_transactions ← via RPCs only        │
│  interview_quizzes   ← AMEND per D-02/D-03               │
│    tier ∈ (pro, elite, elite_taste)                      │
│    + interview_type, question_categories text[],         │
│      difficulty, duration, format, background_context,   │
│      role_title, readiness_score                         │
│    + partial idx (user_id, created_at) WHERE tier=...    │
│  interview_quiz_answers ← existing (no schema change)    │
│  interview_streaks   ← AMEND per D-04                    │
│    + longest_streak int NOT NULL DEFAULT 0               │
│    + quizzes_today smallint NOT NULL DEFAULT 0           │
│  usage_tracking      ← record_ai_usage writes here       │
│                                                          │
│  RLS: user-read-own SELECT; service-role-only writes     │
└──────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (delta from current repo)

```
supabase/functions/
├── interview-prep-analyze/
│   ├── index.ts                       # REWRITE — §10 payload per D-06..D-11
│   └── __tests__/
│       ├── tier-contract.test.ts      # NEW (eval Dimension 13)
│       ├── merit-refund.test.ts       # NEW (eval Dimension 11)
│       ├── elite-taste-quota.test.ts  # NEW (D-02 monthly gate)
│       ├── eval.suite.test.ts         # NEW (RUN_EVALS=1 gated)
│       └── fixtures/
│           ├── dataset/*.json         # NEW — 30 labeled examples
│           └── injection/*.yaml       # NEW — Promptfoo adversarial
├── interview-prep-evaluate/
│   ├── index.ts                       # EDIT — preserve batch shape; inline STAR Zod
│   └── __tests__/eval.suite.test.ts   # NEW
├── interview-prep-coach/              # RETIRE — confirm Phase 21 cutover deletes
└── _shared/
    ├── interview-prep-prompts.ts      # REWRITE — shared base + 3 tier branches (D-10)
    ├── interview-prep-validation.ts   # EDIT — Zod-backed + no-silent-drops scan
    └── types/
        └── interviewPrep.ts           # NEW — barrel re-export of src/types schema

src/
├── pages/InterviewPrep.tsx            # FULL REWRITE (D-16)
├── components/interviewPrep/          # NEW directory
│   ├── IntakeForm.tsx
│   ├── ReadinessHero.tsx
│   ├── ReadinessBreakdown.tsx
│   ├── FocusAreas.tsx
│   ├── QuickTips.tsx
│   ├── FlashcardDeck.tsx
│   ├── QuizRunner.tsx
│   ├── QuizResults.tsx
│   ├── PrepRoadmap.tsx
│   ├── StrengthsWatchOuts.tsx
│   ├── CoachingAdvice.tsx
│   ├── StreakDisplay.tsx              # NEW (D-19) — supersedes src/components/InterviewStreakDisplay.tsx
│   └── CharacterCounter.tsx           # NEW (D-15)
└── types/
    └── interviewPrep.ts               # NEW — Zod schema + z.infer types (D-17)
```

### Pattern 1: Single-Call Structured Extraction with Guarded Refund

**What:** One synchronous Anthropic call returns the full §10 payload. Parse → repair → Zod → "no silent drops" scan, with exactly one stricter retry on any failure. Merit refund only on 5xx/408/529/network/timeout.

**When to use:** Every generation request in this phase — both tier variants (Pro flashcards, Elite quiz, Pro-monthly Elite-taste).

**Example:** See AI-SPEC §3 and §4 Core Pattern (already written verbatim in the canonical spec). Key invariants:

- Place resume + JD in the **system block** (cache_control ephemeral is auto-set by the wrapper — lines 633–636), not as a user turn.
- User message is a short sentinel (`"Generate the 9-section interview prep payload as strict JSON per the system prompt."`).
- `max_tokens` is always explicit — wrapper falls back to 4096 on undefined (Elite would truncate mid-payload).
- `temperature: 0.4` initial, `0.2` on stricter retry.
- `fixtureKey: "interview_prep"` for replay tests.
- `timeoutMs: getTimeout(tier, 'quiz')` = 80,000 ms.

### Pattern 2: Variant Resolution (tier + intake → prompt variant)

```typescript
function resolveVariant(
  tier: Tier,
  intake: IntakeInput,
  isProMonthlyRequest: boolean,
): 'pro' | 'elite' | 'elite_taste' {
  if (tier === 'elite') return 'elite';
  if (tier === 'pro' && isProMonthlyRequest) return 'elite_taste';
  return 'pro';
}
```

Planner decides how the frontend signals the Pro-monthly-taste intent — recommend a dedicated body flag (`body.elite_taste_request: true`) rather than inferring from tier alone. Server validates: Pro + `elite_taste_request` is the only path to `elite_taste`; Elite users requesting `elite_taste` is an input error (400) or silently coerced to `elite` (planner decides; recommend coerce + log).

### Pattern 3: Streak Update with 24 h Cold / 48 h Expiry (Runtime §8)

Existing logic at `interview-prep-analyze/index.ts` lines 370–431 is correct and must be preserved. Extension for Phase 23:

1. After computing `newStreak`, **also update `longest_streak = GREATEST(current_longest, newStreak)`** — new D-04 column.
2. After persisting the quiz row, **recompute `quizzes_today = COUNT(*) FROM interview_quizzes WHERE user_id=$1 AND tier='elite' AND created_at >= today_midnight_utc`** — store on `interview_streaks.quizzes_today`. This is redundant with the ad-hoc COUNT query for the daily-cap, but is needed for the dashboard Streak card (D-19) and cap-reached visual state without a separate query.

The existing query filters by `mode='quiz'`; per D-04 this MUST change to `tier='elite'` so `elite_taste` does not count.

### Pattern 4: Batch-Submit Evaluate (Phase 19 D-05, preserved)

Preserved verbatim from Phase 19. The frontend collects all 5–7 answers locally and submits once; server re-fetches original questions from `interview_quiz_answers` (never trusts client-submitted `question_text`), then joins by `parseInt(scoreEntry.question_id, 10) === question_order` — SC-7. A single 10K-budget Anthropic call scores all answers + emits overall summary; scores are written back to `interview_quiz_answers.score` + `interview_quizzes.overall_score` + `evaluated_at`.

### Anti-Patterns to Avoid

- **Streaming the §10 payload.** Zod cannot validate a partial JSON document. Streaming buys nothing against the 30 s latency target because the UI cannot render a partial §10 contract anyway. Use `invokeAnthropicText` (sync), not `streamAnthropicText`.
- **Parallel calls per section or per question.** Multiplies Merit accounting + refund paths; CONTEXT explicitly rejected. If a section feels too long for one call, shorten prompts before considering fan-out.
- **Trusting `tier` or `quiz_id` from request body.** Always resolve tier from `profiles.subscription_tier` via `requireAuth`; always verify `quiz_id → quiz.user_id === auth.uid` before evaluate scoring.
- **Refunding on 4xx.** `MeritRefundable` is reserved for 5xx/408/529/network/timeout. Zod validation after stricter retry is wrapped as `MeritRefundable(502)` (the model produced garbage → refund correct). A 400 `invalid_input` is **not** refundable.
- **Sanitizing the assembled system prompt.** `_shared/anthropic.ts` already sanitizes user-role messages only (line 614). Sanitize `jobDescription` + `background_context` **once** at the handler before they enter the system-prompt template.
- **Placing Merit deduction before resume fetch, cap checks, or Zod validation.** Order matters: sanitize → auth → tier gate → resume fetch → cap/quota check → idempotency cache → `withMerits` → Anthropic → parse → validate → persist. Deducting too early causes refund on every cap-exceeded / no-resume case, which is both wrong (refund is for 5xx) and operationally noisy.
- **Double-prepending Global AI Principles.** `loadPromptVariant` auto-prepends for Pro/Elite. Never manually concatenate `STRIVO_GLOBAL_AI_PRINCIPLES` in the user prompt body builder.
- **Letting `interview-prep-coach` handle new requests.** Phase 21 cutover retired this function from the Merit path; current repo still has the files. Planner must confirm and explicitly delete the `supabase/functions/interview-prep-coach/` directory + the `src/pages/InterviewPrepCoach.tsx` + any route/link in `src/App.tsx` + config entries. If not deleted, a stale route can re-surface.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Merit deduction / refund | Custom Supabase RPC calls + try/catch wrapper | `withMerits(ctx, 'interview_prep', callback)` + throw `MeritRefundable(status, msg)` | Phase 13 D-01/D-03: gateway owns refund control flow. Ad-hoc `refund_merits` direct calls have caused double-refunds in prior phases. |
| Global AI Principles prepend | Hardcode principles string in `interview-prep-prompts.ts` | `loadPromptVariant('interview', tier, params)` | Phase 14 D-02/D-03 — single audit point; free variants never get principles (GATE-04 cost ceiling). |
| Truncated JSON from Anthropic | Hand-written brace-balancer or regex repair | `repairTruncatedJSON` from `_shared/json-repair.ts` | Battle-tested across resume-analysis streaming; handles markdown fences, unterminated strings, dangling commas, bracket imbalance. |
| Prompt injection defense | Custom regex in the handler | `sanitizeUserContent(jd, 'interview-prep-analyze', log)` from `_shared/prompt-sanitizer.ts` | Centralized pattern set + consistent logging (`log.warn('sanitization-stripped')`). |
| CORS | Manual headers per handler | `corsHeaders({ type: 'user' })` + `handleOptionsRequest({ type: 'user' })` | Fail-closed `APP_URL` fencing; tested in `cors.test.ts`. |
| Tier resolution | Read from request body or custom header | `requireAuth(req, { type: 'user' })` | T-19-08 — tier must be server-resolved from `profiles.subscription_tier`. |
| Per-tier timeout / model config | Inline constants in each function | `getTimeout(tier, 'quiz')` / `getModel(tier, 'interview')` | Phase 14 `tier-config.ts` — fail-loud on undefined pairs; cost-ceiling enforcement. |
| 500-char answer enforcement | Client-side only | D-15: browser counter + **server 400 reject** via `answer.length > 500` check in evaluate body parse | Client can be bypassed; server is authoritative. |
| Daily cap | Date math in JavaScript Date objects | `COUNT(*) FROM interview_quizzes WHERE tier='elite' AND created_at >= today_midnight_utc_iso` | Existing query in analyze `index.ts` lines 152–165 works; just change `mode='quiz'` → `tier='elite'`. Run **BEFORE** `withMerits`. |
| Monthly Elite-taste quota | Boolean flag per user | `COUNT(*) FROM interview_quizzes WHERE user_id=$1 AND tier='elite_taste' AND created_at >= first_of_calendar_month_utc` | D-02 single-source-of-truth via `tier` column. |
| Resume fetch | Ask user to re-upload / post body text | Service client → `resumes` table (filter `analyzed_at IS NOT NULL`, ORDER BY `analyzed_at DESC LIMIT 1`) → Storage download → `extractPDFText` | Phase 19 D-01/D-02 + Recruiting Lens RCL-06. |
| Structured logs | `console.log` strings | `createLogger('interview-prep-analyze', reqId)` | Drives all 5 AI-SPEC §7 production metrics. |
| Streak component | Build a one-off on the Interview Prep page | Standalone `StreakDisplay` in `src/components/interviewPrep/` (D-19) | Dashboard embeds the same component (Phase 20 D-08). |

**Key insight:** In this stack, the shared primitives ARE the architecture. Introducing a framework here doesn't simplify — it fragments. Every new primitive must justify itself against a duplicate refund path, a bypass of GLOBAL_AI_PRINCIPLES, or a duplicate tier-resolution surface.

---

## Runtime State Inventory

Phase 23 is a partial rebuild of an existing feature — runtime state from Phases 19–22 must be handled explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `interview_quizzes` rows from Phase 19 with `tier IN ('pro','elite')` and NULL `interview_type`/`question_categories`/`difficulty`/`duration`/`format`/`readiness_score` (new NOT NULL columns per D-03 cannot accept existing rows). `interview_quiz_answers` unchanged. `interview_streaks` rows with NULL `longest_streak` / `quizzes_today` (new NOT NULL DEFAULT 0 columns — existing rows get the default). | **Data migration step required:** for every existing `interview_quizzes` row, set the new required columns to safe defaults (`interview_type='behavioral'`, `question_categories=ARRAY['leadership']` or similar, `difficulty='mid'`, `duration=30`, `format='written'`) BEFORE applying the NOT NULL constraint. Planner writes this as an inline DO-block in the amended migration (D-01). If any environment actually has production rows, the planner/executor must dry-run this backfill first. |
| **Live service config** | Supabase `feature_costs` / merit costs table: current cost for `feature='interview_prep'` is **8 Merits** (Pro) via `check_and_deduct_merits`. Runtime + Phase 23 keep Pro at 8 Merits and Elite quiz at 5 Merits — requires planner to verify the `feature_costs` rows match (tier-keyed). Supabase `anthropic` env var + model override env vars must be unchanged. No external-service config (no n8n, no Datadog, no Cloudflare tagging in this stack). | Planner confirms: `SELECT * FROM feature_costs WHERE feature='interview_prep'` returns the expected tier rows; `ANTHROPIC_MODEL_TEXT` env is unset or matches `claude-haiku-4-5-20251001`. Any per-tier cost change is a separate phase (Phase 10–12 scope). |
| **OS-registered state** | None found — Supabase edge functions deploy via `supabase functions deploy`; no OS-level daemons, no Windows Task Scheduler registrations, no launchd/systemd units tied to Interview Prep. Cron for Merit reset is in `reset-subscription-merits/` — unrelated. | **None — verified by directory scan of `supabase/functions/` + Phase 19 history.** |
| **Secrets / env vars** | `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `APP_URL`, `MERIT_SYSTEM_ENABLED`. All already present — no rename. No Interview-Prep-specific secret. | **None — no secret rotation required.** |
| **Build artifacts / installed packages** | No stale egg-info / compiled binaries. `supabase/functions/interview-prep-coach/` may still be deployed to staging/prod if Phase 21 cutover never removed the function. | **Phase 23 must explicitly delete the `interview-prep-coach` function** both in-repo (remove directory + `src/pages/InterviewPrepCoach.tsx` + route + `src/App.tsx` import) AND at the deployment boundary (the deploy scripts `scripts/deploy-staging.ps1` / `deploy-production.ps1` must drop it from the function list, or `supabase functions delete interview-prep-coach --project-ref $PROJECT_REF` runs once per env). |

**Open data-migration decision:** Amending NOT NULL columns on an existing table (D-03) is not reversible without dropping data. Options the planner must pick:
1. **Pure additive with `DEFAULT`:** add columns with `DEFAULT` + `NOT NULL`, then drop the DEFAULT — safe for any row count. Recommended.
2. **Amend + backfill + enforce:** two-statement approach (ADD COLUMN nullable → UPDATE existing → ALTER SET NOT NULL). More surgical but requires the UPDATE to be written carefully.
3. **Drop + recreate (rejected by CONTEXT).** Do not use.

Recommend option 1 with explicit sentinel values (`'behavioral'`, `'{leadership}'::text[]`, `'mid'`, `30`, `'written'`) documented in the migration file comment so a future reader knows these are migration-backfill defaults, not application defaults.

---

## Common Pitfalls

### Pitfall 1: `COUNT(*)` filter drift between analyze and streak-display

**What goes wrong:** The existing daily-cap COUNT filters by `mode='quiz'` (Phase 19 schema). After D-04 the filter must be `tier='elite'` so `elite_taste` rows are excluded. If the streak display card uses the OLD filter while analyze uses the NEW filter, the UI says "2/3 used" while the server allows a 4th quiz (or vice versa).

**Why it happens:** Two independent COUNT queries (one in the handler, one in the streak-display query) drift out of sync during refactor.

**How to avoid:** Single source of truth — `interview_streaks.quizzes_today` is recomputed and written by the analyze handler (D-04), and the frontend reads only that column via the `streak` response block. Never run a COUNT on the client or in a second edge function.

**Warning signs:** During testing, force 3 Elite quizzes in one UTC day, then attempt a 4th; the StreakDisplay cap-reached state and the 429 response must both fire from the same number.

### Pitfall 2: Pro-monthly-taste gate applied BEFORE resume fetch

**What goes wrong:** The cap-check order matters for refund correctness. If the Pro-monthly-taste quota check runs AFTER `withMerits` has deducted, a 429 surfaces alongside an accidental refund (or worse, no refund but the gate fires — user pays for nothing).

**Why it happens:** Copy-pasting from an existing handler without noticing that Merit deduction is already inside the callback.

**How to avoid:** Order in the handler is non-negotiable: sanitize → auth → tier gate → resume fetch → **cap/quota check** → **idempotency cache** → `withMerits(callback)` → Anthropic → parse → validate → persist. All 429 and 400 paths MUST return before `withMerits` is called.

**Warning signs:** Integration test `interview-prep-analyze.elite-taste-quota.test.ts` fails the "no Merit deduction on 429" assertion.

### Pitfall 3: Zod `discriminatedUnion("mode")` mis-wired to server payload key

**What goes wrong:** AI-SPEC §4b Zod schema uses `practice_questions: z.discriminatedUnion("mode", [...])`. If the Pro prompt emits `{ "practice_questions": { "mode": "flashcard", "items": [...] } }` but the Pro variant's system-prompt schema hint says `"type"` instead of `"mode"`, Zod fails every validation, both retries fire, and every request 502s.

**Why it happens:** Schema is written once; prompt JSON hint is written in three places (Pro, Elite, Elite-taste) and drift is inevitable.

**How to avoid:** In `interview-prep-prompts.ts` shared base, template the schema hint from the Zod schema at runtime — either via a single `FORMAT_HINT` constant that all three variants include, or via `zodToJsonSchema` (optional — would need `zod-to-json-schema` as a dep; not currently installed). Recommended lightweight path: hand-write the schema hint once as a const in the shared base builder and reference it verbatim from each tier variant.

**Warning signs:** Dimension 1 (schema conformance) fail-rate spikes > 0% in eval dataset — first question is always "did the schema hint in the prompt match the Zod schema byte-for-byte?"

### Pitfall 4: The "no silent drops" scan false-positives on short resumes

**What goes wrong:** If the user fills `company='Meta'` and the resume is one page, the payload may legitimately reference "at the company" or use a pronoun because there's not much else to say. The substring scan fails; stricter retry fires; second attempt also fails; `log.warn` fires. Across the production fleet this becomes noisy and the signal drowns.

**Why it happens:** Case-insensitive substring is deterministic but language is fuzzy. The payload can be correct while missing the literal token.

**How to avoid:** (1) Unicode NFC normalize both sides; (2) lowercase both sides; (3) `\b`-bounded tokenization on company/role (so "Metadata" doesn't count as "Meta"); (4) for `background_context`, match on any one of the content tokens (non-stopword tokens ≥ 4 chars) rather than full-string substring; (5) log with a `drift_severity` score (how many of the filled fields dropped) to let production data drive the eventual hard-fail promotion decision (CONTEXT discretion item).

**Warning signs:** `silent-drop-detected` warn rate > 15% over 24 h on production (AI-SPEC §7 P2 warn threshold).

### Pitfall 5: `record_ai_usage` call placed inside the wrong branch

**What goes wrong:** Current `analyze/index.ts` lines 312–320 correctly call `record_ai_usage` AFTER AI success + validation AND before the Pro/Elite persistence split. If the rewrite moves this inside the Elite-only branch, Pro users stop appearing in History (Phase 22-04 regression).

**Why it happens:** During rewrite, logic is reorganized around the `variant` discriminator and branch-specific persistence; easy to forget the shared pre-branch step.

**How to avoid:** In the rewritten handler, call `record_ai_usage` exactly once, at the point between "validation passed" and "begin persist" — before any branching on `variant`. Write the integration test: create a Pro user, run analyze, assert one `usage_tracking` row with `action_type='interview_prep'`.

**Warning signs:** History page missing Interview Prep entries for Pro users after deploy; Phase 22-04 smoke test regresses.

### Pitfall 6: Evaluate trusts client-submitted `question_text`

**What goes wrong:** Elite frontend submits `{ quiz_id, answers: [{ question_id, question_text, answer_text }] }`. A malicious or buggy client sends a different `question_text` than what was actually generated; the evaluate prompt scores against the wrong question.

**Why it happens:** Looks convenient to pass the question along with the answer "so the model has context."

**How to avoid:** Evaluate re-fetches `interview_quiz_answers` by `quiz_id` (already owned-verified) and joins locally by `question_order = parseInt(scoreEntry.question_id, 10)`. The client's `question_text` is explicitly discarded. SC-7 enforces this; the evaluate body schema must reject unknown fields or at least never pass them into the prompt.

**Warning signs:** Eval Dimension 5 (per-beat ↔ overall) contradiction rate spikes — scoring a different question is the first thing to check.

### Pitfall 7: `interview-prep-coach` re-introduced via dashboard deep-link

**What goes wrong:** Phase 21 retired `interview-prep-coach` from the Merit path, but the function, page, and App route may still be live in the repo. A stale marketing link or dashboard card that points at `/interview-prep-coach` keeps the function warm and receiving traffic without Merit deduction or Runtime §10 contract.

**Why it happens:** Files were not deleted during Phase 21 (`Grep` confirms 8 files still reference it — including `src/App.tsx`, `src/pages/InterviewPrepCoach.tsx`, `supabase/functions/interview-prep-coach/`, and config.toml entries).

**How to avoid:** Phase 23 plan must include an explicit "retire legacy" task — delete `supabase/functions/interview-prep-coach/`, delete `src/pages/InterviewPrepCoach.tsx`, remove the route and import from `src/App.tsx`, remove entries from `supabase/config.*.toml`, and run `supabase functions delete interview-prep-coach --project-ref $REF` per environment during deploy. Verify with `grep -r interview-prep-coach .` returning zero results post-cleanup.

**Warning signs:** Grep of the repo after Phase 23 ships still finds references; any hit is a bug.

### Pitfall 8: `temperature` drift between initial + retry

**What goes wrong:** AI-SPEC calls for `0.4` initial / `0.2` retry. If the retry uses the same temperature as the initial, the retry is not actually "stricter" — it's a second roll of the same dice. Dimension 10 (truncation recovery) telemetry becomes meaningless.

**Why it happens:** Copy-paste from first call to retry without adjusting.

**How to avoid:** `runExtraction` helper in AI-SPEC §4 hard-codes `temperature: 0.4` on attempt 1 and `0.2` on attempt 2. Use the helper, don't inline the two calls.

---

## Code Examples

> All examples verified against in-repo source. Source paths given for each.

### Example 1: Handler entry point (verified from AI-SPEC §3 and `interview-prep-analyze/index.ts`)

See AI-SPEC §3 "Entry Point Pattern" for the full canonical shape. Key call sites:

```typescript
// Merit-gated callback pattern — verified from existing analyze/index.ts lines 220–527
const gated = await withMerits(
  { userId, tier: tier as 'free' | 'pro' | 'elite', corsType: 'user' as const },
  'interview_prep',
  async (_txId) => {
    const systemPrompt = loadPromptVariant('interview', tier, {
      resumeText, jobDescription: sanitizedJD, jobTitle, company,
      // Phase 23 additions:
      backgroundContext: sanitizedBg,
      interviewType, questionCategories, difficulty, duration, format,
      variant,
    });
    const ai = await invokeAnthropicText({
      model: getModel(tier, 'interview'),
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate the 9-section interview prep payload as strict JSON per the system prompt.' }],
      maxTokens: variant === 'pro' ? 5000 : 10000,
      temperature: 0.4,
      timeoutMs: getTimeout(tier, 'quiz'),
      fixtureKey: 'interview_prep',
    });
    if (!ai.ok) throw new MeritRefundable(ai.status, ai.error);
    // parse → repair → Zod → no-silent-drops → record_ai_usage → persist
    // ...
  },
);
if (!gated.ok) return gated.response;
return gated.value;
```
Source: `supabase/functions/interview-prep-analyze/index.ts` (current implementation) + AI-SPEC §3.

### Example 2: Zod Runtime §10 schema (verified from AI-SPEC §4b)

See AI-SPEC §4b "Structured Outputs with Zod" for the full canonical schema. Key shape:

```typescript
// src/types/interviewPrep.ts — NEW file per D-17
import { z } from "zod";

export const InterviewPrepPayloadSchema = z.object({
  your_prep_readiness: z.object({
    score: z.number().int().min(0).max(100),
    band: z.enum(["not_ready","needs_work","ready_to_practice","ready_to_ship"]),
    one_line_verdict: z.string().min(20).max(240),
  }),
  coach_verdict: z.string().min(120).max(1200),
  readiness_breakdown: z.object({ /* 5 sub-scores + notes */ }),
  focus_areas: z.array(z.object({ title, why, what_to_do })).min(2).max(5),
  quick_tips: z.array(z.string().min(10).max(240)).min(3).max(6),
  practice_questions: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("flashcard"), items: z.array(FlashcardQuestion).length(3) }),
    z.object({ mode: z.literal("quiz"),      items: z.array(QuizQuestion).min(5).max(7) }),
  ]),
  prep_roadmap: z.array(z.object({ when, action })).min(3).max(8),
  strengths_and_watchouts: z.object({ strengths, watch_outs }),
  coaching_advice: z.object({ advice, biggest_score_mover }),
});
export type InterviewPrepPayload = z.infer<typeof InterviewPrepPayloadSchema>;
```
Source: AI-SPEC §4b (verbatim-copyable).

### Example 3: 500-char CharacterCounter (D-15 + UI-SPEC Runtime §13.4)

```tsx
// src/components/interviewPrep/CharacterCounter.tsx
interface Props { value: string; max?: number; id?: string }
export function CharacterCounter({ value, max = 500, id }: Props) {
  const n = value.length;
  const color =
    n > max ? 'text-destructive'
    : n === max ? 'text-primary'
    : 'text-muted-foreground';
  return (
    <span
      id={id}
      role="status"
      aria-live="polite"
      className={`text-sm font-semibold tabular-nums ${color}`}
    >
      {`${n}/${max}`}
    </span>
  );
}
```
Source: D-15 rules + UI-SPEC Typography + Color tables. Copy format `{count}/500` per Runtime §13.4.

### Example 4: State machine reducer (D-18)

```typescript
type Status =
  | 'loading' | 'free-gate' | 'input-form' | 'generating'
  | 'flashcard-results' | 'quiz-active' | 'quiz-submitting'
  | 'quiz-results' | 'error';

type Action =
  | { type: 'boot-done'; isFree: boolean; hasResume: boolean }
  | { type: 'generate' }                                       // input-form → generating
  | { type: 'generate-success'; payload: InterviewPrepPayload; variant: 'pro'|'elite'|'elite_taste' }
  | { type: 'generate-error'; message: string }
  | { type: 'start-quiz-submit'; answers: { id: number; text: string }[] }
  | { type: 'quiz-success'; scores: EvaluationResult }
  | { type: 'quiz-error'; message: string }
  | { type: 'retry' };                                          // error → input-form

// Transitions match Runtime §13 state diagram 1:1 (UI-SPEC).
```
Source: D-18 + UI-SPEC "State Machine" section.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 19 payload: `{ flashcards: [...] }` OR `{ questions: [...], quiz_id }` | Runtime §10 **9-section payload** wrapping Pro/Elite variants in `practice_questions` | Phase 23 (this phase) | Every renderer in the 1028-line mock is obsolete — full frontend rewrite per D-16. |
| Phase 19 validators: hand-rolled `validateFlashcards` / `validateQuizQuestions` | **Zod `InterviewPrepPayloadSchema.safeParse`** | Phase 23 | Single source of truth (D-17) shared between Deno + browser; validators collapse into one schema. |
| Phase 19 streak: `(current_streak, last_quiz_at, last_quiz_date)` | Phase 23 streak: `+ longest_streak, + quizzes_today` | Phase 23 D-04 | Enables longest-streak leaderboard UX + cap-reached visual state without an extra COUNT. |
| Phase 19 tier CHECK: `('pro','elite')` | Phase 23: `('pro','elite','elite_taste')` | Phase 23 D-02 | Single column is the source of truth for Pro monthly quota — no separate boolean. |
| Legacy `interview-prep-coach` (pre-Merit, pre-Phase 19) | Retired in Phase 21; Phase 23 confirms deletion | Phase 21 → enforced Phase 23 | Stale route/function files still present in repo — planner must delete explicitly. |
| `useAiCredits` hook (older credit system) | `useMerits` hook (Phase 20 Merit UX) | Phase 20 | CONTEXT says `AiCreditsContext` but repo has `useMerits` + `MeritCostPreview` component; plan uses the newer hook — verify with planner. |
| Temperature `0.7` in current analyze handler (line 248) | Temperature `0.4` initial / `0.2` retry (AI-SPEC §4) | Phase 23 | Runtime §11 Honest Scoring — lower temp reduces score inflation. |

**Deprecated / outdated:**
- `src/components/InterviewStreakDisplay.tsx` (current) — superseded by `src/components/interviewPrep/StreakDisplay.tsx` (D-19). Planner decides: delete old component + rewire imports, or keep as thin wrapper during transition.
- `useAiCredits` usage in `src/pages/InterviewPrep.tsx` header (current) — drop in favor of `useMerits` per Phase 20.
- The `validateFlashcards` / `validateQuizQuestions` / `validateEvaluationScores` hand-rolled validators in `_shared/interview-prep-validation.ts` — replace with Zod schema usage + a narrower "no silent drops" helper.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `useMerits` is the current canonical hook (not `useAiCredits` as CONTEXT states) | Standard Stack / State of the Art | LOW — both hooks exist; planner aligns with whichever is wired into `src/pages/*` at plan time. Confirmed `useMerits` via `src/pages/InterviewPrep.tsx` line 2 and `src/hooks/useMerits.ts` presence. |
| A2 | `promptfoo` version and Arize Phoenix Docker tag for the eval tooling install | Standard Stack Supporting | LOW — these are dev-only tooling, not production code path. AI-SPEC §5 lists the install commands; actual version pinning is a plan-time concern. |
| A3 | OpenTelemetry esm.sh versions (`@opentelemetry/api@1.9.0`, `exporter-trace-otlp-http@0.57.0`) | Standard Stack Supporting | LOW — gated by `PHOENIX_OTLP_ENDPOINT` env; no-op on absence. |
| A4 | The production `feature_costs` table already has `interview_prep` Pro row at 8 Merits and Elite row at 5 Merits | Runtime State Inventory | MEDIUM — if costs have drifted, Phase 23 UX (`<MeritCostPreview>`) will display the wrong number. Planner verifies with `SELECT feature, tier, cost FROM feature_costs WHERE feature='interview_prep'`. |
| A5 | `MERIT_SYSTEM_ENABLED=true` in staging + production envs (Phase 13 cutover complete) | Architecture Pattern | LOW — current analyze handler has a 503 defensive fallback on the `false` branch; Phase 23 inherits it. If flag is false the function 503s, which is acceptable defensive behavior. |
| A6 | The `resumes` table + `'resumes'` Storage bucket + PDF extraction via `extractPDFText` continues to be the canonical path (no Phase 22 or 23 changes to resume ingestion) | Architecture Pattern | LOW — no other phase in ROADMAP modifies the resume ingestion path. |
| A7 | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) public pricing is `$1.00 / $0.10 (cached) / $5.00` per MTok as of early 2026 | AI-SPEC §4 Cost Budget | LOW — AI-SPEC numbers are Anthropic public rates at time of authoring. Actual cost monitoring in production uses the wrapper's token log, not the estimate. |
| A8 | Supabase Edge Function cold-start latency absorbs the OTLP exporter without breaching the 80 s timeout | AI-SPEC §5 Phoenix install | LOW — exporter is staging-only at launch; production fast-follow load-tests it. |
| A9 | Phase 21 cutover left `interview-prep-coach` deployment artifacts in-repo but disconnected | Pitfall 7 | MEDIUM — grep returns 8 references. Risk is a stale route still serving traffic. Planner must include explicit deletion task. |
| A10 | Existing `partial index` candidates (`(user_id, created_at) WHERE tier='elite'`) will measurably help the daily-cap query at volume | Claude's Discretion | LOW — at <1000 Elite users, the index is optional. Planner decides at plan time. |

**If this table is many rows:** Most are tooling/operational concerns, not product decisions. The two MEDIUM items (A4 feature_costs verification, A9 legacy coach deletion) must be confirmed before plan execution.

---

## Open Questions

1. **Does the planner promote "no silent drops" second-miss to a 502 + refund, or ship + warn?**
   - What we know: D-11 says ship + warn; AI-SPEC §5 Dimension 2 says ship + warn with planner upgrade option after 30 days of production data.
   - What's unclear: Initial behavior is ship + warn; upgrade path timing is data-driven.
   - Recommendation: Ship + warn at launch; add `silent_drop_rate` to the monitoring dashboard; planner creates a follow-up ticket to revisit after 30 days.

2. **Does the frontend send an explicit `elite_taste_request: true` flag, or does the server infer from tier + no-daily-cap-bypass?**
   - What we know: Server must know which of the 3 variants to render. The intake form UX implies a distinct "try Elite for a month" CTA for Pro users.
   - What's unclear: Discovery of `elite_taste` — is it a separate button on the Pro path, or a surface inside `<MeritCostPreview>` with a one-click upgrade-taste?
   - Recommendation: Explicit request flag in the analyze body. Server-side: if `tier='pro'` AND `body.elite_taste_request === true`, resolve variant `elite_taste` and check monthly quota; otherwise Pro flashcard. Elite users cannot request `elite_taste` (returns 400 or coerces to `elite`). Planner + UI-SPEC owner decide the UX entry point (a secondary button beside Generate? A toggle in Session shape group?).

3. **Schema field casing — snake_case (match DB + `_shared/*` convention) or camelCase (match existing analyze return shape `{ quiz_id, streak, daily_usage }`)?**
   - What we know: CONTEXT claims discretion.
   - Recommendation: **snake_case for the §10 payload** (matches Python-style JSON convention used across `_shared/*` and DB columns); keep top-level wrapper keys (`quiz_id`, `streak`, `daily_usage`) as-is for backward compat with the existing quiz-return shape.

4. **Migration execution safety — does any live environment have data that a NOT NULL-add-with-default-then-drop-default could silently corrupt?**
   - What we know: User confirmed safe in CONTEXT D-01.
   - What's unclear: Whether staging has historical Phase 19 rows.
   - Recommendation: Planner includes a `SELECT COUNT(*), MIN(created_at) FROM interview_quizzes` pre-flight query in the migration plan; if count > 0, do the additive approach with explicit backfill UPDATE before enforcing NOT NULL.

5. **`interview-prep-coach` deletion — does Phase 23 block on this or does the current `Phase 21` plan already cover it?**
   - What we know: Repo grep returns 8 references still; Phase 21 is listed in ROADMAP but plans may not have executed.
   - Recommendation: Planner verifies Phase 21 plan-checker completion status; if incomplete, Phase 23 inherits the retirement task. Either way, Phase 23 VERIFICATION asserts zero grep hits for `interview-prep-coach` after ship.

6. **Does the retired `useAiCredits` hook still exist and gate any code paths, or is it fully superseded by `useMerits`?**
   - What we know: CONTEXT mentions `AiCreditsContext`; repo has `useMerits` + `MeritCostPreview` components. Current `InterviewPrep.tsx` line 2 imports `useMerits`.
   - Recommendation: Planner grep-confirms `AiCreditsContext` is either deleted or a thin compat-shim; do not re-add imports of the old hook in the rewrite.

7. **Rate-limit tuning for `interview-prep-analyze`** — existing `{free:0, pro:10, elite:20}` per Phase 19. Should Phase 23 preserve or revisit?
   - Recommendation: Preserve. Adjustment is a separate phase and data-driven.

8. **Does the Pro-monthly-taste quiz persist to `interview_quiz_answers` the same way as an Elite quiz (so the Pro user can batch-submit and reach evaluate)?**
   - Implied yes by D-07 (Pro-monthly tastes the **Elite runtime**), but the evaluate handler currently 403s all non-Elite. Pro-on-taste needs a bypass path OR the tier check in evaluate must allow `tier='pro' AND quiz.tier='elite_taste'`.
   - Recommendation: Evaluate's Elite-only gate must widen to: `tier === 'elite' OR (tier === 'pro' AND quiz.tier === 'elite_taste')`. Ownership + quiz-tier match is the security predicate. Planner writes this gate explicitly. No additional Merits (Phase 19 D-14 preserved).

---

## Environment Availability

> Phase 23 has no new external dependencies beyond what's already running in the Strivo stack. Availability audit limited to Phase-23-new surfaces.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime | Frontend build + dev server | ✓ | 22+ (pkg.json) | — |
| Deno runtime | Edge function local testing | ✓ (assumed dev machine) | 2+ | `scripts/run-edge-tests.ps1` exits non-zero if missing |
| Supabase CLI | Deploy | ✓ | 2.76.9+ | — |
| Anthropic API | Analyze + evaluate | ✓ (via `ANTHROPIC_API_KEY` env) | stable | None — function returns 5xx → auto-refund. |
| `resumes` Storage bucket | Resume auto-fetch | ✓ | — | 400 no_resume if bucket empty for user. |
| Docker (for Arize Phoenix) | Eval tooling — staging only | ✗ / optional | — | Skip Phoenix; rely on Supabase Logs until production fast-follow. |
| `promptfoo` npm | CI adversarial suite | ✗ (dev install) | — | Run `npm install --save-dev promptfoo` in the plan's Wave 0. |
| OpenTelemetry esm.sh imports | Phoenix OTLP | available via esm.sh | 1.9.0 / 0.57.0 [ASSUMED] | No-op when `PHOENIX_OTLP_ENDPOINT` env absent. |

**Missing dependencies with no fallback:** None. Phase 23 is pure code + migration against an already-provisioned stack.

**Missing dependencies with fallback:**
- Arize Phoenix — staging-only at launch; Supabase Logs is the production source of truth.
- Promptfoo — dev-only; install in Wave 0.

---

## Validation Architecture

> `.planning/config.json` workflow.nyquist_validation key — treat as enabled unless explicitly `false`. Include this section.

### Test Framework

| Property | Value |
|----------|-------|
| Frontend framework | Vitest `^1.6.1` + `@testing-library/react@^14.3.1` + `jsdom@^24.1.3` [VERIFIED: package.json] |
| Edge-function framework | `deno test` with `https://deno.land/std@0.168.0/testing/asserts.ts` + `fixtureKey: "interview_prep"` replay convention [VERIFIED: `supabase/functions/_shared/anthropic.ts` lines 598–604] |
| Frontend config | `package.json` scripts `"test": "vitest run"` + `"test:watch": "vitest"` |
| Edge config | `supabase/functions/deno.json` + `supabase/functions/tsconfig.json` |
| Quick run command | `npm test` (frontend) · `deno test --allow-net --allow-env --allow-read supabase/functions/interview-prep-analyze/__tests__/` (edge, replay only) |
| Full suite command | `RUN_EVALS=1 deno test --filter "evals:interview-prep" ...` per AI-SPEC §5 (nightly + pre-promotion; uses live Anthropic) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SC-1 / IPC-01 | Free tier sees `<ProFeatureGate>`; no analyze call possible | unit (frontend) | `npm test -- InterviewPrep.freeGate` | ❌ Wave 0 |
| SC-2 | Pro with no resume → 400 `no_resume`; no Merit deduction | integration (edge) | `deno test --filter "analyze.no-resume"` | ❌ Wave 0 |
| SC-3 / IPC-02 | Pro → 3 flashcards, resume-anchored, 5K budget, 8 Merits deducted only on success | integration | `deno test --filter "analyze.pro-flashcards"` | ❌ Wave 0 |
| SC-4 | Pro-monthly Elite-taste quota: 1st allowed, 2nd same month → 429 no charge | integration (frozen clock) | `deno test --filter "analyze.elite-taste-quota"` | ❌ Wave 0 |
| SC-5 / IPC-03 | Elite → 5/5/6/7 questions for 15/30/45/60; `quiz_id` returned; `question_order` is int | integration | `deno test --filter "analyze.elite-quiz-count"` | ❌ Wave 0 |
| SC-6 | 500-char: browser disables Submit; server 400 rejects > 500 | unit + integration | `npm test -- CharacterCounter` + `deno test --filter "evaluate.answer-length"` | ❌ Wave 0 |
| SC-7 / IPC-04 | Evaluate joins by `parseInt(question_id,10) === question_order`; never trusts client question_text | integration | `deno test --filter "evaluate.question-order-join"` | ❌ Wave 0 |
| SC-8 / IPC-05/06 | Streak: first quiz after midnight UTC increments; 24h cold; 48h expire; 4th quiz same UTC day → 429 | integration (frozen clock) | `deno test --filter "analyze.streak-and-cap"` | ❌ Wave 0 |
| SC-9 | Every payload has 9 §10 sections in order; filled optional fields referenced | integration + code (`findDroppedOptionalFields`) | `deno test --filter "analyze.nine-sections"` + `deno test --filter "validation.no-silent-drops"` | ❌ Wave 0 |
| SC-10 | Honest scoring — weak-fit fixture returns `not_ready` / `needs_work` band | eval (LLM judge) | `RUN_EVALS=1 deno test --filter "evals:interview-prep:honest-scoring"` | ❌ Wave 0 |
| SC-11 | RLS service-role-only writes + per-user SELECT on the 3 tables | SQL integration | `deno test --filter "rls.interview-tables"` | ❌ Wave 0 |
| SC-12 | Global AI Principles auto-prepended on Pro/Elite; absent on Free | unit | `deno test --filter "tier-prompts.interview-prepend"` | ❌ Wave 0 (extend existing `tier-prompts.test.ts`) |
| SC-13 | Runtime §13.4 copy strings byte-for-byte | unit snapshot | `npm test -- InterviewPrep.copy` | ❌ Wave 0 |
| SC-14 | v1 out-of-scope items absent (no LinkedIn input, no voice, no history page, no spaced repetition) | manual + grep | `grep -r "voice_capture\|linkedin_profile\|spaced_repetition" src/pages/InterviewPrep.tsx` → 0 hits | — |

### Sampling Rate (Nyquist)

- **Per task commit:** `npm test -- --changed` (frontend) + `deno test --allow-net --allow-env --allow-read supabase/functions/interview-prep-analyze/__tests__/` (edge replay; no Anthropic spend).
- **Per wave merge:** full `npm test` + full edge-function unit suite (all 11 integration files above). Must be green.
- **Phase gate (`/gsd-verify-work`):** full unit + integration green, plus `RUN_EVALS=1 deno test --filter "evals:interview-prep"` against staging (live Anthropic; nightly on CI; required-green before production promotion). Dimensions 1, 2, 3, 4, 5, 11, 12 are blocking (AI-SPEC §5).

### Wave 0 Gaps

- [ ] `src/types/interviewPrep.ts` — Zod schema + `z.infer` types (D-17). No test file yet.
- [ ] `src/components/interviewPrep/CharacterCounter.tsx` + `CharacterCounter.test.tsx` — D-15 color states.
- [ ] `src/components/interviewPrep/StreakDisplay.tsx` + `StreakDisplay.test.tsx` — 5 variants (D-19).
- [ ] `src/pages/InterviewPrep.test.tsx` — state machine transitions + §13.4 copy snapshot (D-16, D-18).
- [ ] `supabase/functions/interview-prep-analyze/__tests__/tier-contract.test.ts` — Pro/Elite/Elite-taste shape assertions.
- [ ] `supabase/functions/interview-prep-analyze/__tests__/merit-refund.test.ts` — refund taxonomy (Dimension 11).
- [ ] `supabase/functions/interview-prep-analyze/__tests__/elite-taste-quota.test.ts` — frozen-clock monthly gate.
- [ ] `supabase/functions/interview-prep-analyze/__tests__/streak-and-cap.test.ts` — frozen-clock daily-cap + 24h cold + 48h expire.
- [ ] `supabase/functions/interview-prep-analyze/__tests__/no-silent-drops.test.ts` — substring-scan helper.
- [ ] `supabase/functions/interview-prep-analyze/__tests__/eval.suite.test.ts` — gated by `RUN_EVALS=1`.
- [ ] `supabase/functions/interview-prep-analyze/__tests__/fixtures/dataset/*.json` — 30 labeled examples (Senior Technical Recruiter labeled; Cohen's κ ≥ 0.7 on top 3 dims).
- [ ] `supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/promptfooconfig.yaml` + 12+ adversarial fixtures (Dimension 12).
- [ ] `supabase/functions/interview-prep-evaluate/__tests__/question-order-join.test.ts` — SC-7 integer-join assertion.
- [ ] `supabase/functions/interview-prep-evaluate/__tests__/answer-length.test.ts` — 500-char server reject.
- [ ] `supabase/functions/interview-prep-evaluate/__tests__/pro-elite-taste-access.test.ts` — Pro-monthly-taste can reach evaluate.
- [ ] RLS migration test — `supabase/functions/_tests/rls-interview.test.ts` (or similar) — validate service-role write + user-read-own on the 3 amended tables.
- [ ] Framework install (Wave 0): `npm install --save-dev promptfoo` — for Dimension 12 CI.

---

## Security Domain

> `security_enforcement` treated as enabled (config absent = on).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `requireAuth({ type: 'user' })` validates Supabase JWT; tier resolved from `profiles.subscription_tier` — never from body (T-19-08). |
| V3 Session Management | yes | Supabase Auth handles session lifecycle (localStorage + auto-refresh on near-expiry per existing `fetchWithTimeout.ts` pattern). |
| V4 Access Control | yes | Tier-based gate (Free → 403) + ownership check (`quiz.user_id === auth.uid`) on evaluate + RLS user-read-own on the 3 tables (SC-11). Pro cannot reach evaluate unless quiz.tier === 'elite_taste'. |
| V5 Input Validation | yes | Zod schemas at handler edge for intake; server rejects `answer_text.length > 500` (D-15); `job_description` / `background_context` hard caps at 12,000 / 1,500 (Guardrail 2). |
| V6 Cryptography | no | No new crypto; inherits Supabase Auth + HTTPS. Webhook signature verification is out of scope (Paddle/Stripe, owned by Phase 12). |
| V7 Error Handling + Logging | yes | `_shared/logger.ts` structured JSON; secrets never logged; reason codes for auth failures. Error responses avoid leak (`{ error: 'Unauthorized' }`). |
| V8 Data Protection | yes | PII scan on output strings (Guardrail 8) — SSN regex hard-rejects + refunds; resume text never echoed to browser. Anonymized fixtures for eval dataset. |
| V11 Business Logic | yes | Merit deduction before AI call (MER-11) + refund taxonomy (Phase 13 D-02) + idempotency cache (Guardrail 9) + daily/monthly quota enforcement server-side. |
| V14 Configuration | yes | `APP_URL` CORS fencing fail-closed; `ANTHROPIC_API_KEY` in Supabase secrets only (not `.env`); `MERIT_SYSTEM_ENABLED` module-scope env read. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tier escalation via body-supplied `tier` | Elevation of Privilege | Tier always resolved server-side from `profiles.subscription_tier` via `requireAuth`. `loadPromptVariant` accepts the resolved tier — T-19-08 (verified `tier-prompts.ts` SECURITY NOTE lines 17–20). |
| Prompt injection in JD / background_context | Tampering + Information Disclosure | `sanitizeUserContent` multi-word pattern strip (DAN, "ignore previous", "you are now", etc.) + post-response canary scan (Dimension 12). Adversarial fixture suite in CI via Promptfoo. |
| Client forging `quiz_id` to evaluate someone else's quiz | Information Disclosure | Evaluate verifies `quiz.user_id === auth.uid` before scoring. UUID format validated (lines 110–116 of current evaluate). |
| Client bypassing 500-char via DevTools | Tampering | Server-side 400 rejection; authoritative (Guardrail 5). |
| Fabricated resume anchors in output | Misrepresentation (business integrity) | Eval Dimension 3 rejects `signal_missing=false ∧ resume_anchor=null`; LLM judge verifies substring presence in resume text. Deterministic code pre-filter. |
| PII echo (SSN, street address) | Information Disclosure | Output PII regex scan (Guardrail 8); SSN match → 502 + refund. |
| Merit corruption via refund on non-5xx | Denial of Service (economic) | Refund taxonomy narrow (Phase 13 D-02); Dimension 11 integration test asserts exact behavior per status. |
| Stale `interview-prep-coach` route serving unauthenticated / unmetered traffic | Spoofing + Information Disclosure | Explicit deletion task in Phase 23 plan + post-deploy grep check. |
| Free-tier hitting analyze directly via curl | Elevation of Privilege | `requireAuth` + explicit 403 gate before AI call. |

---

## Project Constraints (from CLAUDE.md)

- **Preserve existing TypeScript + React + Tailwind + shadcn/ui patterns.** No new frameworks; no new UI libraries.
- **Backend is Supabase (Deno edge functions + Postgres).** Anthropic Claude is the sole AI provider. No new infrastructure.
- **Never commit anything within `.planning/` or `.gitignore`.** This RESEARCH.md lives under `.planning/` and must never be committed.
- **Prefer small, reversible changes** over broad rewrites unless structural migration is explicitly requested — Phase 23 IS explicitly a structural rewrite (D-16, D-01 amend-in-place), but the migration approach should still be the least-destructive path (additive columns with defaults, not drop+recreate).
- **Production reliability ahead of experimental scaling.** Refund taxonomy must be narrow and correct; prefer shipping on the proven `withMerits` + `invokeAnthropicText` path.
- **When debugging deploy/runtime issues, verify the current deployed path before adding retries or abstractions** — Pitfall 7 reflects this: Phase 23 must verify `interview-prep-coach` is actually gone from staging/prod before assuming Phase 21 is done.
- **Frontend feature flags use `VITE_*`; backend secrets in Supabase secrets, not `.env`.** Phase 23 adds no new secrets.
- **Reliability priorities: Resume Analysis and Career Compass are business-critical.** Phase 23 must not regress resume auto-fetch or the `resumes` table/bucket contract.
- **Semantic design tokens only — no hardcoded colors.** UI-SPEC locks this; CharacterCounter uses `text-muted-foreground` / `text-primary` / `text-destructive`, never `text-red-500`.

---

## Sources

### Primary (HIGH confidence)

- `.planning/phases/23-interview-prep-runtime-overhaul/23-CONTEXT.md` — D-01..D-19 locked decisions.
- `.planning/phases/23-interview-prep-runtime-overhaul/23-AI-SPEC.md` — full framework + eval + guardrail contract (Sections 1–7).
- `.planning/phases/23-interview-prep-runtime-overhaul/23-UI-SPEC.md` — design tokens, copy, state union, component inventory.
- `.planning/phases/23-interview-prep-runtime-overhaul/23-DISCUSSION-LOG.md` — alternatives considered audit trail.
- `.planning/ROADMAP.md` §"Phase 23" — 14 Success Criteria + scope from Runtime PDF sections.
- `.planning/REQUIREMENTS.md` §"Interview Prep (IPC)" — IPC-01..IPC-10, UX-09/10, BACK-06/07/12.
- `supabase/functions/_shared/anthropic.ts` (verified lines 600–691) — bare-HTTP wrapper contract.
- `supabase/functions/_shared/merit-gateway.ts` (verified lines 1–80) — `withMerits` + `MeritRefundable` + refund taxonomy.
- `supabase/functions/_shared/tier-prompts.ts` (verified lines 1–112) — `loadPromptVariant` + auto-prepend.
- `supabase/functions/_shared/tier-config.ts` (verified lines 1–122) — `getTimeout('elite','quiz') = 80000` + `getModel` Haiku-4.5-for-all.
- `supabase/functions/_shared/interview-prep-prompts.ts` (verified lines 1–204) — current Pro/Elite builders (to be rewritten per D-10).
- `supabase/functions/interview-prep-analyze/index.ts` (verified lines 1–557) — current handler; lines 148–172 cap; 312–320 `record_ai_usage`; 370–431 streak update.
- `supabase/functions/interview-prep-evaluate/index.ts` (verified lines 1–120) — current Elite-only gate + UUID validation.
- `supabase/migrations/20260418000000_interview_prep_tables.sql` (verified lines 1–99) — Phase 19 schema to amend in place per D-01.
- `APIcontextdocuments/interviewprep/STRIVO_Interview_Prep_Runtime.pdf` §1–15 — canonical source of truth (referenced via CONTEXT + ROADMAP extraction; PDF not directly readable in this environment — all Runtime clauses cited here come from the already-transcribed CONTEXT/ROADMAP/AI-SPEC which were authored against the live PDF).

### Secondary (MEDIUM confidence)

- Anthropic Messages API stable (`anthropic-version: 2023-06-01`) [CITED via AI-SPEC §3].
- Anthropic Prompt Caching (2026 stable, ephemeral TTL ~5 min) [CITED via AI-SPEC §4b].
- Zod v3 docs — `safeParse`, `discriminatedUnion`, `z.infer` [CITED via AI-SPEC §4b].
- Arize Phoenix OTLP Deno setup [CITED via AI-SPEC §5; versions ASSUMED].
- Promptfoo CLI for prompt regression [CITED via AI-SPEC §5; version pin deferred to Wave 0].

### Tertiary (LOW confidence / assumed)

- OpenTelemetry esm.sh exact versions (flagged A3).
- `feature_costs` current row contents for `interview_prep` Pro/Elite (flagged A4).
- Haiku 4.5 public pricing (flagged A7).

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every library verified in `package.json` or `supabase/functions/_shared/`; no assumed versions on production code path.
- Architecture: **HIGH** — all patterns anchored to AI-SPEC canonical spec, UI-SPEC locked contract, and verified existing-code pointers.
- Pitfalls: **HIGH** — 7 of 8 pitfalls have concrete line-number references or existing test/migration risk. Pitfall 4 (no-silent-drops false positives) is MEDIUM because it's a language-fuzzy concern that production data will confirm.
- Security: **HIGH** — inherits from proven shared primitives; ASVS mapping is standard.
- Eval strategy: **HIGH** — AI-SPEC §5 rubric is comprehensive; dataset + tooling plan is concrete.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — stable stack; Haiku 4.5 model locked; no imminent framework migration in-flight)

---

## File Handoff

Research complete. The planner (`gsd-planner`) has:
- 19 locked decisions + 7 discretion areas + 10 deferred ideas (user_constraints section)
- 14 REQ-IDs mapped to behavior + test command + file-exists status (phase_requirements + Validation Architecture)
- 13-row architectural responsibility map (tier ownership sanity-check input)
- 13-library standard stack with versions verified
- 4 core patterns + 8 anti-patterns
- 12-row "Don't Hand-Roll" reuse table
- 5-category runtime state inventory with explicit migration guidance
- 8 pitfalls with concrete warning signs
- 4 code examples cross-linked to source file line numbers
- 10-item assumptions log (2 MEDIUM risk items flagged for planner verification)
- 8 open questions with recommendations
- 15-row test map + Wave 0 test file gap list
- ASVS V2–V14 security control mapping

Planner can now create the PLAN.md files without re-researching the stack, Runtime PDF contract, or shared primitives.
