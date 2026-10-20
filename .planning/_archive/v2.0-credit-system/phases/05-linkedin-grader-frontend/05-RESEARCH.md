# Phase 5: LinkedIn Grader — Frontend - Research

**Researched:** 2026-04-12
**Domain:** React/TypeScript frontend refactor — schema migration, entitlement UX, shared-component rewire
**Confidence:** HIGH

## Summary

This phase rewrites `src/pages/LinkedInGrader.tsx` to render the v3.0 backend schema produced in Phase 4, adds two new UI blocks (`profileInsights`, `rewrites`), deletes the dead client-side `previousGrade` pre-fetch, and enforces a "1 free scan per billing cycle, then 1 AI credit" entitlement for Pro/Elite. A small backend edit to `grade-linkedin/index.ts` (and an additive helper in `_shared/usage-checker.ts`) is required because frontend-only free-scan logic can't be authoritative for credit accounting.

All the load-bearing infrastructure already exists: the v3.0 schema is nailed down by `validation.ts`; a SQL function `public.get_billing_period_start(p_user_id)` already computes billing-cycle start from `profiles.created_at`; `linkedin_grades` already has `user_id` and `created_at` columns; the v3.0 `check_and_record_ai_usage` RPC is atomic via an advisory lock. The research confirms the planner can reuse existing helpers everywhere — no new hooks, no new migrations, no new context.

**Primary recommendation:** Replace the `AnalysisResult` interface and `normalizeGradeResult` adapter in `LinkedInGrader.tsx` with a strict v3.0 type matching `validation.ts`. Drop all legacy mapping. For entitlement, add a new `check_ai_usage_allowed(userId, actionType)` helper in `_shared/usage-checker.ts` that wraps `can_perform_ai_action` without inserting a row, and branch in `grade-linkedin/index.ts` step 6 on `linkedin_grades.count(user_id, created_at >= get_billing_period_start(user_id)) === 0`. Rewire `AnalysisComparisonModal` via a discriminated union on `analysisType` rather than forking — the resume path already uses distinct `grading_data` field paths.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema Migration & Types**
- **D-01:** Hard break `AnalysisResult` interface in `LinkedInGrader.tsx` to match v3.0 exactly: `rawScore`, `scoreJustification`, `profileInsights[]`, `nextBestAction {action, reason, expectedImpact}` (flat — no `primaryAction`/`secondaryActions`), `sectionBreakdown[4]`, `topFixes[*]` with `suggestedFix` (not `suggestedRewrite`), `keyStrengths[]`, `rewrites[4]`. Delete legacy fields (`overall_score`, `categories`, `suggestedRewrite`, `primaryAction`, `secondaryActions`, `scoreDrivers`, `detailedFeedback`, `strengths`, `weaknesses`, `tips`). `validation.ts` is authoritative.
- **D-02:** Remove dead client-side `previousGrade` pre-fetch (~lines 248-268) and drop `previousSuggestions`/`previousScore` from request body. Backend already pre-fetches in step 7.

**Cached Grade Handling**
- **D-03:** Ignore pre-v3.0 cached grades on mount. Detect legacy shape (missing `sectionBreakdown` or `rawScore`) and treat as "no cache". No adapter, no banner.

**profileInsights UI**
- **D-04:** Render `profileInsights` under score hero, above Key Strengths. Heading: "What's Working" / exceptional-elements framing. 2-col grid desktop, stacked mobile.
- **D-05:** Each insight = quoted-text callout card (italic quote block + "Why this matters to recruiters" line). Emerald/gold accent.

**rewrites UI**
- **D-06:** New "Paste-Ready Rewrites" section below Section Breakdown. 4 stacked cards. Index 0 = top-priority styling (rose/amber banner, "Headline" label). Each card has a Copy button (existing `navigator.clipboard.writeText` + toast pattern).
- **D-07:** `rewrites` and `topFixes` remain visually distinct: rewrites = "paste this", topFixes = "change this". Existing "Ready-to-Paste Improvements" block now renders `topFixes[*].suggestedFix` (renamed from `suggestedRewrite`).

**Section Breakdown Rendering**
- **D-08:** Simplify section cards: `name`, `score`, `maxScore`, `status` (icon), progress bar, summary line, `feedback: string[]` as numbered bullets. Delete all legacy nested rendering.

**Entitlement (LIG-11)**
- **D-09:** Backend enforces free-scan rule. Before `checkAndRecordUsage`, count `linkedin_grades` rows in current billing cycle; if zero, skip the usage decrement.
- **D-10:** Frontend queries `linkedin_grades` count WHERE `created_at >= billing cycle start`. Direct Supabase query in `checkAccessAndLoadCache`. State: `'free-available' | 'will-use-credit' | 'loading'`.
- **D-11:** Inline helper text under Analyze button. No confirmation modal. Include remaining credit count from `useAiCredits` if available.

**Comparison Modal**
- **D-12:** Rewire `AnalysisComparisonModal` for LinkedIn path to accept v3.0 shape. Resume path out of scope. Discriminated union or separate prop — no mutation of resume path.

**Unchanged**
- **D-13:** Free-tier `ProFeatureGate`, PDF/paste flow, URL field, `UniversalAnalyzing`, Scan New Profile, cache badge, post-analysis CTAs all preserved.

