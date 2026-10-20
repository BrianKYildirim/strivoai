# Roadmap: Strivo AI — Feature Overhaul & Platform Hardening

**Milestone:** v1.0
**Created:** 2026-04-11
**Updated:** 2026-04-12 (gap closure phases added from v1.0-MILESTONE-AUDIT)

## Phases

### Phase 01: Navbar Unification

**Status:** Implemented (verification pending)
**Goal:** Unified navbar wired across every page with feature links, theme toggle, profile dropdown, and responsive hamburger.
**Requirements:** NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, NAV-07

### Phase 02: Interview Prep Coach — Backend

**Status:** Implemented (human verification pending)
**Goal:** Edge function generates 8 tailored interview questions via Claude Haiku 4.5, gated to Pro/Elite, with usage recorded under `interview_prep`.
**Requirements:** IPC-01, IPC-02, IPC-03, IPC-04, IPC-09, IPC-10

### Phase 03: Interview Prep Coach — Frontend

**Status:** Implemented (human verification pending)
**Goal:** Indigo-themed results UI with category filters, expandable cards, clipboard copy, and correct navbar clearance.
**Requirements:** IPC-05, IPC-06, IPC-07, IPC-08, IPC-11

### Phase 04: LinkedIn Grader — Backend

**Status:** Implemented (human verification pending)
**Goal:** v3.0 scoring with Haiku 4.5, 4-section architecture, quoted feedback, calibrated scores, `requireAuth`, and schema-compliant output.
**Requirements:** LIG-02, LIG-03, LIG-04, LIG-05, LIG-06, LIG-07, LIG-10, LIG-12

### Phase 05: LinkedIn Grader — Frontend

**Status:** Pending (gap closure)
**Goal:** LinkedInGrader UI renders v3.0 schema correctly, supports PDF upload / pasted text / optional URL, and enforces Pro/Elite 1-free-then-credits entitlement.
**Requirements:** LIG-01, LIG-08, LIG-09, LIG-11, LIG-13
**Gap Closure:**

* Fixes LIG-08/09/13 frontend schema mismatch (`rawScore`/`sectionBreakdown`/`topFixes.suggestedFix`/`profileInsights`/`rewrites`) breaking score circle, section grid, rewrite copy button
* Closes broken flow "LinkedIn Grader v3.0 result rendering"
* Closes integration gap grade-linkedin → LinkedInGrader.tsx
* Removes dead `previousGrade` pre-fetch (LIG-10 wasted compute)

**Plans:** 6 plans

Plans:

* [ ] 05-01-PLAN.md — Schema migration: v3.0 LinkedInResult interface + delete legacy types, adapter, dead pre-fetch
* [ ] 05-02-PLAN.md — Rebind score hero, section breakdown, nextBestAction, topFixes to v3.0 fields
* [ ] 05-03-PLAN.md — Add profileInsights (What's Working) + Paste-Ready Rewrites UI blocks
* [ ] 05-04-PLAN.md — Legacy cache detection + entitlement query + inline helper text
* [ ] 05-05-PLAN.md — Backend free-scan enforcement (grade-linkedin step 6 branch) + entitlement.test.ts Wave 0 scaffold
* [ ] 05-06-PLAN.md — AnalysisComparisonModal discriminated union rewire for LinkedIn v3.0 shape

### Phase 06: Recruiting Lens — Resume Detection

**Status:** Pending (gap closure)
**Goal:** Recruiting Lens auto-detects the user's most recently analyzed resume instead of prompting to analyze first.
**Requirements:** RCL-01
**Gap Closure:** Closes orphaned RCL-01.

**Plans:** 1/1 plans complete

Plans:

* [x] 06-01-PLAN.md — Replace RecruitingLens init effect with primary (resumes.grading\_data) + fallback (analysis\_results) resume detection

### Phase 07: Stripe Migration — Backend

**Status:** Pending (gap closure)
**Goal:** Stripe-based subscription flow with `create-checkout-session`, `stripe-webhook`, `create-stripe-portal` edge functions and DB schema for Stripe IDs.
**Requirements:** STR-01, STR-02, STR-03, STR-04, STR-05, STR-06, STR-07, STR-12
**Gap Closure:** Closes 8 orphaned STR backend requirements.

**Plans:** 6 plans

Plans:

* [ ] 07-01-PLAN.md — Wave 0: shared stripe-client singleton + price-resolver helpers + test signing helper + event fixtures (STR-04, STR-12 mechanics)
* [ ] 07-02-PLAN.md — Additive schema migration (profiles stripe\_\* columns + stripe\_webhook\_events with correct RLS) + BLOCKING supabase db push (STR-06, STR-07)
* [ ] 07-03-PLAN.md — stripe-webhook edge function: SDK signature verify, insert-first idempotency, 4-event router, graceful cancellation (STR-02, STR-03, STR-04)
* [ ] 07-04-PLAN.md — create-checkout-session edge function: requireAuth, tier/interval allowlist, lazy customer create, env-driven price resolution (STR-01, STR-12)
* [ ] 07-05-PLAN.md — create-stripe-portal edge function: requireAuth, no-customer 400, portal session create (STR-05)
* [ ] 07-06-PLAN.md — Deploy runbook + staging deploy + full edge test suite + operator checkpoint for Stripe Dashboard config

### Phase 08: Stripe Migration — Frontend

**Status:** Pending (gap closure)
**Goal:** Frontend pricing and billing management flows use Stripe Checkout and Customer Portal; all Paddle client code removed.
**Requirements:** STR-08, STR-09, STR-10, STR-11
**Gap Closure:** Closes 4 orphaned STR frontend requirements.

### Phase 09: Security Audit

**Status:** Pending (gap closure)
**Goal:** Platform-wide security hardening — auth boundaries, secret handling, SQLi/XSS, CORS, RLS, prompt sanitizer coverage, `search_path`, Deno stdlib standardization.
**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, SEC-09, SEC-10
**Gap Closure:** Closes 10 orphaned SEC requirements.

***

## Requirements Coverage

| Phase     | Requirements           | Count  |
| --------- | ---------------------- | ------ |
| 01        | NAV-01..07             | 7      |
| 02        | IPC-01..04, 09, 10     | 6      |
| 03        | IPC-05..08, 11         | 5      |
| 04        | LIG-02..07, 10, 12     | 8      |
| 05        | LIG-01, 08, 09, 11, 13 | 5      |
| 06        | RCL-01                 | 1      |
| 07        | STR-01..07, 12         | 8      |
| 08        | STR-08..11             | 4      |
| 09        | SEC-01..10             | 10     |
| **Total** |                        | **54** |

***

*Phases 05–09 added 2026-04-12 from v1.0-MILESTONE-AUDIT gap closure plan.*
