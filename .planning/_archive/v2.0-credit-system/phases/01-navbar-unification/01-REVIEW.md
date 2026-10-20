---
phase: 01-navbar-unification
reviewed: 2026-04-11T12:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/components/Navbar.tsx
  - src/components/HomepageRouter.tsx
  - src/pages/HowItWorks.tsx
  - src/pages/Pricing.tsx
  - src/pages/Privacy.tsx
  - src/pages/Refund.tsx
  - src/pages/Questions.tsx
  - src/pages/Terms.tsx
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-11T12:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the Navbar component, HomepageRouter, and six public/static pages. The Navbar is well-structured with proper auth handling, mobile/desktop responsive patterns, and accessible ARIA attributes. The main concerns are: a stale closure bug in the HomepageRouter timeout callback, significant code duplication of the dropdown menu between mobile and desktop in the Navbar, a potential FAQ accordion content truncation issue, and the Questions page using a custom inline footer instead of the shared Footer component (inconsistency).

## Warnings

### WR-01: Stale closure over `loading` in HomepageRouter timeout

**File:** `src/components/HomepageRouter.tsx:56-73`
**Issue:** The `useEffect` has `[loading]` in its dependency array, and the timeout callback on line 57 checks `if (!mounted || !loading) return`. However, `loading` is captured at the time the effect runs. When the effect first runs with `loading=true`, the timeout captures `loading=true`. If `applySession` sets `loading=false` before the 8-second timeout fires, the `loading` variable inside the closure still holds `true` (stale). This means the timeout guard `!loading` never triggers, and the fallback `getUser()` call executes even after the session was already resolved -- making an unnecessary network request.
**Fix:** Use a ref to track whether session resolution has already occurred, rather than relying on the stale `loading` state in the closure:
```tsx
const resolvedRef = useRef(false);

// In applySession:
const applySession = (session: any) => {
  if (!mounted) return;
  resolvedRef.current = true;
  setUser(session?.user ?? null);
  setLoading(false);
};

// In the timeout:
const timeout = window.setTimeout(() => {
  if (!mounted || resolvedRef.current) return;
  // ...fallback logic
}, 8000);
```

### WR-02: `useEffect` dependency on `loading` causes re-registration of auth listener

**File:** `src/components/HomepageRouter.tsx:80`
**Issue:** The `useEffect` dependency array includes `loading`. When `loading` changes from `true` to `false`, the entire effect re-runs: it re-subscribes to `onAuthStateChange`, calls `getSession()` again, and sets another 8-second timeout. This is wasteful and can cause duplicate event handling. The auth listener setup should only happen once on mount.
**Fix:** Remove `loading` from the dependency array. Use a ref for the stale-closure issue (WR-01) instead of depending on state:
```tsx
}, []); // mount-only
```

### WR-03: FAQ accordion max-height may truncate longer answers

**File:** `src/pages/Questions.tsx:99-101`
**Issue:** The accordion expand uses `max-h-40` (10rem / 160px) as the open state. Some FAQ answers (e.g., the answer for "What will I actually get after I upload my resume?" on line 15-16) contain multiple sentences. On smaller screens or with larger font sizes, the content could exceed 160px and be clipped with no scroll or visual indicator of hidden content.
**Fix:** Use a larger max-height or dynamically measure content height. A simple fix:
```tsx
openIndex === i ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
```
Or use a ref-based approach to set the exact height for smooth animation without truncation risk.

### WR-04: Duplicated dropdown menu content between desktop and mobile in Navbar

**File:** `src/components/Navbar.tsx:446-512` and `src/components/Navbar.tsx:529-594`
**Issue:** The avatar dropdown menu (profile info, tier label, credits, Profile link, Billing link, Upgrade Plan, Sign out) is copy-pasted between the desktop block (lines 446-512) and the mobile block (lines 529-594). These are identical in structure and logic. If one is updated and the other is not, behavior will diverge. This is a maintenance risk.
**Fix:** Extract the dropdown content into a shared component or render function:
```tsx
const AvatarDropdownContent = () => (
  <DropdownMenuContent align="end" className="w-56 backdrop-blur-xl bg-background/80 border-border/50">
    {/* shared content */}
  </DropdownMenuContent>
);
```
Then use it in both the desktop and mobile `<DropdownMenu>` wrappers.

### WR-05: Questions page uses inline footer instead of shared Footer component

**File:** `src/pages/Questions.tsx:136-159`
**Issue:** All other pages (HowItWorks, Pricing, Privacy, Refund, Terms) use the shared `<Footer />` component, but Questions renders its own inline footer with hardcoded copyright year "2025" and a different link set. This creates an inconsistency: if the shared Footer is updated (e.g., new links, updated year), the Questions page will be out of sync.
**Fix:** Replace the inline footer with the shared component:
```tsx
import Footer from "@/components/Footer";
// ...
<Footer />
```

## Info

### IN-01: `user` state typed as `any` in Navbar and HomepageRouter

**File:** `src/components/Navbar.tsx:57`, `src/components/HomepageRouter.tsx:10`
**Issue:** Both components use `useState<any>(null)` for the user state. This bypasses TypeScript checking on all user property accesses (e.g., `user.id`, `user?.email`). The Supabase SDK exports a `User` type that should be used here.
**Fix:** Import and use the proper type:
```tsx
import type { User } from "@supabase/supabase-js";
const [user, setUser] = useState<User | null>(null);
```

### IN-02: Unused import in HowItWorks

**File:** `src/pages/HowItWorks.tsx:5`
**Issue:** `X` is imported from `lucide-react` but is only used inside the expanded detail panel close button. While it is technically used, the `ArrowRight` import on the same line is used in both the step connectors and the CTA buttons. No issue with `ArrowRight`, but confirming `X` is used. Actually, `X` is used on line 183, so this is fine. Disregard -- marking as info only for the unused `BarChart3` and `Rocket` imports which are used in the steps array. All imports are used.

Actually, reviewing again: all imports in HowItWorks are used. Withdrawing this finding.

### IN-03: Hardcoded copyright year "2025" in Questions inline footer

**File:** `src/pages/Questions.tsx:139`
**Issue:** The copyright year is hardcoded as "2025" which is already outdated (current date is 2026-04-11). This will be resolved if WR-05 is addressed (replacing with the shared Footer component).
**Fix:** Use the shared Footer component per WR-05, or if keeping inline, use dynamic year:
```tsx
<p className="text-xs text-muted-foreground">
  &copy; {new Date().getFullYear()} Strivo. All rights reserved.
</p>
```

### IN-04: Privacy and Refund pages missing Helmet for SEO

**File:** `src/pages/Privacy.tsx`, `src/pages/Refund.tsx`
**Issue:** The Privacy and Refund pages do not use `<Helmet>` for setting the page title and meta description, unlike HowItWorks, Pricing, Questions, and Terms which all set titles. This means these pages will show the default browser tab title rather than something like "Privacy Policy - Strivo AI".
**Fix:** Add Helmet to both pages:
```tsx
import { Helmet } from "react-helmet-async";
// Inside return:
<Helmet>
  <title>Privacy Policy - Strivo AI</title>
</Helmet>
```

### IN-05: Terms page also missing Helmet

**File:** `src/pages/Terms.tsx`
**Issue:** Same as IN-04 -- the Terms page does not use `<Helmet>` for the page title.
**Fix:** Add `<Helmet><title>Terms of Service - Strivo AI</title></Helmet>`.

---

_Reviewed: 2026-04-11T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