### Claude's Discretion

- Exact Tailwind classes / color tokens (must use semantic tokens)
- Exact copy for entitlement helper text and section heading
- Whether to extract a `LinkedInResult` type file or keep inline
- Motion/animation delays (match existing framer-motion)
- Whether D-03 legacy detector uses single field check or type guard function
- Error-state copy on entitlement query failure (graceful degrade: assume `will-use-credit`)

### Deferred Ideas (OUT OF SCOPE)

- Redesign of post-analysis CTAs or cache indicator
- Prominent "Free rescan available" CTA (inline under Analyze button is sufficient)
- Extending `useAiCredits` with a `linkedinFreeAvailable` field
- New `linkedin_free_used` column with cycle-reset logic

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIG-01 | User can upload LinkedIn PDF or paste profile text (≤12,000 chars) with optional URL | PDF upload / paste / URL inputs already present (D-13 preserved); LinkedInGrader.tsx lines 211-282, 504-594. Backend truncates at 12,000 chars (index.ts:115). No new work — requirement is pre-existing; the frontend rewrite must not regress it. |
| LIG-08 | 4 paste-ready rewrites, first is headline, voice-preserving, zero placeholders | Backend validator enforces `rewrites.length === 4` and placeholder regex (validation.ts:135-149). Frontend needs to render `rewrites: string[]` (D-06) with index 0 = headline styling. |
| LIG-09 | Profile insights highlight 2-4 exceptional elements with quoted text and recruiter relevance | Backend validator enforces `profileInsights` length 2-4 (validation.ts:153). Frontend needs the new "What's Working" block (D-04/D-05). |
| LIG-11 | Pro/Elite get 1 free scan per billing cycle, then 1 credit/scan | Backend edit (D-09) + frontend entitlement signal (D-10/D-11). Uses existing `get_billing_period_start(p_user_id)` SQL helper and `linkedin_grades.user_id`/`created_at` columns. |
| LIG-13 | Output matches v3.0 JSON schema (rawScore, scoreJustification, profileInsights, nextBestAction, sectionBreakdown, topFixes, keyStrengths) | Hard-break `AnalysisResult` interface (D-01). Delete legacy shape and `normalizeGradeResult` adapter. |

## Standard Stack

[VERIFIED: package.json] All libraries already in use; no new dependencies required.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^18.3.1 | UI framework | Existing stack |
| typescript | ^5.8.3 | Strict types for v3.0 interface | Project convention |
| framer-motion | ^12.23.26 | Section reveal animations | Matches existing LinkedInGrader motion patterns |
| lucide-react | ^0.462.0 | Icons (Copy, Quote, Sparkles, Star) | Already used |
| sonner | ^1.7.4 | `toast.success('Copied to clipboard!')` | Already used in file |
| @supabase/supabase-js | ^2.81.1 | Direct `linkedin_grades` query for entitlement | Already used |

### Supporting (existing shadcn/ui components)
| Component | Purpose |
|-----------|---------|
| `@/components/ui/card` | Insight / rewrite cards |
| `@/components/ui/button` | Copy button, Analyze button |
| `@/components/ui/badge` | "Headline" / priority labels |
| `@/components/ui/progress` | Section progress bars |

**Installation:** None. All dependencies present.

## Architecture Patterns

### v3.0 `LinkedInResult` TypeScript Interface

Derived from `supabase/functions/grade-linkedin/validation.ts`:

```typescript
export interface LinkedInSection {
  name: 'Headline' | 'Experience' | 'Skills & Endorsements' | 'Profile Completeness';
  score: number;           // 0..maxScore
  maxScore: 20 | 30 | 25;  // fixed by EXPECTED_SECTIONS
  status: 'excellent' | 'good' | 'needs-improvement';
  feedback: string[];      // length >= 3
}

export interface LinkedInTopFix {
  title: string;
  currentText: string;
  suggestedFix: string;    // RENAMED from suggestedRewrite
  whyItWorks: string;
  pointsGain: string;
  priority: number;
}

export interface LinkedInNextBestAction {
  action: string;
  reason: string;
  expectedImpact: string;
}

export interface LinkedInProfileInsight {
  // Backend validator checks length 2-4 but does NOT constrain item shape.
  // Phase 4 prompt determines runtime shape — confirm with Phase 4 prompts.ts.
  // EXPECTED shape per CONTEXT D-05: { quote: string, recruiterRelevance: string }
  // Treat as unknown JSON until prompt shape is verified.
  [key: string]: unknown;
}

export interface LinkedInResult {
  rawScore: number;                       // 0-100, sum of section scores
  scoreJustification: string;
  profileInsights: LinkedInProfileInsight[];  // length 2-4
  nextBestAction: LinkedInNextBestAction;
  sectionBreakdown: LinkedInSection[];    // length === 4
  topFixes: LinkedInTopFix[];
  keyStrengths: string[];                 // non-empty
  rewrites: string[];                     // length === 4, rewrites[0] is headline
  // Frontend-only augmentation (not from backend JSON)
  recordId?: string | null;
  created_at?: string;
}
```

