# Codebase Structure — v3.0 Frontend Map

**Analysis Date:** 2026-04-28
**Scope:** React Router routes, tier-gated UI primitives, per-feature output sections, cross-feature input plumbing, onboarding LinkedIn capture, Celebrations, Pricing.
**Out of scope (covered by parallel agents):** merit/Stripe edge functions, analysis caching/persistence layer, design tokens.

---

## 1. Route Map (React Router)

All routes are declared in `src/App.tsx` (lines 56–90). Auth guard is `<ProtectedRoute>` (`src/components/ProtectedRoute.tsx`); all `<ProtectedRoute>` routes also wrap children in `<DashboardLayout>` (sidebar + topbar). Top-level providers: `HelmetProvider → QueryClientProvider → AdminTierTestProvider → AnalysisLockProvider → TooltipProvider → BrowserRouter → TopUpProvider`.

| Path | Component file | Auth guard | Notes / dynamic |
|------|----------------|-----------|-----------------|
| `/` | `src/pages/Index.tsx` | public | landing page |
| `/auth` | `src/pages/Auth.tsx` | public | login/signup, 625 lines |
| `/onboarding` | `src/pages/Onboarding.tsx` | `<ProtectedRoute skipOnboardingCheck>` | 656 lines; resume upload + LinkedIn PDF |
| `/upload` | `src/pages/Upload.tsx` | `<ProtectedRoute>` | resume re-upload + analysis trigger |
| `/results/:id` | `src/pages/Results.tsx` | `<ProtectedRoute>` | dynamic `:id`, 1258 lines |
| `/improvements/:id` | `src/pages/Improvements.tsx` | `<ProtectedRoute>` | resume improvements detail |
| `/dashboard` | `src/pages/Dashboard.tsx` | `<ProtectedRoute>` | 427 lines, post-onboarding home |
| `/jobs` | `src/pages/Jobs.tsx` | `<ProtectedRoute>` | job matching |
| `/linkedin-grader` | `src/pages/LinkedInGrader.tsx` | `<ProtectedRoute>` | 1205 lines |
| `/career-compass` | `src/pages/CareerCompass.tsx` | `<ProtectedRoute>` | 1143 lines |
| `/skills-gap-analysis` | `src/pages/SkillsGapAnalysis.tsx` | `<ProtectedRoute>` | not in v3.0 milestone scope |
| `/history` | `src/pages/AnalysisHistory.tsx` | `<ProtectedRoute>` | 410 lines, single Activity History page |
| `/admin/usage` | `src/pages/AdminUsage.tsx` | `<ProtectedRoute>` | admin analytics |
| `/recruiting-lens` | `src/pages/RecruitingLens.tsx` | `<ProtectedRoute>` | 1229 lines |
| `/interview-prep` | `src/pages/InterviewPrep.tsx` | `<ProtectedRoute>` | 547 lines |
| `/shop` | `src/pages/Shop.tsx` | `<ProtectedRoute>` | merit shop |
| `/celebrations` | `src/pages/Celebrations.tsx` | `<ProtectedRoute>` | 441 lines, dark-only theme |
| `/settings/billing` | `src/pages/Settings/Billing.tsx` | `<ProtectedRoute>` | 401 lines, current plan + purchase history |
| `/profile` | `src/pages/Profile.tsx` | `<ProtectedRoute>` | 816 lines |
| `/terms`, `/privacy`, `/refund` | `src/pages/{Terms,Privacy,Refund}.tsx` | public | legal |
| `/pricing` | `src/pages/Pricing.tsx` | public | 80 lines, brand-v2 layout |
| `/how-it-works` | `src/pages/HowItWorks.tsx` | public | marketing |
| `/questions` | `src/pages/Questions.tsx` | public | FAQ |
| `/dev/locked-sections` | `src/pages/dev/LockedSectionsSandbox.tsx` | public, **DEV-only** | gated by `import.meta.env.DEV` |
| `*` | `src/pages/NotFound.tsx` | public | 404 catch-all |

**Route gaps confirmed (v3.0 milestone bugs):**

