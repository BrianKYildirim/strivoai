# Features Research

**Domain:** AI career platform — feature overhaul & platform hardening
**Researched:** 2026-04-11
**Confidence:** HIGH — all findings from direct codebase inspection + explicit project spec

---

## Interview Prep Coach

**Table stakes:**
- JD-driven question generation
- STAR outline per question
- Category badges and difficulty labels
- Expandable cards with full question detail
- Category filter (behavioral, technical, situational, culture fit, leadership)
- Copy-to-clipboard for STAR outlines
- Tier gate (Pro/Elite only)
- Loading state with UniversalAnalyzing overlay

**Differentiators:**
- "Why This Is Asked" explanation per question
- Sample opener text
- Red flags per question
- Indigo color identity (feature branding)
- JD specificity mandate in prompt (questions must reference the actual job)

**Anti-features:**
- Answer recording / mock interview mode (requires audio/video infra)
- AI answer scoring (extra round-trip, not requested)
- Question bank / save-for-later (adds DB schema complexity)

## LinkedIn Grader

**Table stakes:**
- Overall score (0-100)
- Section breakdown with individual scores
- Specific feedback quoting actual profile text (min 3-4 per section)
- Paste-ready rewrites
- PDF upload + copy-paste input methods
- Previous analysis context for follow-up scans
- Tier gate (Pro/Elite, 1 free scan/billing cycle)

**Differentiators:**
- Honest score calibration (10-20+ point gap between quality tiers, no anchoring)
- Exactly 4 paste-ready rewrites (headline always first)
- Voice-preserving rewrites with keyword optimization
- Profile insights highlighting exceptional elements
- "Always scope for more" principle (even 90+ profiles get next-level advice)

**Anti-features:**
- LinkedIn URL auto-scraping (LinkedIn blocks scrapers)
- Side-by-side profile comparison (future milestone)

## Navbar

**Table stakes:**
- All 5 feature links (Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens, Interview Prep Coach)
- Home button, Dashboard button
- Profile dropdown with Billing/Membership and Profile links
- Dark mode toggle
- Responsive hamburger menu on mobile
- Consistent across ALL pages

**Differentiators:**
- Tier badge with icon in profile area
- Credits indicator
- Admin tier override (dev tool)

## Stripe Migration

**Table stakes:**
- Checkout flow (Pro/Elite, monthly/annual)
- Webhook handler updating tier on subscription created/updated/deleted
- Customer Portal for self-service billing management
- Webhook signature verification (HMAC-SHA256)
- Full Paddle removal (code, CDN script, env vars)

**Differentiators:**
- Annual billing visible at checkout (conversion lift)
- Stripe Portal as self-service billing (zero custom UI needed)

**Anti-features:**
- Custom billing history UI (Stripe Portal covers this for free)
- Prorated upgrade logic (let Stripe handle it automatically)
- Parallel Paddle + Stripe during migration (creates reconciliation nightmare)

## Security Audit

**Table stakes:**
- Env var leakage audit
- SQL injection scan
- XSS audit
- Auth check on all edge functions
- OWASP Top 10 review
- CORS audit

**Differentiators:**
- Rate limiting completeness check
- Prompt injection defense coverage across all AI functions

---

## Cross-Feature Dependencies

```
Navbar fix → unblocks Interview Prep Coach dark mode fix (navbar overlap bug)
Dark mode CSS tokens → affects all feature pages
Claude model swap (Interview Prep) → enables consistent JSON output
LinkedIn Grader v3.0 schema → coordinated change: edge function + frontend must ship together
Stripe migration complete → security audit must cover new webhook handler
Security audit → runs last so all new code is in scope
```