**⚠️ Action item for planner:** `profileInsights` item shape is NOT constrained by `validation.ts` — only array length is validated. Before writing the type, read `supabase/functions/grade-linkedin/prompts.ts` to discover what field names the prompt actually instructs the model to emit (likely `quote` / `recruiterRelevance` per D-05 or similar). If the prompt guarantees a specific shape, type it strictly; otherwise use a defensive `{ quote?: string; reason?: string; [k: string]: unknown }` shape and render with safe fallbacks.

### Legacy Fields to Delete (D-01/D-02 blast radius)

All the following appear in `src/pages/LinkedInGrader.tsx`:

| Symbol | Line range | Notes |
|--------|------------|-------|
| `interface ScoreDrivers` | 24-27 | DELETE |
| `interface Category` with `scoreDrivers`, `detailedFeedback`, `strengths`, `weaknesses`, `tips` | 29-40 | DELETE (replace with `LinkedInSection`) |
| `interface TopFix.suggestedRewrite` | 46 | RENAME to `suggestedFix` |
| `interface NextBestActionSecondary` | 51-56 | DELETE |
| `interface NextBestAction.primaryAction`, `.secondaryActions` | 64-70 | DELETE (flatten to `{action, reason, expectedImpact}`) |
| `interface AnalysisResult.overall_score` | 74 | RENAME to `rawScore` |
| `interface AnalysisResult.categories` | 76 | RENAME to `sectionBreakdown` |
| `function normalizeGradeResult` (entire legacy-to-new adapter) | 84-135 | DELETE. Replace with minimal passthrough + legacy-shape detection (D-03). |
| `previousSuggestions`/`previousScore` pre-fetch block | 294-314 | DELETE (D-02). Body becomes `{ profileData: { profileUrl, profileContent } }` only. `userId` also dropped (Phase 4 D-12). |
| Score circle `result.overall_score` | 717, 720, 727, 732 | RENAME to `result.rawScore` (4 references in score hero) |
| `result.categories?.map` | 878 | RENAME to `result.sectionBreakdown?.map` |
| `cat.detailedFeedback || cat.strengths || cat.scoreDrivers...` branching | 921-927 | REPLACE with `cat.feedback.slice(0, 4).map(...)` |
| `fix.suggestedRewrite` (rendering + copy) | 988, 997, 1005 | RENAME to `fix.suggestedFix` |
| `result.nextBestAction.primaryAction` / `.secondaryActions` branching | 810-866 | DELETE entire branching. Render flat `{action, reason, expectedImpact}` only. |
| `AnalysisComparisonModal` grading_data props (`categories`, `strengths: keyStrengths`, `improvements: topFixes.map(...)`) | 694-700 | REPLACE with v3.0 shape (see Comparison Modal section below) |

[VERIFIED: src/pages/LinkedInGrader.tsx read 1-1055]

### Section Breakdown Rendering Pattern (D-08)

Existing numbered-bullet visual already used at lines 927-934 — reuse verbatim:

```tsx
{cat.feedback.slice(0, 4).map((point, idx) => (
  <div key={idx} className="flex items-start gap-2.5">
    <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
      <span className="text-[9px] font-bold text-primary">{idx + 1}</span>
    </div>
    <p className="text-xs text-foreground/80 leading-relaxed">{point}</p>
  </div>
))}
```

Note: the current card also shows `cat.feedback` as an italicized summary line (line 916). In v3.0 `feedback` is `string[]` — there is no summary line. Planner must decide whether to synthesize one from `sectionBreakdown[i].feedback[0]` or drop the italic summary line entirely. Recommendation: drop it — feedback[0] already carries the context as a numbered bullet.

### Entitlement Query Pattern (D-10)

**Single query approach** per CONTEXT line 130 — combine cache-load and cycle-count into one call:

```typescript
// In checkAccessAndLoadCache, after getting user + tier:
const { data: billingStartData } = await supabase.rpc('get_billing_period_start', {
  p_user_id: user.id
});
const billingStart = billingStartData as string; // DATE → ISO string

const { data: cycleRows } = await supabase
  .from('linkedin_grades')
  .select('id, overall_score, grading_data, created_at, profile_url')
  .eq('user_id', user.id)
  .gte('created_at', billingStart)
  .order('created_at', { ascending: false });

const freeAvailable = (cycleRows?.length ?? 0) === 0;
const lastGrade = cycleRows?.[0];
```

**Verification needed:** `get_billing_period_start` is a `SECURITY DEFINER` function with `SET search_path = public` [VERIFIED: 20251222220418 migration]. It may or may not be exposed via PostgREST RPC. If the `supabase.rpc` call fails in staging, fallback option is to read `profiles.created_at` client-side and compute day-of-month in JS — but this duplicates backend logic. Planner should test the RPC call first.

**Graceful degrade:** On query error, set `entitlementState = 'will-use-credit'` — safer default (user pays one credit, no free-scan bypass attempted).

### Free-Scan Backend Enforcement (D-09)

`_shared/usage-checker.ts` currently has ONE function: `checkAndRecordUsage(userId, actionType)` which calls the atomic `check_and_record_ai_usage` RPC (holds advisory lock, checks allowed, inserts row — all in one transaction). There is NO check-without-record variant.

**Recommended addition to `usage-checker.ts`:**

