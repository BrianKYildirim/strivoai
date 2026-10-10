# Strivo AI — Career Intelligence Platform

## What This Is

Strivo AI is a career intelligence platform that helps job seekers optimize their resumes, prepare for interviews, and accelerate their career search. It ships five AI-powered features (Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens, Interview Prep Coach) behind a tier-based subscription model (Free / Pro / Elite) with per-feature AI credit accounting.

## Current Milestone: v2.0 Monetization & Credit System

**Goal:** Install a credit economy, Stripe-backed pack/subscription checkout, per-feature token caps, and tier-based content locking across all 5 AI features so that unit economics are predictable and every free user sees a concrete upgrade path.

**Target features:**

* Credit ledger (1 credit ≈ 1750 tokens), weekly refill for free users (+2, cap 3)
* Credit packs ($2.99 / $4.99 / $8.99) via one-time Stripe checkout
* New subscription pricing — Pro $16.99/mo ($183.99/yr), Elite $26.99/mo ($275.99/yr)
* Stripe migration (replaces Paddle as primary checkout; Paddle honored for in-flight subs)
* Per-feature token caps enforced server-side; Haiku 4.5 for all free-tier analyses
* Tier-based content gating on every feature with locked-section placeholders (AI never generates locked content)
* Interview Prep Elite: net-new quiz system with input-answer AI scoring + streak tracking
* Recruiting Lens: resume auto-detect fix + `solution` field on gaps + URGENT styling
* Persistent navbar credit badge + cost preview on every Analyze button

**Key context:**

* Builds on v1.0's shipped foundation (unified navbar, Interview Prep backend+frontend, LinkedIn Grader v3.0 backend)
* Absorbs v1.0 unbuilt work: Stripe migration (STR-*), LinkedIn Grader frontend gating (LIG-\*), Recruiting Lens resume detection (RCL-01)
* Defers v1.0 security audit (SEC-*) to a later milestone
* Discovery: the v1.0-flagged LinkedIn Grader frontend schema mismatch is already resolved in current code — v2.0 only needs gating, not fix
* Paddle checkout is live (client-only, no webhook) — Stripe migration re-establishes webhook-backed integrity

## Core Value

Every feature must work reliably end-to-end with predictable unit economics. Users on Free see a deliberately partial, high-quality taste of each feature with clear upgrade paths. Paid users (Pro/Elite) get the full experience reliably, with strict server-side token caps preventing runaway AI cost.

## Requirements

### Validated (shipped in v1.0)

* ✓ Resume Analysis with rubric-based scoring and streaming/queue paths
* ✓ Career Compass analysis
* ✓ Skills Gap Analysis
* ✓ Job Match and job comparison
* ✓ Supabase Auth with email/password
* ✓ Global tier-based access control scaffolding (Free/Pro/Elite)
* ✓ Global AI credit tracking and usage limits (per-month, per-tier, global pool)
* ✓ Dark mode / light mode theming
* ✓ Unified navbar across all pages with feature links, theme toggle, profile dropdown, responsive hamburger (v1.0 Phase 01)
* ✓ Interview Prep Coach backend: 8 tailored questions via Claude, STAR framework, Pro/Elite gate (v1.0 Phase 02)
* ✓ Interview Prep Coach frontend: indigo-themed UI, category filters, expandable cards, clipboard copy (v1.0 Phase 03)
* ✓ LinkedIn Grader v3.0 backend: 4-section scoring, Haiku 4.5, quoted feedback, `requireAuth` (v1.0 Phase 04)
* ✓ LinkedIn Grader v3.0 frontend rendering (confirmed working — audit stale)

### Active (v2.0)

**Credit System**

* [ ] **CRED-01**: DB schema — `credit_ledger`, `credit_balance`, `credit_cost_map`
* [ ] **CRED-02**: Atomic `consume_credits(user_id, feature, cost)` RPC with tier access check
* [ ] **CRED-03**: Per-feature cost map exposed to frontend
* [ ] **CRED-04**: Weekly refill job (+2 credits, cap 3, only if below cap)
* [ ] **CRED-05**: Refill suppressed when paid credits push balance above free cap
* [ ] **CRED-06**: Free user cold-start grants 3 credits on profile creation
* [ ] **CRED-07**: Backend enforcement primitive `requireCreditsOrTier(req, feature)` returning structured 402
* [ ] **CRED-08**: Frontend `useCredits()` hook with live balance, cost preview, affordability

**Payments (Stripe Migration + Packs)**