- **`/checkout` — DOES NOT EXIST.** No route in `App.tsx`. Falls through to `<Route path="*" element={<NotFound />} />`. Source of the 404 upgrade bug. See §2.
- **`/auth/signup` — DOES NOT EXIST.** `Pricing.tsx:19` calls `navigate('/auth/signup')` for Free CTA — also 404. Only `/auth` exists.
- **`/settings/billing` IS wired** (App.tsx:77 → `<Billing>`). The "stuck on loading" symptom is *not* a missing route. The component (`Settings/Billing.tsx:339`) shows `<Loader2>` while `profileLoading === true`. Likely root causes:
  - `Settings/Billing.tsx:328–335` — the `merit_shop_purchases` query is **missing `.eq('user_id', userId!)`**. RLS should still scope it, but if RLS is misconfigured the query may hang.
  - `Settings/Billing.tsx:307–317` — `profiles` query is `enabled: !!userId`; if `getUser()` returns null/throws silently (the `currentUser` query has no error path), `userId` stays `null` and downstream queries never resolve.
- `/celebrations` is wrapped in `<ProtectedRoute>` + `<DashboardLayout>` so the dark-only design clashes with the surrounding shell — see §7.

---

## 2. Upgrade Flow Buttons & The 404 `/checkout` Bug

**The bug** — `src/pages/Pricing.tsx:22`:
```ts
navigate(`/checkout?tier=${tier}&interval=${chosenInterval}`);
```
`/pricing` (App.tsx:82) renders `<Pricing>`, which uses v2 components `<TierCardV2>` / `<PackSectionV2>`. `<TierCardV2>` (`src/components/pricing/TierCardV2.tsx:80`) calls back to `Pricing.handleTierCta`, which navigates to the **non-existent** `/checkout` route → 404.

**The legacy/correct flow that is no longer wired** — `src/components/PricingTable.tsx:116–143` uses `useStripeCheckout` to fetch a Stripe `clientSecret` and open `<StripeCheckoutWrapper>` inline. `<PricingTable>` is **only referenced by its own test file**; it is not rendered by any route. The functional inline-checkout pattern exists but the v2 redesign skipped it.

**Pack ("Buy Merits") flow — works correctly.** `Pricing.tsx:25–31` dispatches `window.dispatchEvent(new CustomEvent('topup:open', { detail: { packId } }))`. `<TopUpProvider>` (`src/components/topup/TopUpProvider.tsx`) listens, calls `useCreatePaymentIntent`, mounts `<StripePaymentElementModal>`. Same event fires from `<PackCardV2>` buttons. Header `+` and "Buy a top-up pack" CTAs in `OutOfMeritsModalV2`/`RunningLowCard`/`HeaderTopUpTrigger` route to `/pricing#packs` (works) or `/pricing` (works for the page; tier CTAs once there are broken).

**Other Upgrade buttons that route to `/pricing` (work):**

| Source | Line | Target |
|--------|------|--------|
| `src/components/Navbar.tsx` | 143, 186, 498, 507, 587, 596 | `/pricing`, `/settings/billing` |
| `src/components/TopBar.tsx` | 199, 210 | `/pricing` |
| `src/components/AppSidebar.tsx` | 44 | `/settings/billing` |
| `src/components/ActionFirstHero.tsx` | 123 | `/pricing` |
| `src/components/MinimalHero.tsx` | 254 | `/pricing` |
| `src/pages/Results.tsx` | 564 | `/pricing` |
| `src/pages/RecruitingLens.tsx` | 1212 | `/pricing` |
| `src/pages/LinkedInGrader.tsx` | 1044 | `/pricing` |
| `src/components/topup/RunningLowCard.tsx` | 50, 57 | `/pricing#packs`, `/pricing` |
| `src/components/topup/OutOfMeritsModalV2.tsx` | 41, 45 | `/pricing#packs`, `/pricing` |
| `src/components/topup/HeaderTopUpTrigger.tsx` | 34 | `/pricing#packs` |
| `src/components/career-compass/*Tab.tsx` | (many) | `/pricing` (default `<BlurredLockCard ctaHref>`) |

