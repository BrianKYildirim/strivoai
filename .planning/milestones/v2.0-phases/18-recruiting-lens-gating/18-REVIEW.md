---
phase: 18-recruiting-lens-gating
reviewed: 2026-04-17T12:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - supabase/functions/_shared/recruiting-lens-merger.test.ts
  - supabase/functions/_shared/recruiting-lens-merger.ts
  - supabase/functions/_shared/recruiting-lens-prompts.ts
  - supabase/functions/_shared/tier-config.ts
  - supabase/functions/recruiting-lens/index.ts
  - src/pages/RecruitingLens.tsx
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-04-17T12:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

The Recruiting Lens tier-gating implementation is well-structured overall. The server-side tier shaping in `recruiting-lens-merger.ts` is solid with good test coverage and defense-in-depth via the `PRO_ALLOWED_FIELDS` whitelist. The prompt-level restrictions in `recruiting-lens-prompts.ts` properly suppress Elite-only fields at generation time, and the frontend handles missing fields gracefully with `LockedSection` / `LockedListItem` components.

Three warnings were identified: body parsing occurs before authentication in the edge function handler, the abort signal from `useAnalysisGuard` is never forwarded to the network call, and warning-level merge messages are logged at `console.log` level instead of `console.warn`. Four informational items were noted around unused variables, missing dependency arrays, and dead code.

No security vulnerabilities or critical bugs were found. The Free-tier gate (403 on server, `ProFeatureGate` on client) is correctly enforced on both sides.

## Warnings

### WR-01: Body parsed before authentication

**File:** `supabase/functions/recruiting-lens/index.ts:164`
**Issue:** `req.json()` is called on line 164 before `requireAuth()` on line 183. This means unauthenticated requests incur unnecessary JSON parsing overhead. More importantly, if the request body is not valid JSON, `req.json()` throws and the outer catch block returns a generic `internal_error` 500 response instead of a 401. An attacker sending malformed bodies never sees the auth challenge.
**Fix:** Move the `requireAuth` call before `req.json()`:
```typescript
try {
  const startTime = Date.now();

  // 3. Auth -- validate JWT, get tier (BE-04)
  const userContext = await requireAuth(req, { type: 'user' });

  // 4. Tier gate -- reject Free tier with 403
  if (userContext!.tier === 'free') {
    return new Response(
      JSON.stringify({ error: 'pro_or_elite_required', message: 'Recruiting Lens requires a Pro or Elite subscription.' }),
      { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
    );
  }

  // 5. Parse + validate body
  const body = await req.json();
  // ... rest of handler
```

### WR-02: Abort signal not forwarded to network call

**File:** `src/pages/RecruitingLens.tsx:319`
**Issue:** The `_signal` parameter from `useAnalysisGuard` is received but never passed to `invokeWithTimeout`. When the component unmounts and `cancelAnalysis()` fires (line 303), the abort signal is set but the underlying network request continues running. The analysis result is silently discarded on the promise side, but the HTTP call and server-side AI processing still complete and consume credits/tokens.
**Fix:** Either pass the signal to `invokeWithTimeout` (if it supports it, or add support), or acknowledge the limitation with a comment. Currently `invokeWithTimeout` does not accept an `AbortSignal`, so the minimal fix is:
```typescript
// TODO: Pass signal to invokeWithTimeout once it supports AbortSignal.
// Currently, cancelAnalysis only prevents state updates on unmount,
// not the underlying network request.
const result = await startAnalysis(async (_signal) => {
```

### WR-03: Merge warnings logged at wrong level

**File:** `supabase/functions/_shared/recruiting-lens-merger.ts:354`
**Issue:** Warning messages (missing required fields, unexpected fields, JSON parse failures) are logged via `console.log()` instead of `console.warn()`. In Supabase Edge Function logs, this makes them harder to filter and reduces observability for merge issues in production. The project convention uses `console.error` for errors and the structured logger for leveled output.
**Fix:** Replace `console.log(w)` with `console.warn(w)`, or better yet, accept a logger parameter and use `log.warn()`:
```typescript
for (const w of allWarnings) {
  console.warn(w);
}
```

## Info

### IN-01: Unused catch variable in LinkedIn PDF handler

**File:** `src/pages/RecruitingLens.tsx:291`
**Issue:** The `err` variable in the catch block is captured but never used. The error details are lost, which makes debugging PDF extraction failures harder.
**Fix:** Either log the error or remove the variable:
```typescript
} catch (err) {
  console.error('[RecruitingLens] PDF extraction failed:', err);
  toast.error('Failed to extract text from PDF');
}
```

### IN-02: Missing dependencies in useEffect array

**File:** `src/pages/RecruitingLens.tsx:281`
**Issue:** The `useEffect` on line 219 uses `navigate` and `getEffectiveTier` from outer scope but the dependency array is empty (`[]`). Both are stable references (from `useNavigate` and `useAdminTierTest`), so this does not cause a runtime bug, but React's exhaustive-deps lint rule would flag it.
**Fix:** Add the stable references to the dependency array:
```typescript
}, [navigate, getEffectiveTier]);
```

### IN-03: scoreRationale type defined but never rendered

**File:** `src/pages/RecruitingLens.tsx:71-76`
**Issue:** The `RecruitingLensResult` interface includes `scoreRationale` (lines 71-76), which is an Elite-only field containing per-category strengths/weaknesses breakdown. However, there is no rendering code for this field in `RecruitingLensResultsView`. Elite users receive this data but never see it displayed.
**Fix:** Either add a UI section for `scoreRationale` in the results view (similar to the sub-scores grid), or remove the type field if it is intentionally not rendered in the current phase.

### IN-04: Redundant userContext truthiness check

**File:** `supabase/functions/recruiting-lens/index.ts:206`
**Issue:** The condition `if (MERIT_SYSTEM_ENABLED && userContext)` includes a truthiness check on `userContext`, but `requireAuth` with `type: 'user'` either throws a 401 Response or returns a `UserContext` object -- it never returns `null` for the `user` auth type. The `&& userContext` check is always true at this point.
**Fix:** Remove the redundant check:
```typescript
if (MERIT_SYSTEM_ENABLED) {
```

---

_Reviewed: 2026-04-17T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