```typescript
/** Checks usage limit WITHOUT recording a row. Used for free-scan bypass. */
export async function checkAiUsageAllowed(userId: string): Promise<UsageCheckResult> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('can_perform_ai_action', { p_user_id: userId });
  if (error) {
    console.error('Error checking usage:', error);
    return { allowed: false, resetDate: '', tier: 'unknown' };
  }
  const result = data as { allowed: boolean; reset_date: string; tier: string };
  return { allowed: result.allowed, resetDate: result.reset_date, tier: result.tier };
}
```

`can_perform_ai_action(p_user_id)` already exists and returns the jsonb shape `{ allowed, current_usage, limit, tier, reset_date, is_lifetime_limit, billing_start }` [VERIFIED: 20251223172718 migration].

**Atomicity note:** Unlike `checkAndRecordUsage`, this path does NOT take an advisory lock. That's acceptable for the free-scan branch specifically because we're not decrementing — there's no TOCTOU hazard when the operation is idempotent. However, the **free-scan count** query (`linkedin_grades WHERE created_at >= cycle_start`) is itself a TOCTOU surface: two concurrent requests could both see `count === 0` and both bypass. Mitigation options:
1. **Accept the race** — worst case is 2 free scans per cycle instead of 1. Low-stakes financially.
2. **Wrap in a single SQL function** — add `check_linkedin_free_scan_available(userId)` that queries `linkedin_grades` + takes advisory lock + returns boolean. Most defensive.
3. **Count after insert** — run the analysis, insert the row, then post-hoc record usage IFF the just-inserted row was not the first of the cycle. Harder to reason about.

Recommendation: option 1 (accept the race) for simplicity. The phase gate is a user-facing perk, not a revenue leak — and the backend will still be authoritative for credit exhaustion.

### Backend Edit Site (`grade-linkedin/index.ts` step 6)

Current step 6 (lines 123-131) unconditionally decrements. Replacement:

```typescript
// 6. Usage check + free-scan detection
const { count: cycleGradeCount } = await getServiceClient()
  .from('linkedin_grades')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId)
  .gte('created_at', /* billing_start from RPC */);

const isFreeScan = (cycleGradeCount ?? 0) === 0;

if (isFreeScan) {
  // Check allowed without recording — ensures tier/auth still enforced
  const allowedCheck = await checkAiUsageAllowed(userId);
  // Note: free scan bypasses the credit LIMIT too, per LIG-11.
  // But we still block fully-depleted unauthenticated-style errors.
} else {
  const usageCheck = await checkAndRecordUsage(userId, 'linkedin_grading');
  if (!usageCheck.allowed) {
    return createUsageLimitResponse(usageCheck.resetDate, usageCheck.tier, corsHeaders({ type: 'user' }));
  }
}
```

Planner must also verify: does LIG-11 mean "free scan on top of limit" or "free scan that still respects tier cap"? Per CONTEXT wording ("1 free scan per cycle, then 1 AI credit per scan"), free scan is additive — it does NOT count against the 100/300 credit limit. The plan should treat `isFreeScan === true` as a hard bypass of both check and record.

### Comparison Modal Rewire (D-12)

**Callers of `AnalysisComparisonModal`:**
- `src/pages/LinkedInGrader.tsx` line 690 — LinkedIn path
- `src/pages/Results.tsx` line 773 — Resume path (OUT OF SCOPE)

**Current prop shape:**
```typescript
interface ComparisonProps {
  currentAnalysis: {
    id: string;
    overall_score: number;
    grading_data: any;  // freeform
    created_at: string;
    file_name?: string;
  };
  analysisType: "resume" | "linkedin";
}
```

The modal reaches into `grading_data.criteria`, `grading_data.strengths`, `grading_data.improvements` (lines 281-307) — all legacy shape fields. For the LinkedIn path it also passes `grading_data.categories` and synthesizes `improvements: topFixes.map(f => f.title)` from the caller.

**Recommended rewire (discriminated union):**

```typescript
interface ResumeAnalysis {
  id: string;
  overall_score: number;
  grading_data: any;        // resume shape
  created_at: string;
  file_name?: string;
}

interface LinkedInAnalysis {
  id: string;
  rawScore: number;
  sectionBreakdown: LinkedInSection[];
  topFixes: LinkedInTopFix[];
  keyStrengths: string[];
  profileInsights: LinkedInProfileInsight[];
  created_at: string;
}

type ComparisonProps =
  | { analysisType: 'resume'; currentAnalysis: ResumeAnalysis }
  | { analysisType: 'linkedin'; currentAnalysis: LinkedInAnalysis };
```

Inside the modal, branch the existing `getCurrentCriteria`/`getCurrentStrengths`/`getCurrentImprovements` helpers on `analysisType`. For LinkedIn:
- `criteria` → derived from `sectionBreakdown` as `{ name, weight: maxScore, score: (score/maxScore)*100 }`
- `strengths` → `keyStrengths`
- `improvements` → `topFixes.map(f => f.title)`

**Previous-row fetch:** The modal already queries `linkedin_grades` (line 252) — unchanged except it reads `grading_data` as v3.0 blob. Legacy cached rows in DB will produce undefined fields — the modal must handle missing `sectionBreakdown`/`rawScore` gracefully (filter them out of the `previousAnalyses` dropdown, or show "Cannot compare with pre-v3.0 grade").

