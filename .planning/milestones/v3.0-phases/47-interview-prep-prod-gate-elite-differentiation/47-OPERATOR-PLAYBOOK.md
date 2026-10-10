# Phase 47 Operator Playbook — Deploy + Smoke + Rollback

**Phase:** 47-interview-prep-prod-gate-elite-differentiation
**Audience:** Operator deploying Phase 47 to production (the only person who can complete this — Claude cannot configure Vercel project env vars).
**Companion doc:** `47-VERIFICATION.md` (inline-evidence checklist for every SC).

---

## Section 1 — Why this playbook exists

Phase 47 ships a feature flag (`VITE_FEATURE_INTERVIEW_PREP`) that lives in **Vercel project settings**, not in the repo. The code merge alone does nothing: the helper `isInterviewPrepEnabled()` reads `import.meta.env.VITE_FEATURE_INTERVIEW_PREP === 'true'` at build time, and Vite inlines whatever value Vercel's deploy-time environment provides per scope.

If the env var is **not** configured per Vercel environment scope before the production deploy ships:

- The fail-closed default in the helper returns `false` **everywhere** (D-08).
- Production hides Interview Prep correctly (✓ intended).
- **Staging and Preview also hide Interview Prep** (✗ violates D-03 — "no new visual artifact on staging").

This playbook walks the operator through configuring both scopes, deploying, smoke-testing each environment, and rolling back if something breaks. The expected total operator time is **15-25 minutes** including smoke tests.

---

## Section 2 — Vercel env-var configuration (one-time, pre-deploy)

Perform these steps **before** triggering any Phase 47 production deploy.

1. Open the Vercel project's **Settings → Environment Variables** page for this repo.
2. Click **Add New**. Configure the first row:
   - **Name:** `VITE_FEATURE_INTERVIEW_PREP`
   - **Value:** `false`
   - **Environments:** check **Production** only. Uncheck **Preview** and **Development**.
   - Click **Save**.
3. Click **Add New** again. Configure the second row (same env var name, different scope + value):
   - **Name:** `VITE_FEATURE_INTERVIEW_PREP`
   - **Value:** `true`
   - **Environments:** check **Preview** AND **Development**. Uncheck **Production**.
   - Click **Save**.
4. Verify the Environment Variables list shows the name `VITE_FEATURE_INTERVIEW_PREP` appearing **twice**: one row scoped to Production with value `false`, one row scoped to Preview + Development with value `true`.
5. **Capture evidence:** screenshot the saved env var rows. Attach the screenshot to `47-VERIFICATION.md` under SC #6 (look for the "Vercel env-var row screenshot attached" checkbox in both the Production and Preview blocks).

**Important — do NOT add a Vercel "branch-specific override".** Per D-09, the helper does not consult `import.meta.env.MODE`. The scope split (Production vs Preview+Development) is the only mechanism; branch overrides would create silent drift on push to a non-default branch.

If you have the Vercel CLI authenticated locally, you can additionally verify from the repo root:

```bash
vercel env ls
```

You should see two rows for `VITE_FEATURE_INTERVIEW_PREP` with the scopes described above.

---

## Section 3 — Deploy and activation

After Section 2 is complete:

1. Confirm Phase 47 plans 47-00 through 47-05 are merged to `main` (this is already the case in the executing branch; see `git log --oneline | grep '47-'` for the per-task commits).
2. Trigger the Vercel **Production** redeploy:
   - Push the merge commit to `main` (auto-deploy will fire), **or**
   - In the Vercel dashboard → Deployments → click "Redeploy" on the latest production deployment.
3. Trigger the Vercel **Preview** redeploy:
   - Push to `preview` or `staging` (whichever branch Phase 47 used), **or**
   - Manually trigger a preview build in the Vercel dashboard.
4. Wait for the build status on both environments to reach **Ready** (typically 2-4 minutes per deploy). Watch the Vercel build logs for any new errors — none are expected, since Wave 1+2 tests pass locally on the final commit.
5. Proceed to Section 4 once both deploys are live.

