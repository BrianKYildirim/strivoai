# Requirements: Strivo AI — v2.0 Monetization & Credit System

**Defined:** 2026-04-13
**Milestone:** v2.0
**Core Value:** Predictable unit economics with a visible upgrade funnel. Free users see deliberately partial, high-quality output with clear upgrade paths. Paid users get the full experience reliably, with strict server-side token caps preventing runaway cost.

## v2 Requirements

Requirements for this milestone. Each maps to roadmap phases 10–18.

### CRED — Credit System

* [ ] **CRED-01**: New DB schema — `credit_ledger` (user_id, delta, source enum[purchase/refill/analysis/adjustment], feature, tokens_consumed, created_at), `credit_balance` (user_id, balance, next_refill_at), `credit_cost_map` (feature, cost_credits)
* [ ] **CRED-02**: Atomic `consume_credits(user_id, feature, cost)` RPC that also verifies tier feature-access and returns structured result
* [ ] **CRED-03**: Per-feature cost map is configurable via DB table and exposed to frontend via `/me/credits` endpoint
* [ ] **CRED-04**: Weekly refill job adds +2 credits, capped at 3, only when `balance < 3` — implemented via pg_cron or scheduled edge function
* [ ] **CRED-05**: Weekly refill is suppressed when paid credits push a user's balance above the free cap
* [ ] **CRED-06**: New free-user profile creation grants 3 credits cold-start
* [ ] **CRED-07**: Backend enforcement primitive `requireCreditsOrTier(req, feature)` returns structured 402 `{ balance, cost, resetAt, tier }` on block
* [ ] **CRED-08**: Frontend `useCredits()` hook exposes `{ balance, nextRefillAt, costFor(feature), canAfford(feature) }` with live refresh via `strivo:credits-updated` event

### PAY — Stripe Migration + Credit Pack Checkout