`<ProFeatureBlur>` (deprecated) routes its CTA to `/profile` (`src/components/ProFeatureBlur.tsx:34`) — inconsistent with the rest of the app.

---

## 3. Locked-Section Primitives

| Component | File | Status | Props API | Used in |
|-----------|------|--------|-----------|---------|
| `<BlurredLockCard>` | `src/components/BlurredLockCard.tsx` | **canonical (v2.0)** | `children, className?, ctaHref='/pricing', ctaLabel='Upgrade to unlock your full potential', tier?: 'pro'\|'elite', minHeight?` | LinkedInGrader (sections + Ready-to-Paste), every career-compass tab, CompensationIntelligence, EliteScoreHistory, SmartApplicationStrategy, EliteFeatureGate |
| `<LockedSection>` | `src/components/LockedSection.tsx` | **deprecated** (Phase 15.2 removal) | `title, teaser, requiredTier, ctaHref?, className?` | Sandbox + tests; renders skeleton lines, Lock icon, CTA |
| `<LockedListItem>` | `src/components/LockedListItem.tsx` | **deprecated** | `index, total, label, requiredTier, teaser?, ctaHref?, className?` | Tests + sandbox |
| `<ProFeatureBlur>` | `src/components/ProFeatureBlur.tsx` | **deprecated** (v1.0 carryover) | `children, featureName?` | Whole-feature locks; CTA to `/profile` (broken pattern) |
| `<ProFeatureGate>` | `src/components/ProFeatureGate.tsx` | active | full-page gate | RecruitingLens free-gate, InterviewPrep free-gate |
| `<EliteFeatureGate>` | `src/components/EliteFeatureGate.tsx` | active | Elite-only gate | CompensationIntelligence, SmartApplicationStrategy |

**Behavior:** `<BlurredLockCard>` renders `children` (realistic fake content) blurred behind a coral-gradient CTA + animated Lock icon. Whole overlay is clickable → `navigate(ctaHref)`. `tier` prop sets the sub-label ("Pro plan required" / "Elite plan required"). The two `Locked*` siblings render skeleton lines instead — weaker conversion effect, hence migration.

**Sandbox:** `src/pages/dev/LockedSectionsSandbox.tsx` (DEV-only at `/dev/locked-sections`).

---

## 4. Per-Feature Output Sections

### 4.1 Resume Analysis — `src/pages/Results.tsx`

| Section | Lines | v3.0 action |
|---------|-------|-------------|
| **Priority Actions** | 971–1004 | **REMOVE** — `<QuickAction>` items from `quickActions`. Hardcoded 3-item fallback at 990–992 ("Add measurable impact metrics", "Improve ATS keyword alignment", "Strengthen role targeting"). |
| **Priority Improvements** | 1006–1080+ | **KEEP** — `<PriorityCard>` with criteriaName/score/original/improved/feedback. Free shows 1 real card + locked skeletons; Pro/Elite shows full list. Already gated by `showFullResults`. |
| Compelling Points (`finalCompellingPoints`) | 941–969 | unaffected |
| Score / overall | top of file | unaffected |

`areasToImprove` is read from `gradingData.priorityImprovements || gradingData.improvements` at line 656.

### 4.2 LinkedIn Grader — `src/pages/LinkedInGrader.tsx`

| Section | Lines | v3.0 action |
|---------|-------|-------------|
| **What's Working For You** (`profileInsights`) | 844–876 | **REMOVE** — quoted "From your profile:" cards. Field type at line 53. |
| **Key Strengths** (`keyStrengths`) | 878–899 | **KEEP** — emerald-themed 3-col grid. |
| **Section Breakdown** (`orderedSections`) | 926–1050 | Free shows Profile-Completeness only; other 3 sections rendered via `<BlurredLockCard>` (940–976). Already gated. |
| **Ready-to-Paste Improvements** (`topFixes`) | 1052–1170+ | **GATING CHANGE** — currently shows `slice(0,4)` real fixes for everyone + a single `<BlurredLockCard>` with 4 placeholder skeletons for Free (1129–1170+; constant `LOCKED_FIXES_PLACEHOLDERS` at line 71). v3.0: Free 1 visible + 4 locked w/o backend generation; Pro 4–7 visible; Elite full. |
| Next Best Action | 901–924 | unaffected |
| Score Justification banner | 813–842 | unaffected |