* [ ] **PAY-01**: Stripe subscription products for Pro ($16.99/mo, $183.99/yr) and Elite ($26.99/mo, $275.99/yr); price IDs in config
* [ ] **PAY-02**: Stripe products for credit packs — 1cr/$2.99, 3cr/$4.99, 10cr/$8.99
* [ ] **PAY-03**: `stripe-webhook` edge function with signature verification and idempotent writes keyed on event id
* [ ] **PAY-04**: Webhook handles subscription `checkout.session.completed` → updates `profiles.subscription_tier`, Stripe customer/subscription ids, `current_period_end`
* [ ] **PAY-05**: Webhook handles pack `checkout.session.completed` → inserts `credit_ledger` (source=purchase), increments `credit_balance`
* [ ] **PAY-06**: Webhook handles `customer.subscription.updated` / `deleted` for downgrades, cancellations, renewals
* [ ] **PAY-07**: Client `useStripeCheckout()` hook replacing Paddle checkout at all current call sites
* [ ] **PAY-08**: `UpgradeModal` updated with new Pro/Elite prices + credit pack tab; promo `agk02110` preserved via Stripe coupon
* [ ] **PAY-09**: Paddle deprecation — no new Paddle checkouts; existing subs honored until renewal

**Token / Model Enforcement**

* [ ] **TOK-01**: All free-tier analyses route to Claude Haiku 4.5
* [ ] **TOK-02**: Per-feature `max_tokens` caps enforced pre-call: Resume 3500/6000, LinkedIn 2000/6000, Career Compass 1500/2500, Recruiting Lens 5000/10000, Interview Prep 5000/10000
* [ ] **TOK-03**: Input character caps + file size caps enforced at request validation
* [ ] **TOK-04**: PDF (text + OCR fallback) and DOCX supported; other formats rejected with specific error
* [ ] **TOK-05**: Shared `resolveModelAndTokens(tier, feature)` used by every analyze-* function
* [ ] **TOK-06**: `analyze-resume` parallel-call budgets re-derived from the feature cap

**Feature Gating (shared)**

* [ ] **GATE-01**: Shared `<LockedSection>` component with static skeleton + upgrade/unlock CTA
* [ ] **GATE-02**: Tier access map updated for new Pro/Elite expectations
* [ ] **GATE-03**: Backend prompts conditionally omit locked sections — AI must not generate locked content
* [ ] **GATE-04**: Locked section headers always visible (tease)
* [ ] **GATE-05**: Locked sections support either Upgrade CTA or "Unlock for X credits" where configured

**Resume Analysis**

* [ ] **RES-01**: Free output limited to summary, signals, strengths, priority actions, 1 improvement
* [ ] **RES-02**: Ready-to-paste rewrites moved to top of result page
* [ ] **RES-03**: UI visually aligned with Recruiting Lens card system
* [ ] **RES-04**: Full improvements + detailed criteria locked via `<LockedSection>` on Free

**LinkedIn Grader**

* [ ] **LIG-01**: Free output — scorecard, key strengths, single next action, 1 rewrite (highest priority topFix)
* [ ] **LIG-02**: Pro/Elite — full sectionBreakdown, full topFixes, profileInsights
* [ ] **LIG-03**: Locked on Free: remaining 3 sections, remaining 3 rewrites, profileInsights
* [ ] **LIG-04**: Pro/Elite get 1 free scan per billing cycle, then 1 credit per scan
* [ ] **LIG-05**: PDF upload + paste input, 12,000-char truncation verified under TOK-03

**Career Compass**

* [ ] **CC-01**: Free output — Career DNA + 1 top role
* [ ] **CC-02**: Strategy section removed entirely (frontend + backend prompt)
* [ ] **CC-03**: Roadmap + Readiness locked for Free
* [ ] **CC-04**: Pro sees all roles + roadmap + readiness
* [ ] **CC-05**: Elite identical to Pro (minus Strategy; Elite-only perks TBD)

**Recruiting Lens**

* [ ] **RCL-01**: Auto-detect last uploaded/analyzed resume without re-prompting
* [ ] **RCL-02**: Pro sub-scores limited to experienceAlignment + skillAlignment (2 of 5)
* [ ] **RCL-03**: Pro locks gap solutions, roadmap, keywords, strategic advice
* [ ] **RCL-04**: Elite fully unlocked
* [ ] **RCL-05**: `solution` field added to each `topGaps[]` item (prompt + validation + render)
* [ ] **RCL-06**: First 2 gaps styled URGENT (red)
* [ ] **RCL-07**: Backend prompt conditionally omits locked sections on Pro

