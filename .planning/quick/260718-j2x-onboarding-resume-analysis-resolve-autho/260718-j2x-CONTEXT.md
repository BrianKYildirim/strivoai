# Quick Task 260718-j2x: Onboarding resume analysis — authoritative current tier at finish + restore analysis spinner - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Task Boundary

Fix the onboarding resume analysis flow so the generated analysis always reflects the
user's **authoritative current subscription tier** at the moment onboarding is completed,
and restore the animated loading spinner for the Finish → analysis operation (free + Elite).

Bug report symptom: a user who upgrades to Elite mid-onboarding, then clicks Finish,
receives a **free-tier** analysis (one ready-to-paste improvement, one detailed criteria
analysis) with no locked sections / paywalls (because the UI knows they're Elite) — i.e.
free-depth content with Elite chrome.

</domain>

<decisions>
## Implementation Decisions

### Root cause (reframed during discussion — CRITICAL)
- The backend `analyze-resume` edge function ALREADY resolves tier authoritatively
  server-side from `profiles.subscription_tier` via `requireAuth`/`requireInternalOrUserAuth`
  and **explicitly discards `rawBody.tier`** (see `supabase/functions/analyze-resume/index.ts`
  lines 1095-1097: "Never trust rawBody.tier"; `resolvedTier` drives free-single-call vs
  elite-parallel path selection).
- Therefore the hardcoded `tier: 'free'` sent by `src/pages/Onboarding.tsx` (lines 362, 389)
  is **NOT the causal bug** — it is ignored for the tier decision.
- The TRUE root cause: `profiles.subscription_tier` is still `'free'` at the instant Finish
  runs, because the Stripe upgrade completed during onboarding has not yet propagated to
  `profiles` (webhook race / no refresh-and-wait on checkout return). `resolvedTier` reads
  the stale row and correctly (per its contract) produces a free analysis.

### Fix locus
- **Entitlement freshness.** Keep backend authority as-is (do not add client-tier plumbing).
- On checkout return during onboarding, refresh + WAIT for entitlement before Finish/analysis
  can run.
- Add a pre-invoke freshness guard so analysis is never dispatched while entitlement is
  known-stale.
- Remove the misleading hardcoded client `tier: 'free'` from `Onboarding.tsx` (cleanup — it
  should not imply an authority it doesn't have; pass the resolved/known tier or omit).

### Freshness mechanism (checkout return)
- **Refresh + bounded poll.** On return from Stripe checkout, trigger a subscription/entitlement
  refresh (invalidate + refetch the entitlement source, refresh auth session as needed) and
  POLL `profiles.subscription_tier` (via the existing entitlement read path) until it reflects
  the purchased tier.
- Bounded timeout with a clear fallback message if propagation lags beyond the window.
- Finish is DISABLED until entitlement is resolved (no analysis dispatch on stale state).

### Spinner behavior
- **Hold spinner until navigation.** Keep the Finish button in a disabled + animated-spinner
  state continuously from click through: entitlement resolution → resume upload → extraction →
  analyze-resume invoke → persistence → navigation. Never flip back to an idle "Finish" button
  mid-flight.
- Prevent duplicate submissions while in-flight (guard re-entrancy of `handleFinishSetup`).
- Preserve accessible loading state (disabled control + spinner). Preserve existing terminal-
  failure error handling (the honest failure toasts already wired in both lifecycle + dormant
  paths).
- Results page retains ownership of the post-navigation progress UI (dormant path still
  navigates immediately; the button simply does not clear its loading state before navigate).

### Claude's Discretion
- Exact refresh/poll timeout + interval values (pick sane bounded defaults consistent with
  webhook latency; document them).
- Whether entitlement freshness is enforced via an existing hook/context (e.g. `useTierAccess`,
  `AiCreditsContext`, subscription query) vs. a small dedicated helper — prefer reusing the
  existing entitlement read path over a new abstraction (per CLAUDE.md).
- Test layer split (vitest component vs. deno edge) per the codebase's layered testing model.

</decisions>

<specifics>
## Specific Ideas

- Central files: `src/pages/Onboarding.tsx` (`handleFinishSetup`, lines ~190-421; Finish button
  ~767-780), `supabase/functions/analyze-resume/index.ts` (authoritative tier at ~1095-1097),
  `supabase/functions/_shared/auth.ts` (`resolveTierForUserId`, `normalizeActiveTier`,
  `profiles.subscription_tier`), `src/hooks/useTierAccess.ts`, `src/hooks/usePaywallGuard.ts`.
- Existing lifecycle flag: `isAnalysisLifecycleEnabled()` gates the migrated vs dormant path;
  dormant is 100% of traffic today. Fix must work in the DORMANT path (current production
  behavior) as well as the lifecycle path.
- Do NOT trust: account-creation-time subscription state, un-refreshed client state, onboarding
  state initialized pre-upgrade, cached/stale profile/session/entitlement, or UI-level
  hide/unlock after a free analysis was already generated.

</specifics>

<canonical_refs>
## Canonical References

- `supabase/functions/analyze-resume/index.ts` (D-01/D-09 server-side tier authority contract).
- `supabase/functions/_shared/auth.ts` (tier resolution from `profiles.subscription_tier`).
- `TESTING-STRATEGY.md` (layered testing model; `verify:baseline` gate).
- CLAUDE.md reliability priorities (Resume Analysis is business-critical; avoid unnecessary
  abstractions; keep staging/prod settings explicit).

</canonical_refs>
