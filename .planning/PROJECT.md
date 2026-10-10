# Strivo AI — Career Intelligence Platform

## What This Is

Strivo AI is a career intelligence platform that helps job seekers optimize their resumes, prepare for interviews, and accelerate their career search. It ships five AI-powered features (Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens, Interview Prep Coach) behind a tier-based subscription model (Free / Pro / Elite) with Merit-currency unit economics.

## Current State

**Active milestone: v5.1 — Dynamic Improvements.** This is an intentionally open-ended delivery cycle: phases are added, scoped, and completed as needs arise rather than being predeclared at milestone initialization.

**v5.1 Phase 01 complete (2026-07-20): Scheduled Elite Downgrade Clarity and Recovery** — scheduled Elite→Free downgrades are now immediately understandable (exact-date confirmation + persistent Billing panel + final-week Dashboard alert), duplicate-safe, and reversible before expiration via an authenticated preview/restore renewal flow, with Stripe/webhooks kept authoritative. 7 plans (4 initial + 3 gap-closure); re-verification passed 20/20 must-haves (D-01..D-20); round-2 code review 0 critical.

**Shipped:** v5.0 — Platform Trust, Reliability & Intelligence (2026-06-25 → 2026-07-19) — 9 phases (+3 INSERTED), 67 plans, 41/41 requirements satisfied. Centralized CORS + error-contract foundation (closed the `www.strivoai.net` outage); a full 17-domain security audit with 4 HIGH money-path/IDOR remediations (advisor floor held at 15); one shared persistent idempotent Merit-safe analysis lifecycle wiring the 4-arg Merit RPC end-to-end, adopted by all five AI features (Onboarding hang killed, LinkedIn rebuilt to deterministic evidence-backed scoring); dashboard intelligence (Recruiter First Impression + Profile Alignment, derived only from stored data); Paddle fully retired (repo + preview + prod); and a seven-layer `verify:baseline` gate + 125/125 VER-02 coverage registry + production Free+Elite real-account pass + 14-item evidence report. Two deliberate production states at close: Career Compass ships dormant (Flip-5 abort → `elite-cc-mixed-format` debug), and `MERIT_SYSTEM_ENABLED` is ON by operator decision. Full detail: [`milestones/v5.0-ROADMAP.md`](milestones/v5.0-ROADMAP.md), [`milestones/v5.0-REQUIREMENTS.md`](milestones/v5.0-REQUIREMENTS.md).

**Prior:** v4.0 — Codebase Hardening (2026-06-25) — 10 phases, 53 plans, 42/42 requirements satisfied, zero functional change.

* Testing safety net: a layered vitest + deno + Playwright model with a blocking `verify:baseline` regression gate wired into CI (`regression-gate.yml`) and `deploy.ps1`, anchored at the `v4.0-baseline` tag — the zero-functional-change spine every later phase re-ran. Deno edge coverage grew 284 → 704 tests, plus promptfoo adversarial suites across the active AI features.
* Repository hygiene + an evidence-backed cross-domain audit catalog (dead code, deps, env, DB, perf) with a KEEP-LIST gating every later removal; conventions documented in `CONTRIBUTING.md`.
* Dead-code cleanup: confirmed-dead files/exports removed and obsolete paths retired (Ollama extraction, `interview-prep-coach`, sectional-lock cluster) with lint + type-check clean.
* Dependency hygiene: 9 major-version bumps + grouped minor/patch batches, vulnerability remediation (vite/react-router-dom/ws), npm audit 32 → 20 (0 critical), reproducible lockfiles — each risky change behind tests + a rollback path.
* Environment + runtime reliability: canonical `docs/ENVIRONMENT.md` + `.env.example` with verified staging/prod separation and fail-closed validation for critical secrets; inline error taxonomy + auth re-throw guards across active edge functions with safe structured logging.
* Database + performance hardening: 15 reversible migrations dropped the security advisor count 73 → 15 (RLS least-privilege, EXECUTE revokes, security_invoker views, search_path pins) plus Phase-9 perf migrations and behavior-preserving refactors (analyze-resume parse dedup, `getLatestResume` accessor), latency measured with no regression.

See [`milestones/v4.0-ROADMAP.md`](milestones/v4.0-ROADMAP.md), [`milestones/v4.0-REQUIREMENTS.md`](milestones/v4.0-REQUIREMENTS.md), and [`milestones/v4.0-MILESTONE-AUDIT.md`](milestones/v4.0-MILESTONE-AUDIT.md) for full closure detail.

**Prior:** v3.0 — Analysis Persistence, Merit Fixes, Pricing UX & Feature Output Parity (2026-06-09) — see [`milestones/v3.0-MILESTONE-AUDIT.md`](milestones/v3.0-MILESTONE-AUDIT.md).

## Current Milestone: v5.1 — Dynamic Improvements

**Goal:** Maintain an open-ended delivery cycle where new phases are added, defined, and completed whenever a concrete need arises.

**Target features:**

* No fixed feature slate or product requirements at initialization
* Each future phase receives its own explicit scope, requirements, success criteria, and verification plan before implementation
* Existing backlog items remain available but are promoted only by explicit user direction

**Key context:** The milestone starts with an empty active roadmap. Phase numbering continues from v5.0, so the first added phase will be Phase 10. Domain research is deferred until a phase introduces a feature or problem that benefits from it. Existing production-reliability, security, Merit-safety, and `verify:baseline` safeguards remain in force.

## Shipped Milestone: v5.0 — Platform Trust, Reliability & Intelligence