### 4.3 Career Compass — `src/pages/CareerCompass.tsx`

Render tree starts line 980 (after `analysis` ready):

| Section | Component | File | Page lines | Free today | Pro/Elite today |
|---------|-----------|------|-----------|------------|-----------------|
| Career DNA | `<CareerDNACard>` | `src/components/career-compass/CareerDNACard.tsx` | 1000–1004 | full | full |
| Best-Fit Role Families | `<BestFitRoles>` | `src/components/career-compass/BestFitRoles.tsx` | 1006–1008 | partial: real cards + `<BlurredLockCard>` (line 76) | renders, but PROJECT.md says **empty/missing** |
| Surprise Fits | `<SurpriseFits>` | `src/components/career-compass/SurpriseFits.tsx` | 1010–1012 | real + locked skeletons (line 36) | gated on `surpriseFits.length > 0`; PROJECT.md says missing |
| Fields tab | `<FieldsTab>` | `src/components/career-compass/FieldsTab.tsx` | 1040–1042 | real + locked (line 139) | rendered; PROJECT.md says missing |
| Roles tab | `<RolesTab>` | `src/components/career-compass/RolesTab.tsx` | 1044–1046 | real + locked (line 115) | rendered; PROJECT.md says missing |
| Readiness tab | `<ReadinessTab>` | `src/components/career-compass/ReadinessTab.tsx` | 1048–1069 | locked breakdown (lines 114, 204); score visible | strengths/skills shown when present (lines 108, 197); PROJECT.md says missing |
| Roadmap tab | `<RoadmapTab>` | `src/components/career-compass/RoadmapTab.tsx` | 1071–1079 | full skeleton via `<BlurredLockCard>` (line 100) | rendered if data; PROJECT.md says missing |
| Compensation (Elite) | `<CompensationIntelligence>` | `src/components/CompensationIntelligence.tsx` | 1081–1095 | hidden | Elite tab |
| Strategy (Elite) | `<SmartApplicationStrategy>` | `src/components/SmartApplicationStrategy.tsx` | ~1100– | hidden | Elite tab |

**Confirmed:** Free tier already implements partial-real + skeleton pattern via `<BlurredLockCard>` in every component. **Pro/Elite empty-rendering bug is a data/schema issue** — each tab renders only when its data is present, so empty payload yields a blank tab. Diagnosis lives upstream (prompt/schema/edge function); UI must add defensive rendering.

`<CachedResultsBanner>` (`src/components/career-compass/CachedResultsBanner.tsx`, rendered line 998 when `isFromCache`) is the only existing cache-hit affordance. Cross-feature memory badge (used LinkedIn analysis) at lines 985–989.

### 4.4 Recruiting Lens — `src/pages/RecruitingLens.tsx`

Pre-analysis form rendered when `!result` (line 538), 2-column grid (552):

| Field | Required? | State / line | Lines |
|-------|-----------|--------------|-------|
| Job Description | **required** (`jobDescription.trim()` blocks submit at 681) | `useState('')` line 230 | textarea 562–573, max 3000 chars |
| LinkedIn text/PDF (collapsible) | optional | `linkedinText` ~227; `linkedinFileRef` for PDF upload | 577–621 |
| Resume context tile | derived (latest analysis) | `hasAnalyzedResume`, `resumeFilename` (fetched 261, 280–281) | 626–674 |

**Missing per v3.0:**
- **No company input field. No role/job-title input field.** Submit only requires `jobDescription`.
- **No tutorial/modal component.** `<UniversalAnalyzing>` (511–518) is the only overlay; no first-visit education exists. Natural placements: above the JD textarea (~555–561) or one-shot dialog from `useEffect` (no localStorage hint exists today).
- **No Saved Jobs UI anywhere.** `Saved Jobs` / `saved_jobs` returns zero hits in `src/`. No tile grid, no fetcher, no route. Must scaffold from scratch — likely as a section above the input form, or new sub-route.

