# Phase 22: LinkedIn Grader UI Overhaul + Cross-Feature Memory/History — Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 11 (9 modify, 0 create, 2 reference-only)
**Analogs found:** 11 / 11 (every modified file has an existing analog or self-reference)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/pages/LinkedInGrader.tsx` (modify) | page/component | request-response + render-time transform | self — lines 836-872 (Section Breakdown locked skeleton), lines 629-653 (Scan-New header-bar), lines 948-1026 (real topFix card) | exact (self-reference) |
| `src/pages/Results.tsx` (modify — D-10 header-bar + `?id=` already works) | page/component | request-response | `src/pages/LinkedInGrader.tsx:629-653` (header-bar donor) | exact |
| `src/pages/CareerCompass.tsx` (modify — D-10, D-14 memory badge, D-16 fallback, `?id=` hydration) | page/component | request-response | `src/pages/LinkedInGrader.tsx:629-653` (header-bar), `src/pages/Results.tsx:206-238` (URL param hydration) | exact |
| `src/pages/RecruitingLens.tsx` (modify — D-10, `?id=` hydration, container pt-24→pt-6 align) | page/component | request-response | `src/pages/LinkedInGrader.tsx:629-653` (header-bar), `src/pages/Results.tsx:206-238` (URL param hydration) | exact |
| `src/pages/InterviewPrep.tsx` (modify — `?id=` hydration for `interview_quizzes`) | page/component | request-response | `src/pages/Results.tsx:206-238` (URL param hydration) | role-match |
| `src/pages/AnalysisHistory.tsx` (modify — generalize proximity matcher, add per-feature routes) | page/component | CRUD read | self — lines 182-214 (resume proximity matcher + route resolver) | exact (self-reference) |
| `supabase/functions/analyze-career/index.ts` (modify — main-path prior-analyses short-circuit + usage_tracking INSERT) | edge function | request-response + DB reads | self — lines 511-557 (existing `Promise.all` prior fetch in free single-call branch) | exact (self-reference) |
| `supabase/functions/grade-linkedin/index.ts` (modify — merit-path usage_tracking INSERT + free-scan-bypass INSERT) | edge function | request-response | `supabase/functions/_shared/usage-checker.ts:19-61` (`checkAndRecordUsage` RPC pattern) + legacy path `grade-linkedin/index.ts:395-410` | exact |
| `supabase/functions/recruiting-lens/index.ts` (modify — merit-path usage_tracking INSERT) | edge function | request-response | `supabase/functions/recruiting-lens/index.ts:279` (legacy-path `checkAndRecordUsage`) | exact (self-reference) |
| `supabase/functions/interview-prep-analyze/index.ts` (modify — merit-path usage_tracking INSERT) | edge function | request-response | `supabase/functions/interview-prep-coach/index.ts:151` (legacy-path `checkAndRecordUsage`) | role-match |
| `src/components/BlurredLockCard.tsx` (reference-only) | component | — | — | consumed, not modified |

## Pattern Assignments

### `src/pages/LinkedInGrader.tsx` (D-01..D-09) — page/component, request-response

**Analog (self-reference):** `src/pages/LinkedInGrader.tsx`

**Hardcoded placeholder constant pattern (D-03):**

The spec mandates a top-of-file constant array. No existing exact analog, but the approach mirrors the inline literal arrays already living at `LinkedInGrader.tsx:864-866` (the three-paragraph teaser strings for locked Section Breakdown cards). New constant placement: immediately above the `LinkedInGraderPage` component declaration at line 70.

```tsx
// Planner-authored constant; place at top of file above the component (after imports at line 24).
// Pattern inspired by: src/pages/LinkedInGrader.tsx:864-866 inline teaser strings.
const LOCKED_FIXES_PLACEHOLDERS = [
  { title: 'Experience Improvement',    pointsGain: '+5 pts', currentText: 'Your current section copy will appear here after upgrade.', suggestedFix: 'A recruiter-grade rewrite tailored to your profile will appear here.', whyItWorks: 'Unlock to see the full rationale and impact this edit has on recruiters.' },
  { title: 'Skills Improvement',        pointsGain: '+4 pts', currentText: '…', suggestedFix: '…', whyItWorks: '…' },
  { title: 'About Section Refinement',  pointsGain: '+3 pts', currentText: '…', suggestedFix: '…', whyItWorks: '…' },
  { title: 'Headline Refinement #2',    pointsGain: '+3 pts', currentText: '…', suggestedFix: '…', whyItWorks: '…' },
] as const;
```

**Locked-skeleton card pattern (D-01, D-02, D-04) — donor markup from real topFix card** (`LinkedInGrader.tsx:976-1019`):

```tsx
// Real topFix card (reference — DO NOT modify; locked skeleton must mirror this DOM exactly per D-24)
// Source: src/pages/LinkedInGrader.tsx:976-1019
<div className="p-5">
  <div className="flex items-start justify-between mb-3">
    <h4 className="font-semibold text-base">{fix.title}</h4>
    <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs shrink-0 ml-2">
      {fix.pointsGain}
    </Badge>
  </div>
  <div className="grid md:grid-cols-2 gap-3 mb-3">
    <div className="p-3 bg-muted/50 rounded-lg border border-border">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Current</p>
      <p className="text-sm text-muted-foreground italic leading-relaxed">"{fix.currentText}"</p>
    </div>
    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1.5">Suggested fix:</p>
      <p className="text-sm font-medium leading-relaxed">{fix.suggestedFix}</p>
    </div>
  </div>
  <p className="text-xs text-muted-foreground">
    <span className="font-semibold text-foreground">Why this works:</span> {fix.whyItWorks}
  </p>