**Status:** ✅ Shipped 2026-07-19 — 41/41 requirements satisfied; VER-01/02/04/05 closed on evidence (seven-layer `verify:baseline`, 125/125 VER-02 coverage registry, production Free+Elite real-account pass, 14-item VER-05 evidence report + completeness guard); operator sign-off recorded. Full closure detail in the [v5.0 archives](milestones/v5.0-ROADMAP.md). Two deliberate production operational states recorded in report item 14 (not requirement shortfalls): Career Compass ships **dormant** on production (Flip-5 abort → `/gsd-debug` `elite-cc-mixed-format`), and `MERIT_SYSTEM_ENABLED` is **ON** by operator decision (`sha256('true')`, correcting the plan's original D-03 OFF assumption; open follow-up verification pass).

**Goal:** Strengthen platform security, make every core AI analysis workflow dependable and financially safe, repair confirmed Free-tier + Recruiting Lens failures, replace specified dashboard sections with evidence-backed career intelligence, and retire Paddle — all while preserving v4.0's verification gates and every unrelated production behavior, output quality, billing behavior, and user data.

**Target workstreams:**

1. **Security audit & remediation** — close the deferred SEC-01..10 obligations plus a current full-surface frontend + Edge Function audit (auth/session, authz/RLS, ownership, CORS, input/output, file-upload safety, secrets, sensitive-data/logging, rate limiting, Merit/billing integrity, webhook auth/replay, AI prompt/response exposure, DB function perms, dependency/supply-chain, prod-vs-staging isolation). Every confirmed critical/high finding remediated + evidenced — not merely documented.
2. **Cross-origin & production access reliability** — fix the confirmed `https://www.strivoai.net` rejection centrally (apex + approved www, preview, dev, local per env policy); correct preflight, consistent headers on success + failure, no credential-bearing wildcard, safe rejection of unapproved origins; audit every active Edge Function; add regression tests so the mismatch cannot recur.
3. **Shared AI analysis reliability** — one persistent analysis lifecycle (`created → validating_inputs → reserving_merits → extracting_data → generating → validating_output → saving → completed | retryable_failed | failed | refunded`) across Onboarding Resume, Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens: idempotency/concurrency safety, atomic Merit reserve→settle/refund exactly-once, bounded retry of only-transient failures, strict output validation, a structured internal error taxonomy, and refresh/navigation recovery — never charging for failed or unsaved analyses.
4. **Feature-specific repairs** — Onboarding Resume "Taking Longer Than Expected" hang; preserve Resume Analysis quality (reliability only); LinkedIn Grader ~52/100 score clustering + repeat-run failures (deterministic score computed mathematically from evidence-backed section scores); full Career Compass pipeline (resume-only / LinkedIn-only / combined, persisting Career DNA / fields / gaps / surprise fits / roadmaps); Recruiting Lens production path.
5. **Dashboard intelligence update** — replace *Live Career Profile* → **Recruiter First Impression** and *Activity Stream* → **Profile Alignment**, delete *Progress & Achievements*; Free/Elite entitlement depth; fixed final section order; derived only from genuine stored analysis data with no new AI calls on dashboard load; protected dashboard areas (Career OS, readiness cards, Next 3 Moves, Readiness Matrix, Every Version Ranked, Saved Jobs, Career Launch Path, navbar/sidebar/Merits/History) untouched.
6. **Paddle retirement** — hard expiration gate first (verify the final in-flight Paddle subscription has expired with authoritative billing + app evidence); if satisfied, remove Paddle app behavior / legacy webhook / Paddle-only columns + functions / env config / obsolete types-tests-docs while preserving required billing history; if not, complete all safe preparatory work + a reversible migration/rollback plan and document the exact remaining blocker.

**Key context:** Build on (don't replace) v4.0's layered testing + blocking `verify:baseline` gate — extend it. Root-cause fixes only; no fabricated/personalized results, fake or hardcoded scores, double charge/refund, or charging for failed analyses. Prefer shared, maintainable infrastructure over endpoint-specific patches. Stack unchanged (Supabase Edge/Deno + React/Vite, Anthropic Claude). Phase numbering **reset to Phase 1** (major version, new focus — consistent with v4.0); v4.0 phase dirs archived to `.planning/milestones/v4.0-phases/`. Domain research run before requirements. Interview Prep re-enable (IP-01) and the Nyquist 04/05 sign-off remain deferred (not in v5.0 scope).

## Shipped Milestone: v4.0 — Codebase Hardening: Cleanup, Hygiene & Production Testing

**Status:** ✅ Shipped 2026-06-25 — 42/42 requirements satisfied, integration PASS, zero functional change. Full detail in the [v4.0 archives](milestones/v4.0-ROADMAP.md).

**Goal:** Improve the long-term maintainability, reliability, performance, and operational cleanliness of the existing system — while preserving all current production behavior exactly as it works today (zero functional change).

**Target areas:**

* **Dead-code & refactor cleanup** — remove dead code, unused logic, unnecessary modules, obsolete implementation paths, redundant abstractions, and structural clutter; refactor for clarity, consistency, and maintainability without changing behavior.
* **Repository hygiene & standardization** — reconcile committed-vs-uncommitted state, prune stale branches, tidy `.gitignore`, and standardize commit conventions going forward. **No rewriting of published git history.**
* **Dependency hygiene** — review/update/remove outdated, unused, unnecessary, or risky dependencies; **dependency major-version bumps executed in-milestone, each gated behind full validation + tests before merge.**
* **Environment-variable audit & organization** — audit all `VITE_*` frontend flags and Supabase edge-function secrets; make config clear, consistent, documented, non-duplicative, and aligned across staging/production/backend environments.
* **Database cleanup** — audit unused/unnecessary schemas, tables, functions, policies, and related backend structures; **confirmed-safe removals executed in-milestone behind validation**, with verification that nothing required by current functionality, automation, integrations, analytics, or future-critical workflows is removed.
* **Performance & maintainability refactoring** — simplify inefficient logic, reduce unnecessary work, improve data-access patterns, and clarify architecture/scalability where clear opportunities exist — all behavior-preserving.
* **Production-ready testing model** — establish a layered strategy (unit + integration + contract + Playwright browser E2E for critical flows: auth, analysis, checkout) on top of the existing vitest / deno / promptfoo suites, providing near end-to-end confidence and regression protection that proves cleanup/refactor work changed no behavior.

**Key context:**

* **Hard constraint:** zero functional change. No active user-facing or internal functionality may be removed, altered, degraded, or unintentionally changed. The testing model is the safety net that *proves* behavior is preserved.
* **Phase numbering resets to Phase 1** for v4.0 (major version, entirely new focus). v3.0 phase directories (28–51) archived to `.planning/milestones/v3.0-phases`.
* **Git scope:** repo hygiene only — no history rewrite/squash/rebase of published commits. Never `git add -f` / `git add -A` (`.planning/` is tracked; stage specific files).
* **Risk appetite:** execute dependency major-bumps and confirmed-safe DB removals *within* this milestone, each behind validation + tests before merge (not deferred to a later pass).
* **Brownfield maintenance milestone** — no new product features. Candidate cleanup targets carried from the v3.0 backlog: Paddle remnants (legacy subscriptions), legacy `usage_tracking` retirement, obsolete Phase 50 extraction path, and 21 acknowledged deferred artifacts from v3.0 close.
* **Stack unchanged:** Supabase Edge Functions (Deno) + React/Vite frontend; Anthropic Claude.

## Previous Milestone: v3.0 — Analysis Persistence, Merit Fixes, Pricing UX & Feature Output Parity

**Goal:** Fix production/staging issues across Merits, analysis caching/history, pricing checkout, and feature output gating so analysis behavior is consistent across Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens, and Interview Prep.

**Target features:**

* **Merit economy fixes** — Free cap raised from 5 → 10/month; immediate pre-call deduction with optimistic UI; refund on AI failure; idempotency on retries/refresh; purchased Merits exceed cap (`X / cap` display, X can exceed); subscription replenishment respects cap, shop credits do not
* **Stripe shop bug fix** — at-cap user (e.g. 75/75) buying Merits gets charged but balance never increments; webhook idempotency hardening
* **Exact-input analysis caching** across all 5 features — feature + tier/variant + all output-affecting input hashes; cache hit returns saved output instantly without Claude call; surfaces in history
* **Analysis history persistence** — every feature persists results to Supabase with sufficient metadata for dashboard history; audit + repair missing inserts, mismatched IDs, frontend mapping
* **Cross-feature input context** — Recruiting Lens / Interview Prep / Career Compass default to user's most recent Resume + LinkedIn analysis; prior-analysis selector dropdown (file name, date, score); empty-state when no priors
* **Pricing & checkout UX** — fix `404 /checkout` upgrade bug; verify Free→Pro, Free→Elite, Pro→Elite, shop pack flows; fix `/settings/billing` left-nav stuck-on-loading screen; redesign `/pricing` to match Strivo design system (light/dark); fix Celebrations page light/dark + visual polish
* **Resume Analysis** — remove "Priority Actions" section, keep only "Priority Improvements" for all tiers; defensive rendering for old cache
* **LinkedIn Grader** — auto-pull onboarding LinkedIn PDF (replaceable, replacement becomes new source); Ready-to-Paste Improvements gating (Free 1 visible + 4 locked w/o hidden Claude generation; Pro 4–7 visible; Elite full); remove "What's working for you", keep "Key strengths"; defensive rendering for old cache
* **Career Compass — Free** — full Career DNA; partial Best-Fit Roles (3 real + 2 skeleton), Surprise Fits (2+2), Fields (3+2), Roles (3+2), Readiness (score + "what you have" real; gaps + skill assessment skeleton); Roadmap entirely fake skeleton (no real generation)
* **Career Compass — Pro/Elite bug fix** — best-fit roles, surprise fits, fields, roles, readiness, roadmap currently empty/missing; fix prompt schema + frontend rendering; defensive rendering for partial old cache
* **Recruiting Lens** — defaults to latest resume + LinkedIn (with selector override); animated AI tutorial/modal before analysis (where to find/paste JD, where context comes from); mandatory company + role + JD inputs; results saved to Saved Jobs + Supabase (tile shows company + role; opens cached result)
* **Interview Prep — Pro/Elite production fix** — `interview-prep-analyze` returns 503 after successful OCR + Claude call (TTFB 8.91s, in=2686 / out=986, sonnet-4 in production logs 2026-04-28); investigate timeout / response handling / CORS / streaming
* **Test/QA coverage** — verifiable test or QA checklist per fix

**Key context:**

* Brownfield bug-fix + UX-parity milestone; **not** a feature-expansion milestone
* Pre-implementation discovery required: identify canonical source of truth for tier, total/sub/shop balances, history tables, cache fingerprint storage, per-feature analyze flows
* Preserve existing architecture; broad rewrites only when the existing structure IS the bug
* Phase numbering continues from v2.0 (next phase = 28)
* Inherits v2.0 tech debt (Phase 27 commits not on main, BUDGET-03 input-guard deferred); flag if any v3.0 work depends on these
* Production failure log captured for Interview Prep diagnosis

## Previous Milestone: v2.0 Merit System & Monetization (SHIPPED)

**Goal:** Ship Strivo's complete monetization layer — Merit currency, three subscription tiers (Free / Pro / Elite, monthly + yearly), Merit Shop with 4 packs, tier-gated AI prompt variants where locked sections are NEVER generated, and the Interview Prep feature (Pro flashcards + Elite quiz with streak) — anchored to the unit economics in the Strivo business plan.

**Source of truth:** `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx`

**Target features:**

* Merit currency with dual-balance ledger (subscription-cycle balance resets monthly; shop balance never expires)
* Subscription tiers: Free $0 (5 lifetime Merits) / Pro $8.99 mo or $89.99 yr (75 Merits/mo) / Elite $16.99 mo or \$169.99 yr (150 Merits/mo)
* Merit Shop with 4 one-time packs: 3/$1.99, 10/$4.99, 25/$9.99 (featured), 50/$17.99
* Stripe migration: 4 subscription Price IDs + 4 shop pack Price IDs + signed webhook handler with idempotent crediting
* Pre-call Merit deduction with atomic RPC, subscription-first / shop-fallback ordering, and auto-refund on AI failure
* Tier-gated prompt variants per feature (`_free.md` / `_pro.md` / `_elite.md`) so locked content is never generated
* Resume / LinkedIn / Career Compass / Recruiting Lens / Interview Prep tier output maps (Free partial / Pro full / Elite full+extras)
* Free monthly LinkedIn Grader scan for Pro/Elite (skips Merit deduction once per cycle)
* Merit balance UI: persistent dashboard badge, per-feature cost preview, low-balance warnings, zero-balance disable state
* Locked-section UI primitive: header visible, blurred body, teaser, upgrade CTA
* Pricing page (`/pricing`) with monthly/yearly toggle, savings badges, current-plan highlight
* Interview Prep — Pro: 3 STAR flashcards. Elite: interactive quiz (5–7 questions, 500-char answers, STAR scoring, streak with 24h cold / 48h expire, 3 quizzes/day cap)
* Migration path: existing users → Free tier + 5 lifetime Merits, `MERIT_SYSTEM_ENABLED` feature flag, legacy `usage_tracking` retained read-only

**Key context:**

* **Replaces** (does not extend) the prior v2.0 "Credit System + Stripe Migration" plan. Old planning artifacts archived to `.planning/_archive/v2.0-credit-system/`.
* Builds on v1.0's shipped foundation: unified navbar, Interview Prep backend (will be replaced by tier-aware variant), LinkedIn Grader v3.0 backend, partial Stripe scaffolding (`profiles.stripe_*` columns + `stripe_webhook_events` table)
* Free tier is hard-capped at **5 lifetime Merits** — reverses the prior v2.0 weekly-refill plan
* Paddle in-flight subscriptions honored until renewal; all new checkouts go through Stripe
* Yearly plans billed upfront via Stripe; Merits granted monthly on anniversary cadence (NOT lump-sum)
* Cost ceiling: Free analyses must stay under **\$0.051 per analysis** (enforced via Free prompt variants + maxTokens caps)
* Phase numbering continues from v1.0 (v2.0 starts at Phase 10)

## Core Value

Every feature must work reliably end-to-end with predictable unit economics. Merit-driven monetization makes cost-per-analysis fixed and visible. Free users get a deliberately partial, high-quality taste with a clear upgrade wall. Paid users get the full experience, with strict server-side token caps, prompt-level locked-section omission, and Merit refunds on any AI failure.

## Requirements

### Validated (shipped in v1.0)

* ✓ Resume Analysis with rubric-based scoring and streaming/queue paths
* ✓ Career Compass analysis
* ✓ Skills Gap Analysis
* ✓ Job Match and job comparison
* ✓ Supabase Auth with email/password
* ✓ Global tier-based access control scaffolding (Free/Pro/Elite)
* ✓ Dark mode / light mode theming
* ✓ Unified navbar across all pages with feature links, theme toggle, profile dropdown, responsive hamburger
* ✓ Interview Prep Coach backend (8 questions, STAR, Pro/Elite gate) — will be **replaced** by tier-aware Merit variant
* ✓ Interview Prep Coach frontend (indigo cards, filters, copy) — will be **replaced** by Pro flashcards + Elite quiz
* ✓ LinkedIn Grader v3.0 backend: 4-section scoring, Haiku 4.5, quoted feedback, `requireAuth`
* ✓ LinkedIn Grader v3.0 frontend rendering

### Validated (shipped in v4.0 — Codebase Hardening)

* ✓ Production-ready layered testing model (vitest + deno + Playwright) with a blocking `verify:baseline` regression gate — v4.0 (TEST-01..08, NFR-01)
* ✓ Repository hygiene, dead-code cleanup, and dependency hygiene with reproducible lockfiles — v4.0 (REPO-01..05, CLEAN-01..06, DEP-01..05, NFR-02)
* ✓ Canonical env-var reference + fail-closed validation; runtime-reliability error taxonomy + auth re-throw guards — v4.0 (ENV-01..05, RUN-01..07, NFR-03)
* ✓ Database least-privilege hardening (security advisor 73→15) + behavior-preserving performance refactors, measured no-regression — v4.0 (DB-01..06, PERF-01..04)

All under a zero-functional-change constraint; full traceability in [`milestones/v4.0-REQUIREMENTS.md`](milestones/v4.0-REQUIREMENTS.md).

### Validated (v5.0 — Platform Trust, Reliability & Intelligence — shipped 2026-07-19)

* ✓ Cross-origin & error-contract foundation: centralized env-driven `ALLOWED_ORIGINS` allowlist across all 21 active Edge Functions, origin reflection + `Vary: Origin`, fail-closed rejection of unapproved origins (no credential-bearing wildcard), CORS on success + 4xx/5xx + preflight, table-driven + static drift guards in `verify:baseline`; apex + www verified live and the `www.strivoai.net` outage closed — Phase 1 (CORS-01..06)
* ✓ Security audit & remediation: deferred SEC-01..10 closed + full 17-domain frontend/Edge audit; 4 HIGH money-path/IDOR findings remediated with RED→GREEN guards; advisor floor held at 15; final security record produced — Phase 2 (SEC-11..15)
* ✓ Shared AI analysis reliability lifecycle: one persistent idempotent Merit-safe 11-state lifecycle (CAS RPCs, settle-on-saved, refund-exactly-once, transient-only bounded retry, strict no-masking validation, structured error taxonomy, `useAnalysisRun` recovery) wiring the 4-arg idempotent `check_and_deduct_merits` end-to-end — Phase 3 (LIFE-01..09)
* ✓ Feature-specific repairs: all five features migrated onto the lifecycle in ascending blast radius; Onboarding "Taking Longer" hang killed; LinkedIn rebuilt to deterministic server-computed evidence-backed scoring (no ~52 clustering); Career Compass full pipeline repaired; Recruiting Lens + Resume cross-origin corrected — Phases 4/5/6 (FEAT-01..06, VER-03)
* ✓ Dashboard intelligence: Recruiter First Impression + Profile Alignment derived only from stored data (no on-load AI, no fabricated scores), Progress & Achievements deleted, fixed section order, protected areas untouched — Phase 7 (DASH-01..06)
* ✓ Paddle retirement: two-source expiration gate cleared, Paddle removed end-to-end (repo + preview + prod schema/function/env/types) behind a permanent no-live-surface guard, billing history preserved — Phase 8 (PADL-01..04)
* ✓ Testing & verification: `verify:baseline` extended to a seven-layer gate; 125/125 VER-02 coverage registry; production Free+Elite real-account pass (PII guard green); 14-item evidence report — Phase 9 (VER-01/02/04/05)

Full traceability in [`milestones/v5.0-REQUIREMENTS.md`](milestones/v5.0-REQUIREMENTS.md).

### Active (v5.1 — Dynamic Improvements)

No product requirements are active at milestone initialization. Requirements are added when the user defines a concrete phase, then mapped to that phase before implementation. Candidate carry-overs remain in ROADMAP.md → Backlog / Parking Lot and are not automatically promoted.

### Future (deferred)

* Interview Prep Coach re-enable on production (IP-01) — single `VITE_FEATURE_INTERVIEW_PREP` flip + redeploy after staging soak; code/prompts/edge functions kept in-repo (explicitly not in v5.0 scope — the shared lifecycle covers the other five features)
* Nyquist VALIDATION sign-off for v4.0 Phases 04/05 + the R-03 flaky `AnalysisHistory.interviewPrep` test (minimal v4.0 carry-over)
* Analytics overhaul beyond monetization-funnel hooks
* Native mobile app
* Elite-only Career Compass perks beyond compensation intelligence + smart application strategy

### Out of Scope (v2.0)

* Redesign of core AI output schemas (only tier-conditional field omission, no schema rewrites)
* New AI features beyond those in the Merit spec
* Database migration / platform changes unrelated to Merits, Stripe, or quiz system
* Resume / Career Compass core scoring changes — only tier-conditional output trimming
* Analytics platform rework
* Weekly free-Merit refill (explicitly removed from prior v2.0 plan — Free is 5 lifetime only)
* Lump-sum yearly Merit grants (must be monthly cadence)
* Client-side Merit manipulation of any kind

## Context

* **Existing codebase:** Brownfield with 20+ edge functions, React SPA, Supabase backend
* **Payment state:** Paddle client-side checkout live (`usePaddleCheckout.ts`), no Paddle webhook; partial Stripe scaffolding (`profiles.stripe_customer_id/subscription_id/price_id` columns + `stripe_webhook_events` table from migration `20260412000000`); no Stripe handler or client code yet
* **Current credit system:** Global per-month pool, hardcoded limits (free 3 / pro 100 / elite 300), single `usage_tracking` table, `can_perform_ai_action()` RPC — superseded by Merit ledger but retained read-only during migration
* **Locked UI:** `<ProFeatureBlur>` exists for whole-feature locks; no sectional lock primitive yet
* **Models:** `analyze-career` already uses Haiku 4.5; `analyze-resume` defaults to Sonnet; others mixed — Free variants must route to Haiku 4.5
* **Design system:** "Institutional Intelligence" — Bloomberg terminal meets Linear, HSL CSS variables, semantic tokens, glass effects, Framer Motion

## Constraints

* **Stack:** Supabase Edge Functions (Deno) + React frontend — no new infrastructure
* **AI provider:** Anthropic Claude only; Free tier locked to Haiku 4.5
* **Cost discipline:** AI must not generate content the user cannot see; locked sections are omitted at the prompt level, not just hidden in UI
* **Atomicity:** Merit deduction must be server-side, atomic, and impossible to bypass; balances must never go negative
* **Behavior:** All existing features remain functional for paid users at all times during migration
* **Conventions:** TypeScript strict, existing patterns, semantic design tokens
* **Git:** Do not commit anything in `.planning/` or modify `.gitignore`

## Key Decisions

| Decision                                                                                    | Rationale                                                                              | Outcome                |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| Merit currency with dual-balance ledger (subscription + shop)                               | Predictable unit cost; enables shop top-ups without breaking subscription cadence      | Confirmed              |
| Free tier = 5 lifetime Merits, no refill                                                    | Spec is explicit; reverses prior weekly-refill plan; forces upgrade decision           | Confirmed              |
| Subscription Merits reset monthly, do NOT roll over                                         | Drives recurring engagement and prevents unbounded liability                           | Confirmed              |
| Shop Merits never expire and roll over across tier changes                                  | User trust; purchased value is permanent                                               | Confirmed              |
| Tier-gated prompts (`_free.md` / `_pro.md` / `_elite.md`) per feature                       | AI never generates locked content → hard cost discipline                               | Confirmed              |
| Pre-call Merit deduction with atomic RPC + auto-refund on failure                           | Prevents resource consumption without payment; preserves UX on AI errors               | Confirmed              |
| Stripe replaces Paddle as primary checkout                                                  | Webhook-backed integrity, sub + pack parity, idempotent crediting                      | Confirmed              |
| Yearly plans billed upfront, Merits granted monthly on anniversary                          | Cash-flow win without giving away 12 months of Merits day one                          | Confirmed              |
| Pro/Elite get 1 free LinkedIn scan per billing cycle                                        | Removes friction from a frequent-use feature without uncapping cost                    | Confirmed              |
| Interview Prep Pro = 3 STAR flashcards, Elite = full interactive quiz with streak           | Justifies Elite price; dopamine retention loop                                         | Confirmed              |
| Existing users migrate to Free tier + 5 lifetime Merits                                     | Clean cutover; no grandfathering for old credit pool                                   | Confirmed              |
| `MERIT_SYSTEM_ENABLED` feature flag for cutover                                             | Safe rollback path during launch                                                       | Confirmed              |
| v2.0 phase numbering continues from v1.0 (10+)                                              | Preserve v1.0 history; no reset                                                        | Confirmed              |
| Security audit deferred                                                                     | Too much scope alongside monetization rewrite; post-launch is acceptable risk          | Confirmed              |
| Replace prior v2.0 plan in place; archive old artifacts                                     | New spec is authoritative and incompatible with prior CRED-\* / PAY-\* requirement IDs | Confirmed              |
| Free tier resume analysis uses single Anthropic call (maxTokens=4000) instead of 3 parallel | Cuts input token cost \~67%; FREE\_SINGLE\_CALL\_MAX\_TOKENS is 20% of Elite (GATE-09) | Confirmed — Phase 15.1 |
| OCR PDF uses FREE\_MODEL from tier-config, maxTokens=3000                                   | Aligns OCR with tier-config model routing; reduces per-page budget                     | Confirmed — Phase 15.1 |
| v4.0 phase numbering reset to Phase 1 (major version, entirely new focus)                   | Clean slate for a brownfield-maintenance milestone; v3.0 phases 28–51 archived          | Confirmed — v4.0        |
| Zero-functional-change proof model: `verify:baseline` green is the gate (Phase 9 shifts from "git diff empty" to "behavior preserved despite edits") | A hardening milestone must *prove* no behavior changed; the baseline is the spine every phase re-runs | Confirmed — v4.0 |
| First-class KEEP-LIST gates every removal (gated-but-live is NEVER safe)                     | Audit-before-action: destructive phases act only on confirmed-dead items                | Confirmed — v4.0 Phase 3/4 |
| DB changes ride a preview→prod hard gate; operator applies every prod migration (Claude read-only on prod) | No autonomous prod writes; advisor-clears + SELECT-as-role no-regression verified on preview first | Confirmed — v4.0 Phase 8 |
| Major-version dependency bumps + confirmed-safe DB removals executed in-milestone, each behind tests + a documented rollback (NFR-02) | Don't defer risky-but-valuable hygiene; gate each change individually instead | Confirmed — v4.0 Phase 6/8 |
| v5.0 phase numbering reset to Phase 1 (major version, new focus)                            | Consistent with v4.0; clean per-milestone numbering; v4.0 phase dirs archived to `milestones/v4.0-phases/` | Confirmed — v5.0 |
| v5.0 runs domain research before requirements                                               | New shared analysis-lifecycle state machine + dashboard intelligence sections warrant external pattern validation (unlike pure-hardening v4.0) | Confirmed — v5.0 |
| v5.0 extends (not replaces) the v4.0 `verify:baseline` gate; root-cause fixes only          | A trust milestone must prove no regression and must never mask failures behind fallbacks/fabricated results | Confirmed — v5.0 |
| Shared, persistent AI-analysis lifecycle as common infrastructure (not per-endpoint patches) | One coherent state / idempotency / Merit-safety model across 5 features; preserves feature-specific prompts/schemas | Confirmed — v5.0 |
| Paddle destructive removal gated on verified subscription-expiration                         | Removing Paddle early could revoke/extend access incorrectly or lose required billing history | Confirmed — v5.0 |
| v5.1 starts with an empty active roadmap and gains phases dynamically                         | The user will define work as needs arise; inventing placeholder product scope would create false commitments | Confirmed — v5.1 |
| v5.1 phase numbering continues from v5.0; first added phase is Phase 10                       | No reset flag was requested, so the default cross-milestone numbering rule applies | Confirmed — v5.1 |
| Backlog items require explicit promotion into v5.1                                            | Preserve deferred context without silently converting old follow-ups into current commitments | Confirmed — v5.1 |
| Research is deferred until a concrete phase needs it                                           | An empty dynamic milestone has no feature domain to research meaningfully | Confirmed — v5.1 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

***

*Last updated: 2026-07-20 — **v5.1 Phase 01 (Scheduled Elite Downgrade Clarity and Recovery) complete & verified** (`01-VERIFICATION.md` passed 20/20 on re-verification after 3 gap-closure plans fixed CR-01/CR-02/CR-03/WR-01; round-2 code review 0 critical / 2 advisory warnings; 3 human-verification items carried as standing recommendations: responsive visual matrix, real browser-session dismissal lifecycle, deployed Stripe reconciliation).*

*Last updated: 2026-07-19 — **Milestone v5.1 Dynamic Improvements started.** The milestone intentionally begins with no active product requirements or roadmap phases; phases will be added, scoped, and verified individually as needs arise. Phase numbering continues from v5.0, making Phase 10 the next phase. Existing backlog items remain opt-in. Core Value and all v5.0 reliability, security, Merit-safety, and verification constraints remain unchanged.*

*Last updated: 2026-07-19 after v5.0 milestone — **v5.0 Platform Trust, Reliability & Intelligence SHIPPED** (9 phases + 3 INSERTED, 67 plans, 41/41 requirements satisfied; operator sign-off). Full evolution review: Current State updated to "no active milestone"; the v5.0 section moved from Current → Shipped Milestone with closure status; all seven v5.0 requirement groups (CORS/SEC/LIFE/FEAT/DASH/PADL/VER) moved to Requirements → Validated; Active re-pointed to "next milestone TBD" (REQUIREMENTS.md archived + removed). Core Value unchanged (still the right priority — the trust milestone directly delivered it: failed analyses never charge Merits, results never fabricated, secure by audit). Out of Scope reasoning re-audited, still valid. v5.0 Key Decisions (phase-reset, extend-not-replace the gate, shared lifecycle, Paddle-gate) already logged as Confirmed. Two deliberate production states carried forward honestly (Career Compass dormant; `MERIT_SYSTEM_ENABLED` ON). Archives: `milestones/v5.0-ROADMAP.md`, `milestones/v5.0-REQUIREMENTS.md`; tagged `v5.0`. Next: `/gsd:new-milestone`.*

*Last updated: 2026-07-06 — **Phase 5 (Feature Migration B — Resume Analysis + Onboarding) complete & verified** (`05-VERIFICATION.md` passed, 6/6 must-haves; FEAT-01, FEAT-02). 05-01 re-homed Onboarding onto `runAnalysisLifecycle('onboarding')` (origin discriminator, stable non-mutating `inputIdentity`) and killed the "Analysis Taking Longer Than Expected" hang (removed fire-and-forget + 120s dead-end, run-id recovery via `useAnalysisRun`); landed the shared permissive resume-validation seam + triple-write save() reconciliation (authoritative `resumes.grading_data` throws pre-settle, `analysis_results` mirror demoted to log-and-continue). 05-02 gave the high-traffic streaming Resume path a persistent lifecycle record via a streaming-aware wrapper (create_or_recover → reserve-with-key → settle-on-saved) that leaves the TransformStream token path byte-identical, closed the `analyze-resume:728` idempotency gap (one `deriveIdempotencyKey` on the shared meritCtx fixes both streaming + non-streaming deduction), added frontend attemptNonce + submit-lock + run_id recovery. 05-03 folded the FEAT-01/FEAT-02 scenario matrix into `verify:baseline` — five deterministic Deno guards (idempotency + Pitfall-8 stable key, validation-convergence, byte-preserve, apex+www CORS status matrix, streaming-wrapper ordering) + frontend submit-lock/preserve-previous vitest — updated the dormancy guard to release analyze-resume while keeping career_compass + the job workers asserted dormant, and registered all five in `deno.json test:ci` (deno 1056/0/12, vitest 498/0). Ships dormant behind two-level flags (default OFF) with byte-identical legacy fall-through. Operator-gated Task 4 approved: live apex+www CORS re-proof on prod (both echo ACAO + `Vary: Origin` incl. 401, evil fail-closed), first-byte latency no-regression on staging, refresh/navigation recovery works, flag-flip soak staged (Onboarding → Resume); no DB migration, advisor floor 15 unchanged. 5 of 9 v5.0 phases complete; next: Phase 6 (Feature Migration C — Career Compass; needs `/gsd-discuss-phase 6` or `/gsd-plan-phase 6`).*

*Last updated: 2026-07-01 — **Phase 1 (Cross-Origin & Error-Contract Foundation) complete & verified** (`01-VERIFICATION.md` passed, 7/7 must-haves; CORS-01..06) — first v5.0 phase shipped. `_shared/cors.ts` rewritten to resolve one env-driven `ALLOWED_ORIGINS` allowlist (replacing single-origin `APP_URL`), reflecting the approved request Origin with `Vary: Origin` and failing closed (no ACAO, no wildcard) for unapproved origins; new `withCors` (guarantees CORS on every exit incl. thrown Responses/Errors + preflight) + `jsonError` (structured, frontend-readable error envelope); `auth.ts` `unauthorizedResponse()` now CORS-tagged. All 21 active user Edge Functions wrapped in `withCors(req,'user',…)`; table-driven `cors.test.ts` + static drift-guard `cors-audit.test.ts` (21-function invariant) registered in `deno.json test:ci` inside `verify:baseline`. Operator-gated 01-08: `ALLOWED_ORIGINS` set per-environment (staging `cimjltzovkahkqecpwgi` = preview-alias + localhost; prod `zjpjapgraoxdukdvpjes` = apex + www only) and ALL functions redeployed; live curls confirmed apex AND www reflect ACAO + `Vary: Origin` on analyze-resume/analyze-career/grade-linkedin/recruiting-lens, disallowed origins + unlisted subdomains get no ACAO, and 401s render CORS + `{"error":"Unauthorized"}` — **the `www.strivoai.net` outage is closed**. 1 of 9 v5.0 phases complete; next: Phase 2 (Security Audit & Remediation; needs `/gsd-discuss-phase 2` or `/gsd-plan-phase 2`).*

*Last updated: 2026-06-25 — **Milestone v5.0 (Platform Trust, Reliability & Intelligence) started** via `/gsd:new-milestone`. Phase numbering reset to Phase 1 (v4.0 phase dirs archived to `milestones/v4.0-phases/`). PROJECT.md updated: Current State += in-planning line; **Next Milestone → Current Milestone v5.0** (6 workstreams: security audit, cross-origin reliability, shared AI-analysis lifecycle, feature repairs, dashboard intelligence, Paddle retirement); Active requirements re-pointed to v5.0 `REQUIREMENTS.md`; Future += Interview Prep re-enable + Nyquist 04/05 carry-over; Key Decisions += 5 v5.0 rows. Domain research → requirements → roadmap next.*

*Last updated: 2026-06-25 after v4.0 milestone — **v4.0 Codebase Hardening SHIPPED** (10 phases, 53 plans, 42/42 requirements satisfied, integration PASS 5/5 flows, zero functional change). Full review: Current State + Requirements/Validated moved to v4.0; Key Decisions += 5 v4.0 rows (phase-reset, zero-functional-change proof model, KEEP-LIST gating, preview→prod DB gate, in-milestone risky-change discipline); Next Milestone seeded (security audit / Paddle removal / Interview Prep re-enable, all TBD via `/gsd:new-milestone`). Archives: `milestones/v4.0-ROADMAP.md`, `milestones/v4.0-REQUIREMENTS.md`, `milestones/v4.0-MILESTONE-AUDIT.md`. Tagged `v4.0`.*

*Last updated: 2026-06-23 — Phase 07 (Environment Variable Audit & Organization) complete & verified (5/5 must-haves, `07-VERIFICATION.md` passed) under v4.0's zero-functional-change constraint (`git diff <pre-07>..HEAD -- src supabase/functions` EMPTY; deterministic baseline green: vitest 457 / deno 699-0-11). ENV-03/ENV-02: re-created `.env.example` + `.env.test.local.example` to the live 7-frontend + 52-edge surface and authored the canonical `docs/ENVIRONMENT.md` reference; excluded code-dead `OLLAMA_*` (x5) + doc-ghost `RAPIDAPI_KEY`; recorded the operator un-set list in `RESIDUAL-REGISTER.md`. ENV-05: source-cited fail-closed coverage matrix (`ENV-FAILCLOSED.md`) proving all 6 critical secrets (APP_URL, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, INTERNAL_JOB_SECRET) fail closed at HEAD — operator dispositioned **add nothing** (no guard added, no existing guard weakened). ENV-04: operator-run names-only cross-surface audit across all 4 secret stores reconciled into `ENV-SEPARATION.md` — **headline: NO classic cross-environment leakage** (GitHub Actions = exactly the 5 TEST-project gate secrets); 10-item operator fix list emitted (notable: `AI_TEST_MODE` misplaced on prod Supabase; a Supabase→Vercel integration-injected privileged-secret cluster in the frontend host — NOT browser-exposed since Vite bundles only `VITE_*`; orphaned `GOOGLE_GEMINI_API_KEY`/`AI_PROVIDER`; missing `VITE_FEATURE_INTERVIEW_PREP` on Vercel-preview) — agent mutated NO live store (D-07). NFR-03: reconciled README/CLAUDE.md/AGENTS.md/TESTING-STRATEGY.md to point at `docs/ENVIRONMENT.md`, corrected the stale README "swap config.toml" deploy description, dropped `RAPIDAPI_KEY`, removed 3 committed merge-conflict markers, fixed the AGENTS.md Codex→Claude bug. Code review clean (0 findings; docs-only scope). 7 of 9 v4.0 phases complete; next: Phase 7.1 (Runtime Error Handling, Supabase Advisory Triage & Production Reliability — INSERTED, URGENT; needs `/gsd-discuss-phase 7.1` or `/gsd-plan-phase 7.1`).*

*Last updated: 2026-06-25 — Phase 08 (Database Cleanup & Migrations) complete & verified (`08-VERIFICATION.md` passed, 4/4 must-haves; DB-03/04/05/06) under v4.0's zero-functional-change constraint (`git diff <pre-08>..HEAD -- src supabase/functions` EMPTY; deterministic baseline green: vitest 457 / deno 704-0-11). A strictly-sequential, fully operator-gated production-database pipeline: prod (`zjpjapgraoxdukdvpjes`) read-only to Claude, operator applied every prod migration, every change rode a preview→prod hard gate (apply-preview → verify-advisor-clears + SELECT-as-role no-regression → operator-applies-prod → read-only re-verify). **08-01** re-pulled canonical prod read-only and found the Phase-3 DB-02 baseline had been captured against the PREVIEW project — true prod is near-empty (1 user), so disuse signals are unreliable → **DB-03 confirmed-safe removal set = 0** (document, remove nothing; zero `DROP TABLE/COLUMN`). **DB-04**: `usage_tracking` documented GATED (still actively written; live FE callers named). **DB-05** (12 reversible migrations, all w/ rollbacks): security advisor **73→15** — `security_definer` views ×4→`security_invoker`; `search_path` pins on `ts_to_utc_date`(='') + `increment_rate_limit`(=public); explicit-deny ×3 (`rls_enabled_no_policy`→0); `linkedin_grades` over-permissive "Anyone can view" SELECT dropped (owner-scoped, no cross-user read); ×60 anon/authenticated EXECUTE grants on SECURITY DEFINER RPCs → anon **30→0** + authenticated **30→11** (11 gated incl. `can_perform_ai_action`, never revoked) via `REVOKE FROM PUBLIC`. The 15 remaining advisors are all intentional (11 gated RPCs) or out-of-DB-scope (2 service-role policies + 2 needs-operator Auth/storage). The preview→prod gate caught two bugs before prod (a self-aborting `linkedin_grades` verification assertion; a silent-no-op `REVOKE FROM anon/authenticated` that left the blanket `PUBLIC` grant intact). Code review 0 blockers (4 advisory rollback-comment-fidelity warnings). 8 of 9 v4.0 phases complete; next: Phase 9 (Performance & Maintainability Refactoring; needs `/gsd-discuss-phase 9` or `/gsd-plan-phase 9`).*
