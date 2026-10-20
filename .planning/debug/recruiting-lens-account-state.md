---
slug: recruiting-lens-account-state
status: awaiting_human_verify
trigger: "Recruiting Lens is leaking stale analysis state across accounts. After Account A completes an analysis and signs out, a newly created and upgraded Account B sometimes sees Account A's completed result instead of the empty input form. Recruiting Lens state, cached results, and persisted client data must be scoped to the authenticated user and cleared or reloaded on sign-out, sign-in, and account changes."
created: 2026-08-01
updated: 2026-08-01
---

# Debug: Recruiting Lens cross-account stale state leak

## Symptoms

- **Expected:** Recruiting Lens state, cached results, and persisted client data are scoped to the authenticated user. A fresh account with no Recruiting Lens history always sees the empty input fields.
- **Actual:** After Account A completes an analysis and signs out, Account B can sometimes see Account A's completed result the first time it opens Recruiting Lens.
- **Errors:** No visible error was reported.
- **Timeline:** Unknown; reported as intermittent in the current checkout.
- **Repro:** Run a Recruiting Lens analysis on Account A; sign out; create Account B and upgrade it through the admin panel; open Recruiting Lens on Account B for the first time; Account A's completed result sometimes renders instead of the empty input form.

## Current Focus

- status: investigating
- hypothesis: RecruitingLens restores Account A's result for Account B because it persists sensitive output under one global sessionStorage key and hydrates that key before the authenticated-user init effect; direct authenticated account switches also preserve the mounted page's local state because the page is not keyed by user id.
- test: reproduce the original Account A sign-out to fresh Account B workflow in a real browser session, including first open of Recruiting Lens after B's upgrade.
- expecting: Account B renders no Account A result or inputs; only B-scoped history can hydrate, while Account A same-session navigation recovery still works before sign-out.
- next_action: await human verification of the real two-account workflow.
- reasoning_checkpoint:
    hypothesis: "The fixed `recruiting-lens-result` sessionStorage key crosses account boundaries because it contains no owner identity and is read synchronously on every RecruitingLens mount; a direct A-to-B auth event can additionally retain all mounted local state."
    confirming_evidence:
      - "Production source reads and writes exactly one fixed sessionStorage key, and no auth listener clears it."
      - "ProtectedRoute unmounts on SIGNED_OUT, then Account B's fresh mount reads the fixed key before the user-scoped database effect."
      - "The focused account-boundary storage test is red because no user-scoped storage seam exists."
    falsification_test: "If Account B can read only a B-specific key, the full page remounts on user-id change, and a reproduction test can still retrieve Account A's result while B is active, this hypothesis is wrong."
    fix_rationale: "Binding both persistence and the React subtree lifecycle to authenticated user id removes the data channel itself, while auth-boundary cleanup eliminates legacy and residual entries; explicit history predicates add defense in depth."
    blind_spots: "A live two-account browser workflow and deployed Supabase policy state cannot be observed locally; local tests cover the deterministic client transition and migrations confirm intended RLS."
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-08-01T00:00:00-07:00
  checked: workspace status before investigation edits
  found: Existing unrelated changes are limited to .planning/ROADMAP.md, .planning/STATE.md, and an untracked Phase 04.2 directory; the debug file is also untracked.
  implication: Source and test edits for this bug can be isolated without overwriting the user's planning work.

- timestamp: 2026-08-01T00:01:00-07:00
  checked: debug knowledge base
  found: .planning/debug/knowledge-base.md does not exist.
  implication: There is no prior resolved-session hypothesis to prefer.

- timestamp: 2026-08-01T00:02:00-07:00
  checked: Recruiting Lens state/storage references and recovery coverage
  found: RecruitingLens initializes result synchronously from the fixed sessionStorage key `recruiting-lens-result` and writes successful analyses to that same key; existing recovery tests explicitly require this unscoped persistence across navigation.
  implication: A completed Account A result is immediately renderable by a newly mounted Account B page unless the key is cleared or scoped elsewhere.

- timestamp: 2026-08-01T00:03:00-07:00
  checked: React Query client and AuthCacheSync auth-transition teardown
  found: AuthCacheSync clears the complete React Query cache on SIGNED_OUT and on user-id changes, with tests covering Account A to Account B. RecruitingLens result state does not use React Query, so that teardown cannot remove its sessionStorage entry.
  implication: React Query is eliminated as the observed leak source; the browser-session result cache is outside its protection.

- timestamp: 2026-08-01T00:04:00-07:00
  checked: ProtectedRoute and Recruiting Lens component lifecycle across auth transitions
  found: ProtectedRoute renders no children when the cached auth user id becomes null, so RecruitingLens unmounts on sign-out and remounts for Account B. Its useState initializer reads sessionStorage before the user-scoped init effect runs.
  implication: The reported intermittent sequence has a deterministic render path: Account B's remount restores Account A's result before Account B's database state is loaded.