Latest-resume fetch at lines 261 (`resumes` table, `.limit(1).order('created_at',desc)`) and 280–281 (analysis row).

### 4.5 Interview Prep — `src/pages/InterviewPrep.tsx`

| Element | Component | File | Page lines | Notes |
|---------|-----------|------|-----------|-------|
| Free gate | `<ProFeatureGate>` | `src/components/ProFeatureGate.tsx` | 361–375 | full-page CTA when `state.status === 'free-gate'` |
| Intake form (Pro+Elite) | `<IntakeForm>` | `src/components/interviewPrep/IntakeForm.tsx` | 426–430 | Zod `IntakeFormSchema` from `@/types/interviewPrep`. Required: `job_description`. Defaults: behavioral / mid / 30 / written / categories=[behavioral] / `elite_taste_request=false` (lines 38–46). Has `background_context` watch (49). |
| Streak (Elite) | `<StreakDisplay>` | `src/components/interviewPrep/StreakDisplay.tsx` | 433–441, 480–488 | Props: `lastQuizAt, currentStreak, longestStreak, quizzesToday, dailyCap` |
| Pro flashcards | `<FlashcardDeck>` | `src/components/interviewPrep/FlashcardDeck.tsx` | 452–459 | when `practice_questions.mode === 'flashcard'` |
| Elite quiz | `<QuizRunner>` | `src/components/interviewPrep/QuizRunner.tsx` | 499–511 | when `practice_questions.mode === 'quiz'` |
| Quiz results | `<QuizResults>` | `src/components/interviewPrep/QuizResults.tsx` | after `onComplete` | scoring + STAR feedback |

Bootstrap effect (lines 200–246): parallel fetch of profile tier + most-recent analyzed resume. `hasResume` requires `grading_data IS NOT NULL` on `resumes` (217–220).

**Legacy:** `src/components/InterviewPrepInput.tsx` exists with optional `jobTitle`/`company` fields but is **not used by `/interview-prep`**. Active form is `<IntakeForm>` from `interviewPrep/`. Migration complete.

---

## 5. Cross-Feature Input Selector

**No "pick prior resume / prior LinkedIn analysis" dropdown exists today.** Every feature defaults to most-recent via `.order('created_at', desc).limit(1)`:

| Feature | Page | Line | Source table |
|---------|------|------|--------------|
| Resume Analysis (re-trigger) | `Upload.tsx` | 185, 268 | `resumes` |
| LinkedIn Grader | `LinkedInGrader.tsx` | 236, 271 | `linkedin_grades` |
| Career Compass | `CareerCompass.tsx` | 204, 214 | `resumes`, `analysis_results` |
| Recruiting Lens | `RecruitingLens.tsx` | 261, 280 | `resumes`, `analysis_results` |
| Interview Prep | `InterviewPrep.tsx` | 213–220 | `resumes` (filtered `grading_data IS NOT NULL`) |
| Skills Gap Analysis | `SkillsGapAnalysis.tsx` | 169 | `resumes` |
| Profile / Dashboard widgets | `Profile.tsx`, `DashboardHome.tsx`, `Dashboard.tsx` | 97, 49, 60, 87 | various |

**Where a selector would sit:** Each page renders a "Resume detected" tile (e.g., `RecruitingLens.tsx:632–648`) or a cross-feature memory badge (`CareerCompass.tsx:985–989`). Logical placement is to extend that tile into a shadcn `<Select>` showing `file_name + analyzed_at + score`. Candidates:

- Recruiting Lens: replace static tile at `RecruitingLens.tsx:626–674` with a `<Select>` driven by full `resumes` and `linkedin_grades` lists.
- Interview Prep: add adjacent control near `<IntakeForm>` form top.
- Career Compass: alongside / replacing the badge at `CareerCompass.tsx:985–989`.

`<AnalysisComparisonModal>` (`src/components/AnalysisComparisonModal.tsx:269,285`) already paginates resume + linkedin lists — its query pattern is reusable as the selector data source.