* [ ] **PAY-01**: Stripe products + prices created for Pro ($16.99/mo, $183.99/yr) and Elite ($26.99/mo, $275.99/yr); price IDs stored in env config
* [ ] **PAY-02**: Stripe products for credit packs — 1cr/$2.99, 3cr/$4.99, 10cr/$8.99 — one-time payment mode
* [ ] **PAY-03**: New `stripe-webhook` edge function verifies signature via `STRIPE_WEBHOOK_SECRET` using raw request body, writes idempotently keyed on Stripe event id, uses existing `stripe_webhook_events` table
* [ ] **PAY-04**: Webhook handles subscription `checkout.session.completed` → updates `profiles.subscription_tier`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`
* [ ] **PAY-05**: Webhook handles pack `checkout.session.completed` → inserts `credit_ledger` (source=purchase), increments `credit_balance`
* [ ] **PAY-06**: Webhook handles `customer.subscription.updated` and `customer.subscription.deleted` for downgrades, cancellations, and renewals
* [ ] **PAY-07**: Client `useStripeCheckout()` hook created and called by `UpgradeModal`, profile page, and every upsell entry point (replaces `usePaddleCheckout`)
* [ ] **PAY-08**: `UpgradeModal` updated with new Pro/Elite prices and a credit-pack tab; promo code `agk02110` preserved via Stripe coupon
* [ ] **PAY-09**: Paddle deprecation — no new Paddle checkouts are reachable from the UI; existing Paddle subscribers honored until renewal/cancel (Paddle webhook handling left as tech debt)

### TOK — Token & Model Enforcement

* [ ] **TOK-01**: All free-tier analyses route to `claude-haiku-4-5-20251001`, overriding per-function defaults
* [ ] **TOK-02**: Per-feature `max_tokens` caps enforced pre-call: Resume 3500/6000, LinkedIn 2000/6000, Career Compass 1500/2500, Recruiting Lens 5000/10000, Interview Prep 5000/10000
* [ ] **TOK-03**: Input character caps enforced at request validation for every feature; file size caps enforced for uploads
* [ ] **TOK-04**: PDF (text + OCR fallback for image PDFs) and DOCX are supported; other formats rejected with specific actionable errors
* [ ] **TOK-05**: Shared `resolveModelAndTokens(tier, feature)` helper in `_shared/` used by every analyze-* function
* [ ] **TOK-06**: `analyze-resume` parallel-call budgets derive from the feature cap (no hardcoded tier/call tables)

### GATE — Feature Gating (shared)

* [ ] **GATE-01**: Shared `<LockedSection>` React component renders static header + static placeholder skeleton + upgrade/unlock CTA
* [ ] **GATE-02**: Tier access map updated so Free gets Resume / Career Compass / LinkedIn (all gated); Pro gains Recruiting Lens + Interview Prep (gated); Elite gets full unlock
* [ ] **GATE-03**: Backend prompts conditionally omit locked sections based on tier — **AI must never generate content the user cannot see**
* [ ] **GATE-04**: Locked section headers are always rendered so users see what they are missing (tease)
* [ ] **GATE-05**: Every locked section supports either an Upgrade CTA or "Unlock for X credits" where business-approved

### RES — Resume Analysis

* [ ] **RES-01**: Free output is limited to summary, signals, strengths, priority actions, and exactly 1 improvement — backend prompt trims accordingly
* [ ] **RES-02**: Ready-to-paste rewrites block is the first section on the result page (above Signals)
* [ ] **RES-03**: Resume result UI visually aligned with Recruiting Lens card system — shared styling pattern
* [ ] **RES-04**: Full improvements list and detailed criteria rubric are locked via `<LockedSection>` on Free

### LIG — LinkedIn Grader

* [ ] **LIG-01**: Free output returns scorecard (rawScore + scoreJustification), keyStrengths, single `nextBestAction`, and exactly 1 rewrite (highest-priority topFix)
* [ ] **LIG-02**: Pro/Elite output returns full 4-section sectionBreakdown, 4 topFixes, and profileInsights
* [ ] **LIG-03**: On Free: remaining 3 sectionBreakdown sections, remaining 3 rewrites, and profileInsights are locked via `<LockedSection>`
* [ ] **LIG-04**: Pro/Elite users get 1 free scan per billing cycle, then 1 credit per scan (hybrid allowance + credit model)
* [ ] **LIG-05**: PDF upload and paste input methods are supported with 12,000-character truncation; limits verified against TOK-03

### CC — Career Compass

* [ ] **CC-01**: Free output returns Career DNA prose plus exactly 1 top role (backend, not frontend slice)
* [ ] **CC-02**: Strategy section is removed entirely from both frontend and backend prompts (deleted, not locked)
* [ ] **CC-03**: Roadmap and Readiness sections are locked on Free via `<LockedSection>` and omitted by the backend prompt
* [ ] **CC-04**: Pro tier sees all roles plus roadmap plus readiness
* [ ] **CC-05**: Elite tier is identical to Pro minus Strategy (Elite-only perks TBD in phase planning)

### RCL — Recruiting Lens

* [ ] **RCL-01**: Recruiting Lens auto-detects the user's most recently uploaded/analyzed resume without re-prompting (absorbs v1.0 RCL-01)
* [ ] **RCL-02**: Pro sub-scores are limited to `experienceAlignment` + `skillAlignment` (2 of 5); other 3 sub-scores are locked
* [ ] **RCL-03**: On Pro: gap solutions, roadmap, keywords, and strategic advice are locked via `<LockedSection>`
* [ ] **RCL-04**: Elite tier fully unlocks all 5 sub-scores, gap solutions, roadmap, keywords, and strategic advice
* [ ] **RCL-05**: Each `topGaps[]` item gains a new `solution` field (prompt + validation schema + frontend render)
* [ ] **RCL-06**: First 2 gaps rendered with URGENT red badge/card styling; remaining gaps use normal styling
* [ ] **RCL-07**: Backend prompt conditionally omits locked sections on Pro — AI does not generate locked content

### IPC — Interview Prep Coach

* [ ] **IPC-01**: Pro output returns 3 flashcards (question cards with STAR framework); remaining 5 locked via `<LockedSection>`
* [ ] **IPC-02**: Elite tier unlocks the quiz system — input-answer UI, Haiku-scored feedback per answer, streak with 24h decay and 48h hard expiry, hard cap of 3 quizzes per 24h per user
* [ ] **IPC-03**: Quiz schema — `interview_quizzes` (id, user_id, questions, started_at, finished_at), `interview_quiz_answers` (quiz_id, question_id, answer_text, score, feedback, created_at), `interview_streaks` (user_id, current_streak, last_quiz_at, decay_started_at)
* [ ] **IPC-04**: Daily quiz cap enforced server-side (4th quiz within 24h blocked with actionable error)
* [ ] **IPC-05**: Streak UI visible on Interview Prep page and in navbar hint

### UX — User Experience / Navbar

* [ ] **UX-01**: Persistent navbar credit badge on desktop and mobile — not hidden in dropdown. Click opens credit management drawer with balance, next-refill countdown, and pack purchase CTA
* [ ] **UX-02**: Every feature Analyze button shows credit cost before execution ("Analyze — 1 credit") and is disabled when the user cannot afford it
* [ ] **UX-03**: Refill countdown timer visible in credit drawer and on feature pages when balance is 0
* [ ] **UX-04**: Example input prompts shown on every feature page to tease best output
* [ ] **UX-05**: Consistent locked-state visual system across all features (same skeleton, CTA placement, tease copy)
* [ ] **UX-06**: Dopamine beats — score animations, progress indicators on results, inline upgrade prompts at natural moments (not modal spam)
* [ ] **UX-07**: Credit-pack purchase drawer integrated in navbar credit button and `UpgradeModal`

## Future Requirements (deferred)

### Security

* **SEC-FUTURE-01..10**: v1.0 SEC-01..10 (edge function auth audit, secrets leakage, SQL injection, XSS, CORS, RLS, prompt sanitizer, hardcoded secrets, SECURITY DEFINER search_path, Deno stdlib standardization) — deferred to a post-v2.0 milestone

### Paddle Cleanup

* **PAY-FUTURE-01**: Full Paddle removal after all existing Paddle subscribers have renewed or cancelled

### Elite-only perks

* **CC-FUTURE-01**: Elite-only Career Compass perks (TBD — design in a future milestone)
* **IPC-FUTURE-01**: Expanded quiz categories and history review

## Out of Scope (v2.0)

| Feature                                   | Reason                                                           |
| ----------------------------------------- | ---------------------------------------------------------------- |
| Security audit (v1.0 SEC-01..10)          | Deferred to next milestone to keep v2.0 focused on monetization  |
| Full Paddle removal                       | Existing subscribers honored until renewal — clean cutover later |
| Redesign of core AI output schemas        | Only tier-conditional trimming, not schema rework                |
| New AI features beyond the 5 existing     | Monetization milestone, not feature expansion                    |
| Analytics platform overhaul               | Only event hooks where monetization funnel needs them            |
| Audio/video interview practice            | Not in stack                                                     |
| LinkedIn URL auto-scraping                | LinkedIn blocks scrapers                                         |
| Mobile native app                         | Web-only platform                                                |
| Database migration beyond credits + quiz  | Stay focused on milestone scope                                  |

## Traceability

| Requirement | Phase    | Status  |
| ----------- | -------- | ------- |
| CRED-01     | Phase 10 | Pending |
| CRED-02     | Phase 10 | Pending |
| CRED-03     | Phase 10 | Pending |
| CRED-04     | Phase 10 | Pending |
| CRED-05     | Phase 10 | Pending |
| CRED-06     | Phase 10 | Pending |
| CRED-07     | Phase 10 | Pending |
| CRED-08     | Phase 10 | Pending |
| PAY-01      | Phase 11 | Pending |
| PAY-02      | Phase 11 | Pending |
| PAY-03      | Phase 11 | Pending |
| PAY-04      | Phase 11 | Pending |
| PAY-05      | Phase 11 | Pending |
| PAY-06      | Phase 11 | Pending |
| PAY-07      | Phase 11 | Pending |
| PAY-08      | Phase 11 | Pending |
| PAY-09      | Phase 11 | Pending |
| TOK-01      | Phase 12 | Pending |
| TOK-02      | Phase 12 | Pending |
| TOK-03      | Phase 12 | Pending |
| TOK-04      | Phase 12 | Pending |
| TOK-05      | Phase 12 | Pending |
| TOK-06      | Phase 12 | Pending |
| GATE-01     | Phase 13 | Pending |
| GATE-02     | Phase 13 | Pending |
| UX-01       | Phase 13 | Pending |
| UX-02       | Phase 13 | Pending |
| UX-03       | Phase 13 | Pending |
| UX-04       | Phase 13 | Pending |
| UX-05       | Phase 13 | Pending |
| UX-06       | Phase 13 | Pending |
| UX-07       | Phase 13 | Pending |
| RES-01      | Phase 14 | Pending |
| RES-02      | Phase 14 | Pending |
| RES-03      | Phase 14 | Pending |
| RES-04      | Phase 14 | Pending |
| GATE-03     | Phase 14 | Pending |
| GATE-04     | Phase 14 | Pending |
| GATE-05     | Phase 14 | Pending |
| LIG-01      | Phase 15 | Pending |
| LIG-02      | Phase 15 | Pending |
| LIG-03      | Phase 15 | Pending |
| LIG-04      | Phase 15 | Pending |
| LIG-05      | Phase 15 | Pending |
| CC-01       | Phase 16 | Pending |
| CC-02       | Phase 16 | Pending |
| CC-03       | Phase 16 | Pending |
| CC-04       | Phase 16 | Pending |
| CC-05       | Phase 16 | Pending |
| RCL-01      | Phase 17 | Pending |
| RCL-02      | Phase 17 | Pending |
| RCL-03      | Phase 17 | Pending |
| RCL-04      | Phase 17 | Pending |
| RCL-05      | Phase 17 | Pending |
| RCL-06      | Phase 17 | Pending |
| RCL-07      | Phase 17 | Pending |
| IPC-01      | Phase 18 | Pending |
| IPC-02      | Phase 18 | Pending |
| IPC-03      | Phase 18 | Pending |
| IPC-04      | Phase 18 | Pending |
| IPC-05      | Phase 18 | Pending |

**Coverage:**

* v2 requirements: 59 total
* Mapped to phases: 59
* Unmapped: 0

**Note:** GATE-03/04/05 appear against Phase 14 only as the primary implementer but apply to every feature gating phase (14–18). Each feature phase must enforce the "no AI generation of locked content" rule in its own backend prompt.

***

*Requirements defined: 2026-04-13*
*Last updated: 2026-04-13 at milestone v2.0 initialization*