</div>
```

**Locked skeleton wrap pattern (D-02, D-04) — from existing Section Breakdown locked cards** (`LinkedInGrader.tsx:836-872`):

```tsx
// Source: src/pages/LinkedInGrader.tsx:836-872
// Generalized for topFix #1-#4 slots: wrap the donor markup above inside BlurredLockCard.
if (isFreeUser) {
  return (
    <motion.div
      key={`locked-fix-${i}`}
      initial={{ opacity: 0, x: -15 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 + i * 0.1 }}
    >
      <BlurredLockCard tier="pro">
        <Card className="overflow-hidden border border-border">
          {/* ...donor markup from lines 976-1019 with LOCKED_FIXES_PLACEHOLDERS[i]... */}
        </Card>
      </BlurredLockCard>
    </motion.div>
  );
}
```

Animation cadence (`initial={{ opacity: 0, x: -15 }}, animate={{ opacity: 1, x: 0 }}, transition={{ delay: 0.4 + i * 0.1 }}`) matches the real topFix at `LinkedInGrader.tsx:957-961` so locked cards animate as siblings of the unlocked #0.

**Container class fix pattern (D-06)** — single-line class change:

```tsx
// Source: src/pages/LinkedInGrader.tsx:386 (current)
<div className="container mx-auto px-4 pt-24 pb-12 max-w-5xl">
//                                 ^^^^^ change to pt-6