---

## 6. Onboarding LinkedIn PDF

Captured in `src/pages/Onboarding.tsx`:

- **State:** `linkedinPdfFile: File | null` at line 138.
- **Upload UI:** Step 2 panel, lines 465–545. File input at 534 (`onChange={handleLinkedinPdfSelect}` 223–231). "Skip for now" allowed (548).
- **Extraction:** `extractPDFText(linkedinPdfFile)` at line 296 (utility from `src/lib/extract-pdf-text.ts`).
- **Storage:** profile update at lines 302–317. Three fields written to **`profiles` table**:
  - `linkedin_pdf_content` (full extracted text)
  - `linkedin_pdf_filename`
  - `linkedin_pdf_updated_at`
- **Read-back today:** Onboarding self-load at line 173 reads `linkedin_pdf_content`.

**v3.0 hookup point for LinkedIn Grader auto-pull:** `LinkedInGrader.tsx` should read `profiles.linkedin_pdf_content` when no fresh upload provided; "replacement becomes new source" requires the grader's upload handler to overwrite all three `linkedin_pdf_*` fields on `profiles` (mirroring Onboarding 308–311).

---

## 7. Celebrations Page

**File:** `src/pages/Celebrations.tsx` (441 lines). Route `/celebrations` (App.tsx:76) — wrapped in `<ProtectedRoute>` + `<DashboardLayout>` (sits inside the app shell with sidebar + topbar).

**Theme behavior — hard-coded dark.** Root container line 163: `<div className="min-h-screen bg-black text-white overflow-x-hidden">`. Every nested element uses literal `text-white`, `text-white/60`, `bg-white/5`, `bg-white/10`, hardcoded indigo / violet / amber gradients. No `dark:` modifiers, no theme-aware tokens. **In light mode the surrounding `<DashboardLayout>` chrome stays light while content stays black** — visible chrome/content mismatch.

**Visual components used:**

- `framer-motion`'s `motion.*` + `AnimatePresence` for blur-to-clear paragraph reveals (304–353)
- `canvas-confetti` (line 4) — fires on first audio play (115)
- `lucide-react`: `ChevronDown` (235), `Play`/`Pause` (255–258), `Upload`/`Linkedin`/`Compass` for the 3 action cards (131–147)
- Inline `<audio>` at 293–298 (`/adventureofalifetime.mp3`)
- Animated SVG heart with linear gradient (360–367)
- Counter hook `useCounter` (13–37) animates user count #12,847

**No use of:** shadcn `<Card>`, design-token CSS variables, theme switcher integration, or `next-themes` `useTheme()`. v3.0 fix requires replacing literal whites/blacks with semantic tokens (`text-foreground`, `bg-background`, etc.) and switching gradients to `dark:`-conditional variants.

---

## 8. Pricing Page Styling

**File:** `src/pages/Pricing.tsx` (80 lines). Route `/pricing` — public.

**Composition:**

- Top: `<Navbar>` (`src/components/Navbar.tsx`) — marketing chrome, **not** dashboard layout
- Body wrapper: `<main className="theme-v2 pt-24 pb-24">` at line 44 — applies a `theme-v2` class scope
- `<BillingIntervalToggleV2>` (`src/components/pricing/BillingIntervalToggleV2.tsx`) — monthly/annual toggle
- 3-column tier grid: `<TierCardV2 />` (`src/components/pricing/TierCardV2.tsx`) iterating over `TIERS = ['free', 'pro', 'elite']`
- `<PackSectionV2>` (`src/components/pricing/PackSectionV2.tsx`) using `<PackCardV2>` for the 4 top-up packs; emits `topup:open` → `<TopUpProvider>`
- Bottom: `<Footer>` (`src/components/Footer.tsx`)

**Design-token usage:**

- `<TierCardV2>` calls `onCta` only; uses ad-hoc CSS-var strings like `text-[--text-muted]` (Pricing.tsx:49) which is **not** the canonical `text-muted-foreground` used everywhere else (e.g., `Settings/Billing.tsx:49,100,116`). The `theme-v2` scope class implies a parallel token set defined per the v2 redesign — confirms v3.0's goal of unifying with the rest of the app's "Institutional Intelligence" tokens.

