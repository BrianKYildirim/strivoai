/**
 * queue-path-tier-downgrade (2026-07-18) — regression guard: the LIVE (internal/worker)
 * resume-analysis path must resolve the user's REAL tier from the DB.
 *
 * THE BUG THIS LOCKS OUT
 * ---------------------------------------------------------------------------
 * 100% of resume-analysis queue traffic (onboarding Finish, plus the streaming->queue
 * 529-overload fallback) goes submit-resume-analysis-job -> process-resume-analysis-job
 * -> analyze-resume under `x-internal-job-secret`. requireInternalOrUserAuth returns null
 * for that path, so analyze-resume's old `resolvedTier = userContext?.tier ?? 'free'`
 * resolved EVERY paid user to 'free' — a free-depth analysis while their real tier was
 * charged in Merits (elite charge + free analysis). This mirrors the analyze-career RC-1.
 *
 * THE FIX: on the `userContext === null` (internal) branch, resolve the tier via
 * `resolveTierForUserId(userId)` — service-client DB read of profiles.subscription_tier,
 * ADMIN_EMAIL elevation, normalizeActiveTier, fails CLOSED to 'free'. Server-trusted,
 * never client-supplied.
 *
 * D-14 IS NON-NEGOTIABLE: assertion (c) fail-closes on any reintroduction of a
 * `body.tier` / `rawBody.tier` read. A client-supplied tier on a money path is a
 * privilege-escalation primitive.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveTierForUserId } from '../../_shared/auth.ts';

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

const resumeSource = await Deno.readTextFile(winSafePath('../index.ts'));
const submitSource = await Deno.readTextFile(winSafePath('../../submit-resume-analysis-job/index.ts'));

// ── (a) analyze-resume calls the resolver on the userContext === null (internal) branch ──

Deno.test('queue-path-tier-downgrade: analyze-resume resolves the tier from the DB on the internal/worker branch', () => {
  assert(
    resumeSource.includes('resolveTierForUserId('),
    'analyze-resume must call resolveTierForUserId — otherwise every queued run is analyzed as free',
  );
  assert(
    /import \{[^}]*resolveTierForUserId[^}]*\} from ['"]\.\.\/_shared\/auth\.ts['"]/s.test(resumeSource),
    'resolveTierForUserId must be imported from the shared auth chokepoint',
  );
  // The DB resolution must live in the ELSE of the userContext branch — never reachable
  // for a JWT caller (whose tier is already server-read by requireUserAuth).
  const jwtBranch = resumeSource.indexOf('if (userContext) {');
  const dbCall = resumeSource.indexOf('resolveTierForUserId(userId)');
  assert(jwtBranch > -1, 'the JWT path must be an explicit branch on userContext');
  assert(dbCall > jwtBranch, 'the DB resolution must live in the NO-userContext (internal/worker) branch');
});

// ── (b) D-14 fail-closed: analyze-resume NEVER reads a client-supplied tier ────

Deno.test('queue-path-tier-downgrade: analyze-resume NEVER reads a client-supplied tier (D-14 fail-closed)', () => {
  // Strip line comments so the documentation of the bug (which names rawBody.tier) does
  // not trip the guard — we forbid the CODE from reading it, not the prose from mentioning it.
  const code = resumeSource.replace(/\/\/[^\n]*/g, '');
  assert(
    !/=\s*(rawBody|requestBody|body)\.tier/.test(code),
    'no assignment may source the tier from the request body — a client-supplied tier is a privilege-escalation primitive (D-14)',
  );
});

// ── (c) the ONBOARDING lifecycle closure is TIER-AWARE (not hardcoded free) ──────
//
// Separate root cause from the internal-worker branch: the onboarding lifecycle `generate`
// closure ran under the user's JWT (userContext non-null, resolvedTier = elite) but HARDCODED
// executeFreeAnalysis + tier:'free' + isElite:false, so ctx.tier charged Elite Merits while the
// analysis was Free depth. The fix routes onboarding through the shared per-tier assembly.

Deno.test('queue-path-tier-downgrade: onboarding lifecycle closure runs the TIER-AWARE assembly, not a hardcoded free path', () => {
  assert(
    resumeSource.includes('async function assembleResumeResult'),
    'a shared tier-aware assembly helper must exist (Free -> single call; Elite -> parallel+merge)',
  );
  // Locate the onboarding lifecycle block and assert its generate closure delegates to the
  // tier-aware assembly instead of hardcoding the free single-call path.
  const onboardingIdx = resumeSource.indexOf("feature: 'onboarding'");
  assert(onboardingIdx > -1, 'the onboarding lifecycle block must exist');
  // Window from the onboarding block to the end of its save closure (bounded slice).
  const onboardingBlock = resumeSource.slice(onboardingIdx, onboardingIdx + 4000);
  assert(
    onboardingBlock.includes('assembleResumeResult('),
    'the onboarding generate closure must call assembleResumeResult (tier-aware), not executeFreeAnalysis directly',
  );
  assert(
    !/isElite:\s*false/.test(onboardingBlock) && !/tier:\s*'free'/.test(onboardingBlock),
    'the onboarding closure must NOT hardcode a free-tier promptParams — Elite users get Elite depth',
  );
  assert(
    !/credits:\s*MERIT_COST\.free/.test(onboardingBlock),
    'the onboarding save must record credits for the RESOLVED tier (MERIT_COST[resolvedTier]), not MERIT_COST.free',
  );
});

// ── (d) submit-resume-analysis-job stores the AUTHORITATIVE tier in the job payload ──

Deno.test('queue-path-tier-downgrade: submit-resume-analysis-job persists authenticatedUserCtx.tier, never body.tier', () => {
  assert(
    submitSource.includes('tier: authenticatedUserCtx.tier'),
    'the job payload must carry the server-read tier so the stored record is not misleading',
  );
  const code = submitSource.replace(/\/\/[^\n]*/g, '');
  assert(
    !/body\.tier/.test(code),
    'submit must not read body.tier at all — the tier is server-authoritative',
  );
  assert(
    !/^\s*tier,\s*$/m.test(code),
    'the payload must not persist a bare `tier` shorthand sourced from the client body',
  );
});