// Canonical target: src/pages/Results.tsx:706
<div className="container mx-auto px-4 pt-6 pb-12 max-w-5xl">
```

**Render-time reorder pattern (D-08, D-09) — non-mutating sort:**

```tsx
// Source: D-08/D-09 spec; call site src/pages/LinkedInGrader.tsx:829
// CRITICAL: DO NOT mutate result.sectionBreakdown — AnalysisComparisonModal at line 665 consumes the raw array.
const orderedSections = useMemo(() => {
  if (!result?.sectionBreakdown) return [];
  const pc = result.sectionBreakdown.find(s => s.name?.toLowerCase().includes('profile completeness'));
  if (!pc) return result.sectionBreakdown;
  const rest = result.sectionBreakdown.filter(s => s !== pc);
  return [pc, ...rest];
}, [result?.sectionBreakdown]);
// Then map over orderedSections instead of result.sectionBreakdown.
```

**`?id=` hydration pattern (D-22) — page has no existing URL param support.** See shared "URL param hydration" pattern below.

---

### `src/pages/Results.tsx` (D-10 header-bar; D-22 already implemented) — page/component

**Analog:** `src/pages/LinkedInGrader.tsx:629-653` (donor header-bar pattern)

**D-22 status:** Already works via `useParams` on `/results/:id` route (`Results.tsx:3, 206`). No change needed.

**D-10 header-bar port pattern — donor excerpt:**

```tsx
// Source: src/pages/LinkedInGrader.tsx:629-653
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <h2 className="text-2xl font-bold">Your LinkedIn Analysis</h2>
    {isFromCache && result.created_at && (
      <Badge variant="secondary" className="text-xs">
        {new Date(result.created_at).toLocaleDateString()}
      </Badge>
    )}
  </div>
  <Button
    variant="outline"
    onClick={() => { /* reset state — per-page reset logic */ }}
    className="gap-2"
  >
    <RefreshCw className="h-4 w-4" />
    Scan New Profile
  </Button>
</div>
```

Per-page replacement strings (from UI-SPEC Copywriting Contract):
- Title: `Resume Screening Report` (already present at `Results.tsx:726`)
- Button: `Analyze New Resume`
- Reset handler clears resume state + navigates to `/upload`

---

### `src/pages/CareerCompass.tsx` (D-10, D-14 memory badge, D-16 fallback, D-22) — page/component

**Analog:** `src/pages/LinkedInGrader.tsx:629-653` (header-bar), `src/pages/Results.tsx:206-238` (URL param hydration), `src/pages/CareerCompass.tsx:575-595` (existing missingPrior pattern for D-16)

**D-14 memory-badge markup (new):**

```tsx
// Source: UI-SPEC §Interaction Contract #4; placement mirrors isFromCache badge at
// src/pages/LinkedInGrader.tsx:633-637.
import { format } from 'date-fns';
import { Linkedin } from 'lucide-react';

{analysis.reusedLinkedinGrade && analysis.linkedinGradeDate && (
  <Badge variant="secondary" className="text-xs gap-1">
    <Linkedin className="h-3 w-3" />
    Used your LinkedIn analysis from {format(new Date(analysis.linkedinGradeDate), 'MMM d, yyyy')}
  </Badge>
)}
```

**D-16 fallback pattern — existing missingPrior Card (reuse styling):**

```tsx
// Source: src/pages/CareerCompass.tsx:575-608
// Existing Card with "Run these first to unlock Career Compass" pattern;
// planner adjusts copy to the resume-present-but-linkedin-absent case per UI-SPEC
// Copywriting Contract row "Missing-prior fallback".
<Card className="p-5 mb-6 border-2" style={{ borderColor: "#FF6B6B" }}>
  <div className="flex items-start gap-3">
    <Sparkles className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: "#FF6B6B" }} />
    <div className="flex-1">
      <h3 className="text-base font-semibold mb-1">Add your LinkedIn analysis?</h3>
      <p className="text-sm text-muted-foreground mb-3">
        We have your resume analysis but no LinkedIn analysis yet — add LinkedIn now or continue without?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigate('/linkedin-grader')} style={{ backgroundColor: "#FF6B6B" }}>
          <Linkedin className="mr-2 h-4 w-4" />
          Add LinkedIn analysis
        </Button>
        <Button size="sm" variant="outline" onClick={/* proceed with resume-only */}>
          Continue without
        </Button>
      </div>
    </div>
  </div>