`<Pricing>` does **not** consume `useStripeCheckout`, `useTierAccess`, or any tier-aware state; Free CTA → non-existent `/auth/signup`, Pro/Elite CTAs → non-existent `/checkout` — both 404 (§2). Pack CTAs work via global `topup:open`.

**Reference (correct) pattern unused:** `src/components/PricingTable.tsx` is the v1 component that calls `useStripeCheckout` + `<StripeCheckoutWrapper>` to embed Stripe Elements inline. Imported only by its own test. v3.0 either restores its checkout pattern into `<TierCardV2>`/`<Pricing>`, or wires `Pricing.tsx` to call `useStripeCheckout` + open `<StripePaymentElementModal>` (the same modal `<TopUpProvider>` uses for packs).

---

## Quick-Reference: v3.0 Bug Inventory (UI Layer)

| # | Symptom | File:Line | Fix surface |
|---|---------|-----------|-------------|
| 1 | 404 on Upgrade → `/checkout` | `src/pages/Pricing.tsx:22` | Replace `navigate('/checkout?...')` with inline Stripe checkout (`useStripeCheckout` + `<StripePaymentElementModal>`) |
| 2 | 404 on Free signup → `/auth/signup` | `src/pages/Pricing.tsx:19` | Use `/auth` |
| 3 | `/settings/billing` may hang on loading | `src/pages/Settings/Billing.tsx:328–335` | Add `.eq('user_id', userId!)` to `merit_shop_purchases` query; verify error→spinner transition |
| 4 | Resume "Priority Actions" still rendered | `src/pages/Results.tsx:971–1004` | Delete block |
| 5 | LinkedIn "What's Working For You" still rendered | `src/pages/LinkedInGrader.tsx:844–876` | Delete block |
| 6 | Career Compass empty for Pro/Elite | `src/pages/CareerCompass.tsx:1006–1079` (consumers); upstream prompt/schema | Backend scope, but UI must defensively render when `analysis.{careerFields,surpriseFits,roles,multiRoleReadiness,roleReadinessBreakdown,roadmap,roleRoadmaps}` missing |
| 7 | Celebrations dark-only | `src/pages/Celebrations.tsx:163` and throughout | Replace literal `bg-black text-white` with semantic tokens + `dark:` variants |
| 8 | Pricing uses ad-hoc tokens | `src/pages/Pricing.tsx:44, 49`; `src/components/pricing/*` | Migrate `theme-v2` + `text-[--text-muted]` to canonical `text-muted-foreground` etc. |
| 9 | Recruiting Lens missing company/role inputs | `src/pages/RecruitingLens.tsx:550–622` | Add two `<Input>` fields above JD textarea; mark required; thread through `handleAnalyze` (line 406) |
| 10 | No tutorial modal on Recruiting Lens | n/a — to be created | New `src/components/recruiting-lens/TutorialModal.tsx`; wire dismissable on first visit (localStorage flag) |
| 11 | No Saved Jobs UI | n/a | Scaffold above input form on `/recruiting-lens` |
| 12 | No prior-analysis selector | `RecruitingLens.tsx:626–674`, `InterviewPrep.tsx` form area, `CareerCompass.tsx:985–989` | Replace single-pick tile with `<Select>` of all resumes / linkedin grades (data pattern from `AnalysisComparisonModal.tsx:269,285`) |
| 13 | Onboarding LinkedIn PDF not auto-pulled by Grader | `src/pages/LinkedInGrader.tsx` (no read of `profiles.linkedin_pdf_content`) | Fetch `profiles.linkedin_pdf_content` as initial source; replacement upload writes back to all 3 `linkedin_pdf_*` fields |
| 14 | Deprecated lock primitives still present | `src/components/{LockedSection,LockedListItem,ProFeatureBlur}.tsx` | Migrate any remaining call sites to `<BlurredLockCard>`, then delete |

---

*Structure analysis: 2026-04-28*