**Less invasive alternative:** Add an optional `linkedinData?: LinkedInAnalysis` prop sibling and keep `currentAnalysis` for the resume path. Chosen approach is planner's discretion but discriminated union is cleaner and TypeScript-safer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Billing cycle start calculation | Client-side day-of-month math from `profiles.created_at` | `supabase.rpc('get_billing_period_start', { p_user_id })` [VERIFIED: 20251222220418 migration] | Logic already duplicated inside `check_and_record_ai_usage` + `can_perform_ai_action`; diverging client copy guarantees drift |
| Usage-check without record | Duplicate advisory-lock pattern | New `checkAiUsageAllowed(userId)` wrapping existing `can_perform_ai_action` RPC | Reuses the same SQL truth source; no new lock logic |
| Copy-to-clipboard on rewrite cards | Custom hook | Existing pattern: `navigator.clipboard.writeText(text); toast.success('Copied to clipboard!');` [VERIFIED: LinkedInGrader.tsx:822, 997] | Already used 2x in the same file |
| Section status icon | New icon mapping | Existing `getStatusIcon(status)` helper [VERIFIED: LinkedInGrader.tsx:365-369] | Unchanged — keep |
| Score color | New color function | Existing `getScoreColor(score)` helper [VERIFIED: LinkedInGrader.tsx:372-377] | Unchanged — keep |
| Entitlement context / hook | New `useLinkedInEntitlement` hook | Direct supabase query in `checkAccessAndLoadCache` per D-10 | CONTEXT explicitly defers a new hook |

**Key insight:** Almost everything needed already exists. The phase is a schema rename + 2 new render blocks + 1 entitlement branch. Do not invent abstractions.

## Common Pitfalls

### Pitfall 1: NaN score circle from rename miss
**What goes wrong:** Score hero renders `undefined` or `NaN` because one reference to `result.overall_score` was missed during the rename.
**Why it happens:** The field is referenced 4+ times in the score hero (lines 717, 720, 727, 732) plus in confetti timing, comparison-modal prop, and CTA text. Missing one breaks the rendering of a key UI element.
**How to avoid:** After renaming, grep `overall_score` in the file and expect zero hits (except inside the `AnalysisComparisonModal` type for the resume path).
**Warning signs:** Circle shows `/100` with no number; confetti doesn't fire; badge color falls through default.

### Pitfall 2: Legacy cached row crashes render
**What goes wrong:** Production user has a v2.x cached grade in `linkedin_grades`. On mount, `result.sectionBreakdown?.map` is undefined → no crash, but `result.rewrites[0]` throws.
**Why it happens:** Optional chaining saves most accesses but not indexed access into a missing array.
**How to avoid:** D-03 mandates detection on `checkAccessAndLoadCache` — if `!grading_data.rawScore || !Array.isArray(grading_data.sectionBreakdown)`, skip cache entirely. Use `rawScore` absence as the primary check — it's a scalar, always truthy-checked in a single expression. Cheaper and safer than array check alone.
**Warning signs:** Users with old grades see the analyze form instead of cached results. (This is the intended D-03 behavior.)

### Pitfall 3: Comparison modal break from shared prop shape
**What goes wrong:** Changing `ComparisonProps.grading_data` to v3.0 shape breaks `Results.tsx` resume path.
**Why it happens:** The modal is used by both features with the same prop type.
**How to avoid:** Discriminated union keyed on `analysisType`. Keep resume branch reading `grading_data.criteria/strengths/improvements` unchanged. Only add a new LinkedIn branch.
**Warning signs:** `npm run lint` or TypeScript compile errors in `Results.tsx` after changing modal types.

### Pitfall 4: Free-scan TOCTOU race
**What goes wrong:** User rapidly double-clicks Analyze; both requests see `cycleGradeCount === 0`; both bypass credit decrement.
**Why it happens:** The count query is not under the same advisory lock as the usage check.
**How to avoid:** Accept the race (low-stakes perk) OR wrap the free-scan check + count in a single SQL function. Do not try to DIY lock in JS.
**Warning signs:** User gets 2 free scans in a cycle instead of 1.

### Pitfall 5: Entitlement query fails silently → wrong helper text
**What goes wrong:** `get_billing_period_start` RPC call fails (permissions or not exposed); code treats `cycleRows.length === 0` (because query returned null/empty) as "free scan available" and shows green text — but backend will still decrement.
**Why it happens:** Null query result is indistinguishable from "no rows this cycle" without error handling.
**How to avoid:** Branch on `error` explicitly: `if (error) setEntitlementState('will-use-credit')`. Graceful degrade to the safer assumption.

### Pitfall 6: profileInsights shape assumption
**What goes wrong:** Frontend assumes `{quote, recruiterRelevance}` shape but Phase 4 prompt uses different field names (e.g., `text`, `impact`). Rendering shows empty cards.
**Why it happens:** `validation.ts` only checks array length, not item shape.
**How to avoid:** READ `supabase/functions/grade-linkedin/prompts.ts` before writing the type. Confirm exact field names. If unclear, defensive type with fallback rendering.

## Code Examples

### Quoted-text callout card (profileInsights render pattern)

No existing "blockquote with border-l-4 italic" pattern in `src/` [VERIFIED: grep returned no matches]. Create minimal new pattern:

