---
phase: 03-interview-prep-coach-frontend
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - src/pages/InterviewPrepCoach.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-11
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

`InterviewPrepCoach.tsx` is a well-structured single-page component following project conventions. The overall pattern — feature gate, loading spinner, form, results panel — is consistent with other feature pages in the repo. No security vulnerabilities or data-loss risks were found.

Three warnings require attention before shipping: an unhandled clipboard promise rejection that fires a false success toast, a missing guard on `q.tips` / `q.redFlags` empty arrays that leaves orphaned section headers, and a missing whole-response field validation that could cause downstream rendering errors if the AI returns partial data. Three info-level items (unused import, dead constant, and ambiguous reset behavior) are lower priority.

---

## Warnings

### WR-01: Unhandled promise rejection in `copyStarOutline`

**File:** `src/pages/InterviewPrepCoach.tsx:146`
**Issue:** `navigator.clipboard.writeText(text)` returns a Promise that is neither awaited nor has a `.catch()` handler. If clipboard access is denied (non-HTTPS context, browser permission rejected, or document not focused), the rejection is silently swallowed **and** the success toast still fires immediately after on line 147 — giving the user false feedback that the copy succeeded.
**Fix:**
```typescript
const copyStarOutline = async (q: InterviewQuestion) => {
  const text = [
    `Situation: ${q.starOutline.situation}`,
    `Task: ${q.starOutline.task}`,
    `Action: ${q.starOutline.action}`,
    `Result: ${q.starOutline.result}`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast.success('STAR outline copied!');
  } catch {
    toast.error('Could not copy to clipboard. Please copy manually.');
  }
};
```

---

### WR-02: Empty `tips` / `redFlags` arrays render orphaned section headers

**File:** `src/pages/InterviewPrepCoach.tsx:454-481`
**Issue:** `q.tips` and `q.redFlags` are typed as `string[]` with no minimum length enforced. If the AI returns either as an empty array, the section heading ("Tips" / "Red Flags to Avoid") is rendered above an empty `<ul>`, producing a confusing blank area. The response validation at line 117 only checks `data.questions` is an array — individual question fields are unchecked.
**Fix:** Conditionally render each subsection, and/or extend response validation to require non-empty arrays:
```tsx
{q.tips.length > 0 && (
  <div>
    <h4 className="...">Tips</h4>
    <ul className="space-y-1.5">
      {q.tips.map((tip, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
          <span>{tip}</span>
        </li>
      ))}
    </ul>
  </div>
)}
{q.redFlags.length > 0 && (
  <div>
    <h4 className="...">Red Flags to Avoid</h4>
    <ul className="space-y-1.5">
      {q.redFlags.map((rf, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <span>{rf}</span>
        </li>
      ))}
    </ul>
  </div>
)}
```

---

### WR-03: `q.id` used as map key and toggle key without uniqueness validation

**File:** `src/pages/InterviewPrepCoach.tsx:353-357, 81`
**Issue:** `q.id` drives both the React `key` prop on question cards (line 357) and the `expandedCards` Set (line 81). The response validation (line 117) only checks `Array.isArray(data.questions)` — it does not verify that each element has a unique numeric `id`. If the backend returns duplicate IDs (or missing IDs as `undefined`), React reconciliation silently collapses cards and toggle state corrupts: toggling one card may expand/collapse another.
**Fix:** Add a lightweight uniqueness check after the array validation:
```typescript
if (!data?.questions || !Array.isArray(data.questions)) {
  toast.error('Unexpected response from server. Please try again.');
  return;
}
const ids = data.questions.map((q) => q.id);
const uniqueIds = new Set(ids);
if (uniqueIds.size !== ids.length || ids.some((id) => typeof id !== 'number')) {
  toast.error('Unexpected response format. Please try again.');
  return;
}
```

---

## Info

### IN-01: Unused import — `Badge`

**File:** `src/pages/InterviewPrepCoach.tsx:5`
**Issue:** `Badge` is imported from `@/components/ui/badge` but never referenced in the component. Custom inline `<span>` elements are used instead for the category and difficulty chips.
**Fix:** Remove the unused import:
```typescript
// Remove: import { Badge } from '@/components/ui/badge';
```

---

### IN-02: Dead constant — `CATEGORY_COUNTS` values are unused

**File:** `src/pages/InterviewPrepCoach.tsx:64-70`
**Issue:** `CATEGORY_COUNTS` is declared with numeric per-category limits (e.g., `behavioral: 3`), but its values are never read. Only `Object.keys(CATEGORY_COUNTS)` is used (line 332) to drive filter-button ordering. The numeric values serve no purpose in the current implementation and could mislead future maintainers into thinking category limits are enforced client-side.
**Fix:** Replace with a simple ordered array for filter button rendering, or add a comment explaining the constant is reserved for future use:
```typescript
// Ordered list of categories for the filter bar; counts are informational only.
const CATEGORY_ORDER: InterviewQuestion['category'][] = [
  'behavioral',
  'technical',
  'situational',
  'culture_fit',
  'leadership',
];
```
Then update line 332: `{CATEGORY_ORDER.map((cat) => {`

---

### IN-03: Input fields not cleared on "New Analysis" reset

**File:** `src/pages/InterviewPrepCoach.tsx:308-315`
**Issue:** The "New Analysis" button resets `results`, `activeCategory`, and `expandedCards` but does not clear `jobDescription`, `jobTitle`, or `company`. This may be intentional (preserve context for refinement) but is ambiguous — the form reappears pre-filled, which could surprise users expecting a blank slate. If retention is intended, consider a tooltip or label like "Edit and re-run." If not, add the missing resets.
**Fix (if blank-slate is desired):**
```typescript
onClick={() => {
  setResults(null);
  setActiveCategory('all');
  setExpandedCards(new Set());
  setJobDescription('');
  setJobTitle('');
  setCompany('');
}}
```

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