- timestamp: 2026-08-01T00:05:00-07:00
  checked: PriorAnalysisSelector, PriorLinkedInSelector, localStorage, URL, and history hydration
  found: Both prior selectors fetch after auth.getUser and filter user-owned tables by user id; localStorage is used only for the non-sensitive tutorial-dismissed flag. RecruitingLens deep-link hydration queries analysis_results by id and analysis_type without an explicit user_id predicate.
  implication: Selector state is user-scoped and localStorage is not a result source. Deep-link isolation must be verified against RLS and should receive defense-in-depth user scoping if touched.

- timestamp: 2026-08-01T00:06:00-07:00
  checked: analysis_results migrations and SELECT RLS policy
  found: analysis_results has RLS enabled and preserves a SELECT policy `auth.uid() = user_id`; later migrations remove only client INSERT access.
  implication: RLS prevents cross-account deep-link reads at the database boundary, but RecruitingLens should still add an explicit user_id predicate for defense in depth and clearer client scoping.

- timestamp: 2026-08-01T00:07:00-07:00
  checked: repository-wide fixed Recruiting Lens result-key references
  found: Only RecruitingLens.tsx reads/writes/removes the fixed key and one recovery source-guard test requires it; no auth listener clears it.
  implication: The leak is isolated to a single persistence contract and can be replaced without migrating other runtime consumers.

- timestamp: 2026-08-01T00:08:00-07:00
  checked: focused account-boundary storage regression before production changes
  found: Vitest is RED at module resolution because the required account-scoped Recruiting Lens storage seam does not exist; current production accesses sessionStorage directly.
  implication: The regression contract cannot be satisfied by the current implementation and is ready to drive the minimal fix.

- timestamp: 2026-08-01T00:09:00-07:00
  checked: account-scoped storage regression plus adjacent Recruiting Lens recovery and AuthCacheSync suites after the fix
  found: 3 focused files passed, 12 tests total. Account B reads null while Account A data exists; legacy data is removed; auth sign-out/account-switch clears result storage; same-user recovery wiring remains asserted.
  implication: The deterministic client leak is closed without removing same-account navigation recovery.

- timestamp: 2026-08-01T00:10:00-07:00
  checked: TypeScript, focused ESLint, exact source diff, and full frontend Vitest suite
  found: TypeScript and focused ESLint passed. Full Vitest passed 1,181 tests and failed only the VER-02 anti-drift registry because the S-21 recovery test title was renamed while its assertions were strengthened.
  implication: The implementation has no observed runtime/test regression; one metadata-style exact-name contract needs the original title restored.

- timestamp: 2026-08-01T00:11:00-07:00
  checked: corrected Recruiting Lens recovery, VER-02 matrix, storage regression, and AuthCacheSync integration suites
  found: 4 files passed, 19 tests total after restoring the registry-required S-21 title.
  implication: The only broad-suite failure is resolved and both account-boundary behavior and coverage metadata are green.

- timestamp: 2026-08-01T00:12:00-07:00
  checked: production build, final focused ESLint, and final workspace scope
  found: Vite production build passed and focused ESLint passed. Source changes are limited to Recruiting Lens account storage/wiring and AuthCacheSync plus their tests; unrelated planning changes remain untouched.
  implication: The fix compiles for production and preserves the user's dirty worktree boundaries.

- timestamp: 2026-08-01T00:13:00-07:00
  checked: final complete frontend Vitest suite after all corrections
  found: 151 test files passed, 1,182 tests passed, zero failures.
  implication: The account-boundary fix and adjacent app-root auth behavior pass the complete frontend regression gate.

## Eliminated

## Resolution

- root_cause: RecruitingLens persisted completed private results under a single unscoped `recruiting-lens-result` sessionStorage key and restored it synchronously on every mount before current-user data loaded; the page subtree was also not keyed by authenticated user id for direct account switches.
- fix: Added user-id-scoped Recruiting Lens session storage, discarded the legacy global key, cleared feature result storage on sign-out/account switch, keyed the entire Recruiting Lens page subtree by authenticated user id, and added an explicit user_id filter to deep-link history reads.
- verification: RED regression confirmed before implementation; final focused account/recovery/auth/matrix suites passed 19/19; `npm run type-check` passed; focused ESLint passed; `npm run build` passed; final `npm test` passed 151 files and 1,182 tests. Live two-account browser confirmation remains required.
- files_changed: [src/lib/recruiting-lens-result-storage.ts, src/lib/__tests__/recruiting-lens-result-storage.test.ts, src/pages/RecruitingLens.tsx, src/pages/__tests__/RecruitingLens.recovery.test.tsx, src/components/AuthCacheSync.tsx, src/components/__tests__/AuthCacheSync.test.tsx]