```tsx
// Source: new pattern — match existing Card + motion conventions from LinkedInGrader.tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ delay: 0.15 + i * 0.05 }}
>
  <Card className="p-5 border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/10">
    <blockquote className="border-l-2 border-emerald-400 pl-3 mb-3">
      <p className="text-sm italic text-foreground/90 leading-relaxed">"{insight.quote}"</p>
    </blockquote>
    <p className="text-xs text-muted-foreground leading-relaxed">
      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Why this matters:</span> {insight.recruiterRelevance}
    </p>
  </Card>
</motion.div>
```

### Rewrite card with Copy (rewrites[0] = headline priority)

```tsx
// Source: adapted from existing topFixes block lines 958-1005
<Card className={`overflow-hidden border ${
  i === 0 ? 'border-transparent shadow-lg ring-1 ring-rose-300/50 dark:ring-rose-500/30' : 'border-border'
}`}>
  {i === 0 && (
    <div className="relative bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 text-white text-xs font-semibold px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5 fill-white" />
        <span className="tracking-wide uppercase text-[11px]">Headline Rewrite</span>
      </div>
      <span className="text-white/90 text-[10px] font-medium">Top Priority</span>
    </div>
  )}
  <div className="p-5">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-medium leading-relaxed flex-1">{rewrite}</p>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(rewrite);
          toast.success('Copied to clipboard!');
        }}
      >
        <Copy className="h-3 w-3 mr-1" /> Copy
      </Button>
    </div>
  </div>
</Card>
```

### Framer motion delay cadence (match existing)

From LinkedInGrader.tsx current patterns [VERIFIED: lines 786, 886, 912, 956]:
- Key Strengths cards: `delay: 0.2 + i * 0.05`
- Section cards: `delay: 0.2 + i * 0.08`
- Progress bar animation: `delay: 0.3 + i * 0.08`
- topFixes cards: `delay: 0.4 + i * 0.1`

New blocks should slot in between:
- profileInsights (under score hero, before Key Strengths): `delay: 0.15 + i * 0.05`
- rewrites (below section breakdown, before topFixes): `delay: 0.35 + i * 0.1`

### Legacy shape detector (D-03)

```typescript
// Source: new — D-03 minimal check
function isV3Grade(grading_data: unknown): boolean {
  if (!grading_data || typeof grading_data !== 'object') return false;
  const g = grading_data as Record<string, unknown>;
  return typeof g.rawScore === 'number' && Array.isArray(g.sectionBreakdown);
}
```

Single expression, both fields checked, trivially inlineable if the planner prefers.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 12-criterion rubric | 4-section architecture (Headline 20, Experience 30, S&E 25, PC 25) | Phase 4 (LIG-03) | Frontend must render 4 cards, not 12 |
| `overall_score` field | `rawScore` field | Phase 4 | Renders in score hero |
| `suggestedRewrite` on topFixes | `suggestedFix` on topFixes | Phase 4 (D-04 backend) | Rename call sites |
| `categories[]` | `sectionBreakdown[]` | Phase 4 | Rename + simplify |
| Frontend pre-fetches previous grade | Backend pre-fetches in step 7 | Phase 4 (D-08) | Remove client pre-fetch + body params |
| Nested `primaryAction`/`secondaryActions` | Flat `nextBestAction.{action, reason, expectedImpact}` | Phase 4 (D-04 backend) | Simplify render block |
| N/A | `profileInsights` 2-4 items | Phase 4 (D-06) | New UI block |
| `suggestedRewrite` inside topFixes doubling as "paste-ready" | Separate top-level `rewrites[4]` | Phase 4 (D-04) | New UI section |