</Card>
```

**D-22 `?id=` hydration — see shared pattern below.**

---

### `src/pages/RecruitingLens.tsx` (D-10, D-22) — page/component

**Analog:** `src/pages/LinkedInGrader.tsx:629-653` (header-bar), `src/pages/Results.tsx` for URL param pattern

**Container alignment note:** Current `RecruitingLens.tsx:465` uses `container mx-auto px-4 pt-24 pb-16` — no `max-w-5xl`. Planner decides whether to align to canonical `pt-6 pb-12 max-w-5xl` during D-10 (recommended per RESEARCH.md Container Audit row).

**Pro-tier hydration caveat (see Pitfall 6 in research):** Pro-tier Recruiting Lens does NOT persist to `analysis_results` (gated on `resolvedTier === 'elite'` at `recruiting-lens/index.ts:254-266`). When `?id=` present but no row found, fall back to input form state (Pattern 4 + Pitfall 6 in RESEARCH.md).

---

### `src/pages/InterviewPrep.tsx` (D-22) — page/component

**Analog:** `src/pages/Results.tsx:206-238` for URL param hydration; target table is `interview_quizzes` (RLS: `auth.uid() = user_id`, migration `20260418000000_interview_prep_tables.sql:78-80`).

**D-22 `?id=` hydration — see shared pattern below.**

---

### `src/pages/AnalysisHistory.tsx` (D-19, D-20, D-21) — page/component, CRUD read

**Analog (self-reference):** `src/pages/AnalysisHistory.tsx:182-214` (existing `useQuery` for `resumes` + `findResumeForEntry` proximity matcher + `getEntryRoute` dispatcher)

**Existing proximity matcher pattern (generalize for D-20):**

```ts
// Source: src/pages/AnalysisHistory.tsx:195-205
const findResumeForEntry = (entry: UsageTrackingRow): string | null => {
  if (entry.action_type !== 'resume_analysis' || resumes.length === 0) return null;
  const entryTime = new Date(entry.created_at).getTime();
  let best: { id: string; diff: number } | null = null;
  for (const r of resumes) {
    const diff = Math.abs(new Date(r.created_at).getTime() - entryTime);
    if (diff < 5 * 60 * 1000 && (!best || diff < best.diff)) {
      best = { id: r.id, diff };
    }
  }
  return best?.id ?? null;
};
```

**Generalized pattern (D-20) — from RESEARCH.md §Pattern 4:**

```ts
function findIdForEntry(
  entry: UsageTrackingRow,
  candidates: { id: string; created_at: string }[]
): string | null {
  if (candidates.length === 0) return null;
  const entryTime = new Date(entry.created_at).getTime();
  let best: { id: string; diff: number } | null = null;
  for (const c of candidates) {
    const diff = Math.abs(new Date(c.created_at).getTime() - entryTime);
    if (diff < 5 * 60 * 1000 && (!best || diff < best.diff)) {
      best = { id: c.id, diff };
    }
  }
  return best?.id ?? null;
}
```

**Add 4 new `useQuery` hooks mirroring `userResumes` at lines 182-193:**

| Action type | Table | Filter |
|-------------|-------|--------|
| `linkedin_grading` | `linkedin_grades` | `user_id = userId` |
| `career_compass` | `analysis_results` | `user_id = userId AND analysis_type = 'career_compass'` |
| `recruiting_lens` | `analysis_results` | `user_id = userId AND analysis_type = 'recruiting_lens'` (Elite only) |
| `interview_prep` | `interview_quizzes` | `user_id = userId` |

Reference `useQuery` shape at `AnalysisHistory.tsx:182-193`:

```ts
const { data: resumes = [] } = useQuery({
  queryKey: ['userResumes', userId],
  queryFn: async () => {
    const { data } = await supabase
      .from('resumes')
      .select('id, created_at')
      .eq('user_id', userId!)
      .order('created_at', { ascending: false });
    return (data || []) as { id: string; created_at: string }[];
  },
  enabled: !!userId,
});
```

**Existing route dispatcher (extend for D-21):**

```ts
// Source: src/pages/AnalysisHistory.tsx:208-214 (current — only resume_analysis resolves to a specific ID)
const getEntryRoute = (entry: UsageTrackingRow): string | null => {
  if (entry.action_type === 'resume_analysis') {
    const resumeId = findResumeForEntry(entry);
    return resumeId ? `/results/${resumeId}` : null;
  }
  return toolRoutes[entry.action_type] ?? null;
};
```

Extend per D-21 to append `?id=<matched_id>` for each of the 4 other action types when the proximity matcher returns a hit, else fall back to the existing `toolRoutes[...]` (no id) route.

---

### `supabase/functions/analyze-career/index.ts` (D-11, D-15, D-17) — edge function, request-response

**Analog (self-reference):** `supabase/functions/analyze-career/index.ts:524-557` (existing free single-call `Promise.all` prior-analyses fetch)

**Donor `Promise.all` prior-analyses fetch:**

```ts
// Source: supabase/functions/analyze-career/index.ts:524-541
const [{ data: resumeRow }, { data: linkedinRow }] = await Promise.all([
  supabase
    .from('resumes')
    .select('id, grading_data, created_at')
    .eq('user_id', userContext.userId)
    .not('grading_data', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
  supabase
    .from('linkedin_grades')
    .select('id, grading_data, overall_score, created_at')
    .eq('user_id', userContext.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
]);
```

**Short-circuit path donor (already built in free branch):** lines 597-641 build `buildFreePriorAnalysesPrompt` + call `invokeAnthropicText` with `getModel(resolvedTier, 'career')` + parse with `repairTruncatedJSON`. Lift this wholesale into the Pro/Elite path BEFORE line 709 (PDF-extraction block) when both `resumeRow.grading_data` and `linkedinRow.grading_data` are truthy.

**Response-build injection site (D-15):**

```ts
// Source: supabase/functions/analyze-career/index.ts:890-893
return new Response(
  JSON.stringify(analysisResult), // <-- inject reusedLinkedinGrade / linkedinGradeDate into analysisResult above this line
  { headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
);
```

Additive injection (works both reused and fallback branch):

```ts
analysisResult.reusedLinkedinGrade = reusedLinkedinGrade;
analysisResult.linkedinGradeDate = linkedinGradeDate; // ISO string or null
```

**Fallback handling (D-16) — relax input validation at lines 565-584 when partial prior exists.** See Pitfall 5 in research.

**Usage-tracking INSERT on merit path (D-18/D-19):** See shared pattern below.

---

### `supabase/functions/grade-linkedin/index.ts` (D-18/D-19) — edge function, request-response

**Analog:** `supabase/functions/_shared/usage-checker.ts:19-61` (`checkAndRecordUsage` RPC pattern); legacy-path call site at `grade-linkedin/index.ts:402` (action_type `'linkedin_grading'`).

**Two merit-path write gaps (per RESEARCH.md Question 1):**

1. **Paid-path `withMerits` callback** (`grade-linkedin/index.ts:321-329`) — no `usage_tracking` write.
2. **Free-scan-bypass path** (`grade-linkedin/index.ts:305-319`) — explicitly skips `checkAndRecordUsage` per LIG-11; Pitfall 3 recommends writing a zero-credit `usage_tracking` row anyway so History shows the first scan.

See shared "Merit-path usage_tracking INSERT" pattern below.

---

### `supabase/functions/recruiting-lens/index.ts` (D-18/D-19) — edge function, request-response

**Analog (self-reference):** `supabase/functions/recruiting-lens/index.ts:279` (legacy-path `checkAndRecordUsage(userId, 'recruiting_lens')`)

**Merit-path write gap:** `withMerits` callback at lines 210-272 completes the AI call + optional Elite persistence + response — never writes `usage_tracking`. Insert a `record_ai_usage` RPC call AFTER `mergeRecruitingLensResults` (line 250) and BEFORE the Elite-persistence block (line 254) so free/pro are covered too.

---

### `supabase/functions/interview-prep-analyze/index.ts` (D-18/D-19) — edge function, request-response

**Analog (role-match):** `supabase/functions/interview-prep-coach/index.ts:151` (`checkAndRecordUsage(userId, 'interview_prep')`)

**Gap:** `interview-prep-analyze` is merit-only (no legacy branch per header comment at lines 17-18). It has zero `usage_tracking` writes anywhere. Add a `record_ai_usage` RPC call inside the `withMerits` callback AFTER AI success and validation pass.

---

## Shared Patterns

### URL param hydration (D-22) — applies to LinkedInGrader / CareerCompass / RecruitingLens / InterviewPrep

**Source:** `src/pages/Results.tsx:3, 206-238` (reference for `useSearchParams` + conditional state hydration)

**Canonical import + hook usage:**

```tsx
// Source: src/pages/Results.tsx:3,208
import { useSearchParams } from 'react-router-dom';
// inside component:
const [searchParams] = useSearchParams();
const idFromUrl = searchParams.get('id');
```

**Per-page hydration effect (RLS auto-scopes to owner — do NOT add `.eq('user_id', userId)`):**

```tsx
// Shape for each page — swap table name and result-state setter per page.
// Source: adapts src/pages/Results.tsx:226-238 (which uses useParams) to useSearchParams.
useEffect(() => {
  if (!idFromUrl) return;
  // V5 security: validate UUID before DB call per RESEARCH.md §Security Domain
  if (!/^[0-9a-f-]{36}$/i.test(idFromUrl)) {
    toast.error('Analysis not found');
    return;
  }
  (async () => {
    const { data, error } = await supabase
      .from('<feature_table>') // linkedin_grades | analysis_results | interview_quizzes
      .select('*')
      .eq('id', idFromUrl)
      .single();
    if (error || !data) {
      toast.error('Analysis not found');
      return;
    }
    // set result/analysis state + hide input view
    setResult(data.grading_data ?? data); // shape varies per page
    setShowInput(false);
  })();
}, [idFromUrl]);
```

Per-page target tables (from RESEARCH.md §`?id=` Hydration Audit):

| Page | Table | ID source | Notes |
|------|-------|-----------|-------|
| `LinkedInGrader.tsx` | `linkedin_grades` | `?id=<linkedin_grade_id>` | RLS: `auth.uid() = user_id` |
| `CareerCompass.tsx` | `analysis_results` | `?id=<analysis_id>` | RLS: `auth.uid() = user_id`; filter `analysis_type='career_compass'` defensive |
| `RecruitingLens.tsx` | `analysis_results` | `?id=<run_id>` | Elite-only row; Pro tier has no row → graceful fallback to input form |
| `InterviewPrep.tsx` | `interview_quizzes` | `?id=<quiz_id>` | RLS: `auth.uid() = user_id`; answers via `interview_quiz_answers` joined by `quiz_id` |

### Merit-path `usage_tracking` INSERT (D-18/D-19) — applies to 4 edge functions

**Source:** `supabase/functions/_shared/usage-checker.ts:19-61` (atomic `check_and_record_ai_usage` RPC — too heavy for merit path since entitlement already enforced); use the lighter `record_ai_usage` RPC defined at `supabase/migrations/20251222220418_...:148-167`.

**Canonical insert shape (from RESEARCH.md §Code Examples):**

```ts
// Source: supabase/migrations/20251222220418_5be07a74-50f6-49cc-aba8-14e78cac73e8.sql:148-167
// Insert via record_ai_usage RPC (NOT the atomic check_and_record variant — entitlement already enforced by withMerits).
// Place inside withMerits callback AFTER AI success and validation, BEFORE returning the response.

import { getServiceClient } from '../_shared/supabase-client.ts';
import { createLogger } from '../_shared/logger.ts';
const log = createLogger('<function-name>');

await getServiceClient()
  .rpc('record_ai_usage', {
    p_user_id: userId,
    p_action_type: 'linkedin_grading', // or 'career_compass' | 'recruiting_lens' | 'interview_prep'
    p_credits: 1, // 0 for grade-linkedin free-scan-bypass carve-out (Pitfall 3)
  })
  .then(({ error }: { error: { message: string } | null }) => {
    if (error) log.error('usage-tracking-insert-failed', { error: String(error) });
  });
```

**Required per-function placements:**

| Function | File:lines (approx) | action_type | p_credits |
|----------|---------------------|-------------|-----------|
| `grade-linkedin` paid path | `grade-linkedin/index.ts` inside `withMerits` callback at 322-329 (after `runTieredAiCall`, before `storeAndNotify`) | `linkedin_grading` | 1 |
| `grade-linkedin` free-scan path | `grade-linkedin/index.ts:305-319` (after flag-flip at 312-317, before `storeAndNotify`) | `linkedin_grading` | 0 |
| `analyze-career` merit path (both sub-branches) | `analyze-career/index.ts` — free single-call path at ~697, main Pro/Elite path at ~888 (before `return new Response`) | `career_compass` | 1 |
| `recruiting-lens` merit path | `recruiting-lens/index.ts:250-268` (after merge, before response) | `recruiting_lens` | 1 |
| `interview-prep-analyze` merit path | `interview-prep-analyze/index.ts` inside `withMerits` callback (after validation pass, before response) | `interview_prep` | 1 |

### BlurredLockCard usage (D-01, D-04) — applies to 4 new locked-skeleton cards

**Source:** `src/components/BlurredLockCard.tsx` (full file, unmodified)

Component signature (from `BlurredLockCard.tsx:5-12`):

```tsx
interface BlurredLockCardProps {
  children: React.ReactNode;
  className?: string;
  ctaHref?: string;    // defaults to '/pricing' (D-04 behavior)
  ctaLabel?: string;   // defaults to 'Upgrade to unlock your full potential'
  tier?: 'pro' | 'elite'; // 'pro' renders "Pro plan required" sub-label
  minHeight?: string;
}
```

For Phase 22's 4 locked topFix cards, pass `tier="pro"` (no other props) — default `ctaHref='/pricing'` and default `ctaLabel` satisfy D-04.

### Framer Motion reveal cadence (DOM parity with real topFix — D-24)

**Source:** `src/pages/LinkedInGrader.tsx:957-961`

```tsx
initial={{ opacity: 0, x: -15 }}
animate={{ opacity: 1, x: 0 }}
transition={{ delay: 0.4 + i * 0.1 }}
```

All 4 locked skeletons must use this exact cadence with `i` = 1..4 so they stagger in alongside the unlocked topFix #0.

---

## No Analog Found

None. Every modified file has an exact or role-matching analog in the existing codebase.

## Metadata

**Analog search scope:**
- `src/pages/` — all 5 feature pages + AnalysisHistory
- `src/components/BlurredLockCard.tsx`, `src/components/AnalysisComparisonModal.tsx`
- `supabase/functions/analyze-career/`, `grade-linkedin/`, `recruiting-lens/`, `interview-prep-analyze/`, `interview-prep-coach/`
- `supabase/functions/_shared/` — usage-checker, merit-gateway, supabase-client
- `supabase/migrations/` — usage_tracking RPCs, RLS policies, action_type enum extensions

**Files scanned:** 14 source files, 6 migration files, 4 shared utilities

**Pattern extraction date:** 2026-04-19

**Planner guidance:**
- Every primitive this phase needs already exists. The work is wiring, not building.
- D-03 forbids a new shared placeholder file — constant stays inline in `LinkedInGrader.tsx`.
- D-12 forbids passing `priorLinkedinGrading` from the frontend — fetch stays server-side inside `analyze-career`.
- D-24 forbids any visual change to Pro/Elite DOM — all new conditional renders gate on `subscriptionTier === 'free'`.
- D-25 forbids migrations — work within existing `usage_tracking` + RPC surface; use `record_ai_usage` RPC (p_credits argument) for merit-path writes.