**Interview Prep Coach**

* [ ] **IPC-01**: Pro output — 3 flashcards (remaining 5 locked)
* [ ] **IPC-02**: Elite quiz system — input-answer UI, Haiku-scored feedback, streak (24h decay, 48h expiry), 3 quizzes/day cap
* [ ] **IPC-03**: Quiz schema — `interview_quizzes`, `interview_quiz_answers`, `interview_streaks`
* [ ] **IPC-04**: Daily quiz cap enforced server-side
* [ ] **IPC-05**: Streak UI on Interview Prep page + navbar hint

**UX / Navbar**

* [ ] **UX-01**: Persistent navbar credit badge (desktop + mobile), opens credit drawer on click
* [ ] **UX-02**: Every feature Analyze button shows credit cost before execution + disabled when unaffordable
* [ ] **UX-03**: Refill countdown timer visible in credit drawer and on feature pages when balance = 0
* [ ] **UX-04**: Example input prompts shown for every feature
* [ ] **UX-05**: Consistent locked-state visual system across all features
* [ ] **UX-06**: Dopamine beats — score animations, progress indicators, inline upgrade prompts
* [ ] **UX-07**: Credit-pack purchase drawer integrated in navbar credit button + UpgradeModal

### Future (deferred)

* Security audit across frontend + edge functions (v1.0 SEC-01..10) — next milestone
* Full Paddle removal (after existing subs expire)
* Analytics overhaul beyond monetization-funnel hooks
* Elite-only Career Compass perks (TBD)
* Native mobile app

### Out of Scope (v2.0)

* Redesign of core AI output schemas
* New AI features beyond those listed
* Database migration/platform changes unrelated to credits, Stripe, or quiz system
* Resume Analysis or Career Compass core scoring changes — only tier-conditional trimming
* Analytics platform rework

## Context

* **Existing codebase**: Brownfield with 20+ edge functions, React SPA, Supabase backend
* **Payment state**: Paddle client-side checkout live (`usePaddleCheckout.ts`), no Paddle webhook, partial Stripe scaffolding (`profiles.stripe_*` columns + `stripe_webhook_events` table exist, no handler)
* **Current credit system**: Global per-month pool, hardcoded limits (free 3 / pro 100 / elite 300), single `usage_tracking` table, `can_perform_ai_action()` RPC
* **Locked UI**: `<ProFeatureBlur>` exists for whole-feature locks; no sectional lock primitive yet
* **Models**: `analyze-career` already uses Haiku 4.5; `analyze-resume` defaults to Sonnet; others mixed
* **Design system**: "Institutional Intelligence" aesthetic — Bloomberg terminal meets Linear, HSL CSS variables, semantic tokens, glass effects, Framer Motion animations

## Constraints

* **Stack**: Supabase Edge Functions (Deno) + React frontend — no new infrastructure
* **AI provider**: Anthropic Claude only; free tier locked to Haiku 4.5
* **Cost discipline**: AI must not generate content the user cannot see
* **Behavior**: All existing features must remain functional for paid users at all times
* **Conventions**: TypeScript strict, existing patterns, semantic design tokens
* **Git**: Do not commit anything in `.planning/` or modify `.gitignore`

## Key Decisions

| Decision                                          | Rationale                                                              | Outcome   |
| ------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| Credit economy replaces global monthly quota      | Predictable unit cost, visible upgrade incentive, packs unlock revenue | Pending   |
| Stripe replaces Paddle as primary checkout        | Webhook-backed integrity, pack + subscription parity, promo coupons    | Pending   |
| Haiku 4.5 for all free analyses                   | Cost ceiling; quality acceptable for Free tier teaser output           | Pending   |
| AI must not generate locked content               | Hard cost discipline; frontend-only hides still burn tokens            | Pending   |
| Paddle honored for in-flight subs                 | Avoid forced migration disruption                                      | Pending   |
| Strategy section removed from Career Compass      | Low-value feature; replaced by stronger gating + packs                 | Pending   |
| Elite quiz system is net-new for Interview Prep   | Dopamine hook + retention lever; justifies Elite price                 | Pending   |
| v2.0 phase numbering continues from v1.0 (10-18)  | Preserve v1.0 history; no reset                                        | Confirmed |
| v1.0 LIG frontend is already correct              | Audit was stale; Explore confirmed v3.0 schema read in current code    | Confirmed |
| Security audit deferred                           | Too much scope for one milestone; post-monetization is acceptable risk | Confirmed |

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

*Last updated: 2026-04-13 — v2.0 milestone initialized*