**Deprecated/outdated:**
- `normalizeGradeResult` function (LinkedInGrader.tsx:84-135) — delete
- `previousSuggestions` / `previousScore` pre-fetch — delete
- `primaryAction` / `secondaryActions` branching — delete

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `profileInsights` items have shape `{ quote, recruiterRelevance }` per D-05 framing | Architecture Patterns | Empty cards render. Planner MUST read Phase 4 `prompts.ts` to verify before coding. [ASSUMED] |
| A2 | `get_billing_period_start(p_user_id)` is callable via `supabase.rpc` from frontend with anon JWT | Entitlement Query Pattern | Frontend entitlement signal fails; graceful degrade kicks in (user sees "will use credit" always). Planner should test in staging. [ASSUMED — function is `SECURITY DEFINER` so should be exposed, but RLS on profiles may interfere] |
| A3 | Free-scan is additive on top of tier cap (doesn't count against 100/300 limit) | Backend Edit Site | Users on depleted credits could get blocked unexpectedly. Reading CONTEXT D-09 literally supports this interpretation; confirm with discuss-phase if unclear. [ASSUMED] |
| A4 | Single query with `.gte('created_at', billingStart)` returns rows ordered by created_at desc already | Entitlement Query Pattern | Cache-row candidate picking `rows[0]` could be wrong. Mitigated by explicit `.order('created_at', { ascending: false })` in the query. [VERIFIED — code includes the order clause] |
| A5 | `linkedin_grades` RLS allows users to read their own rows for the cycle-count query | Entitlement Query Pattern | Query returns 0 rows → false "free scan available". Need to verify RLS policies on `linkedin_grades` (existing modal caller at AnalysisComparisonModal.tsx:252 proves READ works, so LOW risk). [VERIFIED via existing working caller] |

## Open Questions (RESOLVED)

1. **profileInsights runtime shape**
   - What we know: validator checks `Array.isArray && length 2-4`. Frontend CONTEXT D-05 describes "italicized quote block + 'Why this matters' line".
   - What's unclear: Exact field names the Phase 4 prompt instructs the model to emit.
   - Recommendation: Planner reads `supabase/functions/grade-linkedin/prompts.ts` in task 1. If ambiguous, use defensive type `{ quote?: string; reason?: string; recruiterRelevance?: string; [k: string]: unknown }` and render `insight.quote || insight.text` with fallbacks.
   - **RESOLVED:** `string[]` — confirmed by `supabase/functions/grade-linkedin/prompts.ts:84`. Each item is a combined prose string quoting specific profile text and explaining competitive advantage. Do NOT type as `{quote, recruiterRelevance}`. The frontend must render each item as a single blockquote of the full prose string.

2. **Free-scan limit interaction with credit cap**
   - What we know: LIG-11 says "1 free scan per cycle, then 1 AI credit per scan".
   - What's unclear: Does the free scan bypass the tier cap entirely, or just bypass the 1-credit decrement for a user who still has credits?
   - Recommendation: Treat free scan as additive (bypasses both check and record). This matches CONTEXT D-09 literally and is the more generous interpretation.
   - **RESOLVED:** Free scan is fully additive. It bypasses BOTH the allowed check AND the usage record insert — no `checkAiUsageAllowed`, no `checkAndRecordUsage`. This is an intentional product carve-out. TOCTOU worst case = 1 extra free scan per cycle, accepted per T-05-01. Paid path (non-zero cycle count) still uses atomic `checkAndRecordUsage` unchanged (Phase 4 CR-01 preserved).

3. **Legacy grading_data in DB at time of rollout**
   - What we know: Pre-Phase-4 deployments may have left v2.x cached rows. D-03 says detect and skip.
   - What's unclear: Should the comparison modal filter legacy rows out of the "compare to previous" dropdown, or show a disabled entry?
   - Recommendation: Filter them out silently from the dropdown. Don't surface upgrade friction.
   - **RESOLVED:** Filter legacy rows silently from the comparison dropdown per D-03 / D-12. Detector: `typeof grading_data.rawScore === 'number' && Array.isArray(grading_data.sectionBreakdown)`. Rows failing this check are hidden from the dropdown; no disabled entry, no banner, no upgrade friction.

## Environment Availability

Phase is pure code/config changes (frontend TS + one backend TS edit + one new SQL-free helper). No new external dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase project | All queries | ✓ | 2.76.9+ | — |
| `linkedin_grades` table with `user_id`, `created_at` | Cycle-count query | ✓ | [VERIFIED: 20251223075804 + 20260410235959 migrations] | — |
| `get_billing_period_start` SQL RPC | Entitlement query | ✓ | [VERIFIED: 20251222220418 migration] | Compute day-of-month in JS from `profiles.created_at` |
| `can_perform_ai_action` SQL RPC | Free-scan usage check | ✓ | [VERIFIED: 20251223172718 migration] | — |
| `check_and_record_ai_usage` SQL RPC (atomic) | Paid-scan usage check | ✓ | [VERIFIED: 20260411000002 migration] | — |

No blocking dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno `deno test` for edge functions; no frontend test runner present [VERIFIED: package.json shows no jest/vitest] |
| Config file | `supabase/functions/deno.json` |
| Quick run command | `deno test supabase/functions/grade-linkedin/` (backend edit) |
| Full suite command | `.\scripts\run-edge-tests.ps1` |
| Frontend verification | `npm run build` + `npm run lint` (no unit test harness) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LIG-01 | PDF upload, paste, URL inputs render and submit correctly | manual / smoke | Manual walkthrough in dev server + `npm run build` | ✅ (page exists, preserved by D-13) |
| LIG-08 | 4 rewrite cards render with index 0 as headline, Copy works | unit (backend) + manual (frontend) | `deno test supabase/functions/grade-linkedin/validation.test.ts` (rewrite-count assertion) + manual Copy-button test | ❌ Wave 0: add frontend render assertion if test harness added; otherwise manual |
| LIG-09 | profileInsights block renders 2-4 quoted cards | unit (backend) + manual (frontend) | validation.test.ts covers length; frontend = visual check | ❌ Wave 0: visual only |
| LIG-11 | Pro/Elite first scan per cycle does NOT decrement usage; subsequent scans do | integration | New `deno test` for `grade-linkedin/index.ts` with mock linkedin_grades count | ❌ Wave 0: `supabase/functions/grade-linkedin/index.test.ts` for free-scan branch |
| LIG-13 | Output matches v3.0 schema — `rawScore`, `sectionBreakdown`, etc. | unit (backend) | `deno test` for `validation.ts` | ✅ (existing `validation.ts` logic; Phase 4 has test fixtures) |

### Sampling Rate
- **Per task commit:** `npm run lint` + `npm run build` (frontend); `deno test supabase/functions/grade-linkedin/` (backend edit)
- **Per wave merge:** `.\scripts\run-edge-tests.ps1` + full `npm run build`
- **Phase gate:** Full suite green + manual smoke (upload PDF, verify v3.0 render, verify entitlement helper text for a known Pro user with/without prior scan in cycle)

### Wave 0 Gaps
- [ ] `supabase/functions/grade-linkedin/free-scan.test.ts` — integration test covering: zero cycle rows → no usage insert; one cycle row → usage insert. Uses DB seed fixture.
- [ ] Manual smoke checklist document for LIG-01 / LIG-08 / LIG-09 / LIG-11 / LIG-13 (since no frontend test harness exists).

*(If Phase 4 already added grade-linkedin tests, reuse that fixture framework.)*

## Project Constraints (from CLAUDE.md)

- **Do not commit anything inside `.planning/`** — research doc lives here but is never staged
- **Do not modify `.gitignore`**
- **Use semantic design tokens** (Tailwind CSS vars like `bg-primary`, `text-foreground`, `border-border`) — not hardcoded hex. Current LinkedInGrader.tsx violates this in spots (`text-[#F59E0B]` at line 805, `hsl(142, 71%, 45%)` at line 717). Plan SHOULD preserve minimal-change principle and only fix semantic-token violations in newly written blocks, not refactor existing hero.
- **Small reversible changes preferred** over broad rewrites. The D-01 "hard break" of AnalysisResult is structural by necessity but file surface area should stay contained — no splitting into multiple files unless the planner judges it strictly cleaner.
- **Preserve existing TypeScript/React patterns** — interface at top of file is current convention, keep it.
- **Keep user-facing error messages specific and operationally useful** — entitlement error fallback should not show "Unknown error"; use "Couldn't check free-scan status — this will use 1 AI credit" or similar.
- **Use `rg` for searching, `apply_patch` for focused edits** — file is 1007 lines, scoped edits only.
- **GSD workflow enforcement:** implementation work happens inside a GSD command. Research phase is complete; planner will spawn the next step.
- **Prompt sanitizer coverage:** SEC-07 is a Phase 9 requirement but note `grade-linkedin/index.ts` already imports and calls `sanitizeUserContent` (line 121) [VERIFIED]. No regression risk from this phase.

## Sources

### Primary (HIGH confidence — read directly)
- `supabase/functions/grade-linkedin/validation.ts` [VERIFIED — full read, 187 lines]
- `supabase/functions/grade-linkedin/index.ts` [VERIFIED — full read, 324 lines]
- `supabase/functions/_shared/usage-checker.ts` [VERIFIED — full read, 82 lines]
- `src/pages/LinkedInGrader.tsx` [VERIFIED — full read, 1055 lines across two reads]
- `src/components/AnalysisComparisonModal.tsx` [VERIFIED — full read, 511 lines]
- `src/hooks/useTierAccess.ts` [VERIFIED — full read, 159 lines]
- `src/contexts/AiCreditsContext.tsx` [VERIFIED — full read, 112 lines]
- `src/lib/fetchWithTimeout.ts` [VERIFIED — full read, 131 lines]
- `supabase/migrations/20260411000002_atomic_check_and_record_usage.sql` [VERIFIED]
- `supabase/migrations/20251222220418_*.sql` [VERIFIED via grep — `get_billing_period_start` definition]
- `supabase/migrations/20251223172718_*.sql` [VERIFIED via grep — `can_perform_ai_action` returns `{allowed, current_usage, limit, tier, reset_date, billing_start, is_lifetime_limit}`]
- `supabase/migrations/20251223075804_*.sql` [VERIFIED via grep — adds `user_id` to `linkedin_grades`]
- `supabase/migrations/20260410235959_linkedin_grades_drop_unique_identifier.sql` [VERIFIED via grep — indexes on `(user_id, created_at DESC)`]
- `supabase/migrations/20251129_create_all_tables.sql` [VERIFIED — base `linkedin_grades` table (no user_id initially; added in 20251223075804)]
- `src/pages/Results.tsx` [VERIFIED via grep — line 773 AnalysisComparisonModal caller with resume shape]
- `.planning/phases/05-linkedin-grader-frontend/05-CONTEXT.md` [VERIFIED]
- `.planning/phases/04-linkedin-grader-backend/04-CONTEXT.md` [VERIFIED]
- `.planning/REQUIREMENTS.md` [VERIFIED]
- `.planning/ROADMAP.md` [VERIFIED]
- `./CLAUDE.md` [VERIFIED]
- `package.json` [VERIFIED]

### Secondary
- None — all claims sourced from direct file reads.

### Tertiary
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps already present, package.json read directly
- Architecture (rename/render blocks): HIGH — file read end-to-end, legacy field locations verified by line number
- Comparison modal rewire: HIGH — both callers identified, prop shape dumped
- Entitlement query: MEDIUM-HIGH — RPC function definition verified, PostgREST exposure is the only uncertainty (mitigated by graceful degrade)
- profileInsights shape: MEDIUM — only length validated by schema; item shape is a Phase 4 prompt convention that the planner must verify in `prompts.ts` (flagged as Assumption A1)
- Free-scan backend edit: HIGH — existing RPC helpers confirmed, atomic pattern understood

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days — schema is stable post-Phase-4 merge)