---

## Section 4 — Per-environment smoke checklists

Run **both** checklists below. Production should look gated; Preview/staging should look normal.

### 4A — Production smoke (flag should be OFF)

Open the production URL while logged in as a real user account (Free / Pro / Elite tier doesn't matter for these checks, but ideally test at least one of each).

- [ ] Visit production `/interview-prep`. Result: full-page Coming Soon card with h1 "Interview Prep is coming soon", neutral 2-sentence body, and "Back to dashboard" button. Clicking the button returns to `/dashboard`. **Not** a 404 / not a redirect.
- [ ] Production top Navbar — Interview Prep entry is visible but disabled. Hover on the desktop Navbar entry shows a tooltip reading "Coming Soon" (or close variant). Clicking does nothing.
- [ ] Production mobile Navbar drawer (resize browser narrow or use device emulation) — Interview Prep entry shows an inline "Coming Soon" badge next to the label. Tap does nothing.
- [ ] Production AppSidebar (left-rail) — Interview Prep entry visible, opacity-reduced, click does nothing.
- [ ] Production AppSidebar collapsed state (collapse the sidebar) — hover on the Interview Prep icon shows a tooltip reading "Interview Prep · Coming Soon".
- [ ] Production ExploreFeatures popover (bottom-right Explore button on the dashboard) — Interview Prep tile visible, disabled (`opacity-50 cursor-not-allowed`), with a "Coming Soon" badge.
- [ ] Production `/pricing` page — Free tier card shows the "Interview Prep + Recruiting Lens locked" bullet with a "Coming Soon" badge. Elite tier card shows the "Premium support + Interview Prep Quiz" bullet with a "Coming Soon" badge. (PricingTable view, if reachable, shows 3 IP bullets badged.)
- [ ] Production `/history` page — Interview Prep rows are **not** in the list. Other features (Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens) render normally.
- [ ] DevTools Network tab on `/history` — no XHR/fetch request to `interview_quizzes` (the candidate-table query is `enabled`-gated off when the flag is off).
- [ ] Light mode AND dark mode — Coming Soon page, ComingSoonBadge, and disabled nav entries are legible in both. No literal palette colors (the helper uses semantic design tokens — text-foreground, text-muted-foreground, bg-background, bg-muted, border-border).

### 4B — Preview/staging smoke (flag should be ON)

Open the preview/staging URL (Vercel preview deployment URL for the `preview` or `staging` branch).

- [ ] Visit preview `/interview-prep` while logged in. Result: real Interview Prep page renders exactly as it did before Phase 47 (full feature flow, no Coming Soon, no overlay).
- [ ] Preview top Navbar / mobile drawer — Interview Prep entry is normally clickable. No Coming Soon tooltip, no badge.
- [ ] Preview AppSidebar (both expanded and collapsed) — Interview Prep entry is normally clickable. Collapsed-state tooltip says just "Interview Prep" (no "· Coming Soon" suffix).
- [ ] Preview ExploreFeatures popover — Interview Prep tile is enabled, no badge, click navigates to `/interview-prep`.
- [ ] Preview `/pricing` — no ComingSoonBadge appears next to any Interview Prep bullet on any tier.
- [ ] Preview `/history` — Interview Prep rows render with normal styling. Clicking an Interview Prep row deep-links to `/interview-prep?id=...` correctly.
- [ ] **D-03 visual diff:** eyeball compare or screenshot-diff the preview deploy against a pre-Phase-47 reference. Result should be **byte-identical** for every Interview Prep surface. No new visual artifact, no new banner, no new tooltip, no new badge anywhere.

If both checklists pass, return to `47-VERIFICATION.md` SC #6 and tick the corresponding boxes. Phase 47 is now fully shipped.

---

## Section 5 — Rollback procedures

### 5A — Re-enable Interview Prep on production (the intended forward path per D-15)

When the future Interview Prep milestone is ready to ship (after Phase 47.1 ships the new Elite-vs-Pro differentiator):

1. In Vercel → Settings → Environment Variables, edit the **Production-scope** `VITE_FEATURE_INTERVIEW_PREP` row.
2. Change the value from `false` to `true`.
3. Click Save, then trigger a Production redeploy (push to `main` or use the dashboard "Redeploy" button).
4. Wait for build → Ready. Smoke-test by visiting production `/interview-prep` — should render the real page, identical to staging.
5. **No backend redeploy required.** Edge functions `supabase/functions/interview-prep-*` stayed deployed throughout (D-13).

### 5B — Disable Interview Prep on staging (if a regression surfaces only on preview)

1. Edit the **Preview + Development scope** row, change value from `true` to `false`.
2. Redeploy preview.
3. Both production and staging now show Coming Soon. Re-enable staging by reverting the value.

### 5C — Emergency rollback (Phase 47 ships broken)

If the gate ships broken — e.g. the Coming Soon page crashes, or the flag-on path is also broken — the fastest path back to known-good is:

1. In the Vercel dashboard → Deployments → find the last pre-Phase-47 production deploy.
2. Click the three-dot menu → **Promote to Production**.
3. Production is now serving the pre-Phase-47 bundle (Interview Prep visible everywhere, as before).
4. Investigate the failure offline. Phase 47 is **additive** (no deletions): every Wave 1+2 commit can be reverted with `git revert` without affecting unrelated surfaces.

The full revert command for Phase 47 (if a code-side rollback is preferred):

```bash
# Reverts in reverse order — newest first, atomic per task
git revert b58fc0a 28114dd 5b350e4 \
  c0027bc 0c06289 7905b94 9d28f2d \
  75b9e9f daa0922 c03018c aa6e6e5 6ce7da3 39e1ab7 \
  ef40893 bbc9a0e \
  103c470 e830c94 \
  ab92177 a99e78f
```

(Use the commit hashes from `git log --oneline | grep '47-'` to confirm before running.) Documentation commits (`docs(47-XX): ...`) can be left in place — they don't affect runtime.

---

## Section 6 — Cross-references

- `47-CONTEXT.md` — Phase 47 decisions D-01..D-18 (source of truth for scope and trade-offs).
- `47-VERIFICATION.md` — Inline-evidence SC checklist. Tick SC #6 boxes after running Section 4 smoke.
- `47-00-SUMMARY.md` through `47-05-SUMMARY.md` — Plan-level evidence (file:line, commits, tests).
- `.planning/ROADMAP.md` Phase 47 entry (lines 438-484) — original SC text (revised per D-01..D-18).
- `.planning/ROADMAP.md` line 518 — Backlog "Future Interview Prep milestone" entry; re-enable trigger conditions documented there.
- `.planning/STATE.md` lines 60, 66, 74-83, 91 — Phase 41 supersession + Phase 47 status + re-enable mechanism recorded in Accumulated Context.
- `.planning/REQUIREMENTS.md` — IPC-PROD-* and GSD-DEFER-* requirements introduced by Phase 47.

---

## Operator sign-off

Once Section 4 smoke checklists are both green:

- [ ] Production smoke (Section 4A) all boxes ticked.
- [ ] Preview/staging smoke (Section 4B) all boxes ticked.
- [ ] Vercel env-var row screenshots attached to `47-VERIFICATION.md` SC #6.
- [ ] No emergency rollback (Section 5C) required.

Resume signal: type **`vercel-configured`** in the orchestrator prompt to advance Phase 47 to complete.

If smoke fails or env-var setup couldn't be completed, type **`abort`**. Phase 47 plans stay merged but production deploy is paused until re-attempted.

---

*Phase: 47-interview-prep-prod-gate-elite-differentiation*
*Playbook authored: 2026-05-11 (Plan 47-06)*
