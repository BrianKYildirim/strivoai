/**
 * Centralized authentication module for Supabase Edge Functions.
 *
 * Provides `requireAuth` and `requireInternalOrUserAuth` helpers that all
 * edge functions should import instead of rolling their own auth logic.
 *
 * Design decisions:
 * - D-01: Single function, switches on auth type
 * - D-02: User auth returns UserContext (userId, email, tier from profiles)
 * - D-03: Internal secret comparison uses timingSafeEqual (not ===)
 * - D-05: All auth events are logged via structured logger
 * - D-13: Error response body is always { error: 'Unauthorized' } (no detail leakage)
 * - D-14: Never log secret values
 */
import { getServiceClient } from './supabase-client.ts';
import { createLogger } from './logger.ts';
import { normalizeActiveTier } from './tier-config.ts';
import { corsHeaders, type CorsType } from './cors.ts';
import { timingSafeEqual } from 'https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts';

const log = createLogger('_shared/auth');

// ── Admin elevation (260608-p5k follow-up) ─────────────────────────────────────
// The admin account's stored subscription_tier may be 'free', but the admin must
// receive full Elite treatment on EVERY feature end-to-end — matching the frontend
// AdminTierTestContext override that all other surfaces already honor. We elevate
// here at the single auth chokepoint so tier-gated free-strips, token budgets,
// models, and timeouts uniformly resolve to Elite. Email match is case-insensitive;
// the address is overridable via the ADMIN_EMAIL env var (defaults to the known
// admin so no deploy-time secret is required).
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') ?? 'strivolife@gmail.com').toLowerCase();

function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === ADMIN_EMAIL;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserContext {
  userId: string;
  email: string;
  tier: string;
}

export type AuthType = 'user' | 'internal' | 'webhook';

// ── Shared 401 response factory ──────────────────────────────────────────────

/**
 * Builds the shared 401 response. The body stays exactly { error: 'Unauthorized' }
 * (D-13, no detail leakage). For user auth it carries origin-aware CORS headers so
 * the browser can read the 401 and the SPA's auto-refresh-on-401 can fire; internal
 * (server-to-server) 401s pass type 'internal' and stay CORS-less ({}).
 */
function unauthorizedResponse(req: Request, type: CorsType = 'user'): Response {
  return new Response(
    JSON.stringify({ error: 'Unauthorized' }),
    { status: 401, headers: { ...corsHeaders({ type }, req), 'Content-Type': 'application/json' } },
  );
}

// ── requireAuth ──────────────────────────────────────────────────────────────

/**
 * Verifies the incoming request is authenticated for the given auth type.
 *
 * - `type: 'user'`     — validates Supabase JWT, returns UserContext
 * - `type: 'internal'` — validates x-internal-job-secret header via timingSafeEqual, returns null
 * - `type: 'webhook'`  — no auth check; signature verification is handled by the
 *   specific webhook handler itself (e.g. Stripe HMAC in stripe-webhook-handler)
 *
 * Throws a Response(401) on auth failure so callers can propagate with `return await requireAuth(...)`.
 *
 * ── Why these overloads exist (quick task 260713-hrd) ────────────────────────
 * The three auth types have completely different real contracts, and a single
 * `Promise<UserContext | null>` signature destroyed that information in both directions:
 *
 *   type        implementation                real contract
 *   'user'      requireUserAuth              NEVER null — throws a Response on failure
 *   'internal'  requireInternalAuth          ALWAYS null on success — throws on failure
 *   'webhook'   returns null                 always null (handler verifies its own signature)
 *
 * 1. `'user'` callers had to dereference a value the compiler thought might be null even
 *    though it provably never is — 11 TS18047 errors, and the standing temptation to
 *    reach for `!`.
 * 2. `'internal'` callers got `UserContext | null` and so LOOKED like they might carry a
 *    user, when the value is always null. That is exactly the Career Compass incident:
 *    analyze-career's queued path (100% of its traffic is internal) resolved
 *    `tier = ctx?.tier ?? 'free'`, so Elite subscribers were analyzed as Free and had to
 *    be refunded. The `?.` silently swallowed it and nothing failed the build.
 *
 * Encoding the real contracts makes that bug class a COMPILE error: an 'internal' caller
 * now gets `null` and cannot read `.tier` off it. Internal-path tier must come from
 * `resolveTierForUserId` (below), which reads it from the DB under the service client.
 *
 * The third overload preserves today's behavior for any caller passing a widened
 * `AuthType`. Verified at the time of writing: there are no dynamic call sites
 * (`requireAuth(req, { type: someVar })` finds nothing), so literal 'user' matches the
 * first overload and ordering is safe.
 *
 * This is a SIGNATURE-ONLY change — the body below and the three implementations are
 * byte-for-byte unchanged.
 */
export async function requireAuth(req: Request, opts: { type: 'user' }): Promise<UserContext>;
export async function requireAuth(req: Request, opts: { type: 'internal' | 'webhook' }): Promise<null>;
export async function requireAuth(req: Request, opts: { type: AuthType }): Promise<UserContext | null>;
export async function requireAuth(
  req: Request,
  opts: { type: AuthType },
): Promise<UserContext | null> {
  switch (opts.type) {
    case 'user':
      return await requireUserAuth(req);
    case 'internal':
      return await requireInternalAuth(req);
    case 'webhook':
      // Signature verification (e.g. Stripe HMAC) is handled by the specific
      // webhook handler itself. This path intentionally skips auth.
      return null;
    default:
      throw new Error(`Unknown auth type: ${opts.type}`);
  }
}

// ── User auth ────────────────────────────────────────────────────────────────

async function requireUserAuth(req: Request): Promise<UserContext> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    log.warn('auth-failure', { reason: 'missing-bearer', type: 'user' });
    throw unauthorizedResponse(req);
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    log.warn('auth-failure', { reason: 'invalid-token', type: 'user' });
    throw unauthorizedResponse(req);
  }

  // Fetch the subscription tier from the profiles table
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    log.warn('auth-failure', { reason: 'profile-not-found', type: 'user', userId: user.id });
    throw unauthorizedResponse(req);
  }

  // Admin email always resolves to Elite (see ADMIN_EMAIL note above), regardless
  // of the stored subscription_tier; everyone else uses their normalized DB tier.
  const isAdmin = isAdminEmail(user.email);
  const tier = isAdmin ? 'elite' : normalizeActiveTier(profile.subscription_tier);

  const ctx: UserContext = {
    userId: user.id,
    email: user.email ?? '',
    tier,
  };

  if (isAdmin) {
    log.info('admin-tier-elevation', { type: 'user', userId: ctx.userId });
  }
  log.info('auth-success', { type: 'user', userId: ctx.userId });
  return ctx;
}

// ── Internal auth ────────────────────────────────────────────────────────────

async function requireInternalAuth(req: Request): Promise<null> {
  const providedSecret = req.headers.get('x-internal-job-secret');
  if (!providedSecret) {
    log.warn('auth-failure', { reason: 'missing-secret', type: 'internal' });
    throw unauthorizedResponse(req, 'internal');
  }

  const expectedSecret = Deno.env.get('INTERNAL_JOB_SECRET');
  if (!expectedSecret) {
    log.error('auth-failure', { reason: 'secret-not-configured', type: 'internal' });
    throw unauthorizedResponse(req, 'internal');
  }

  // Encode both values and guard against length mismatch (timingSafeEqual requires equal-length buffers)
  const enc = new TextEncoder();
  const providedBytes = enc.encode(providedSecret);
  const expectedBytes = enc.encode(expectedSecret);

  // Length check must be performed before timingSafeEqual to avoid buffer errors,
  // but we still call timingSafeEqual on same-length prefix to preserve constant time.
  let isValid = false;
  if (providedBytes.length === expectedBytes.length) {
    isValid = timingSafeEqual(providedBytes, expectedBytes);
  }

  if (!isValid) {
    log.warn('auth-failure', { reason: 'secret-mismatch', type: 'internal' });
    throw unauthorizedResponse(req, 'internal');
  }

  log.info('auth-success', { type: 'internal' });
  return null;
}

// ── Internal-path tier resolution (quick task 260713-hrd · RC-1) ─────────────

/**
 * Server-trusted tier resolution for the INTERNAL / worker path.
 *
 * WHY THIS EXISTS: `requireInternalAuth` is typed `Promise<null>` and always returns
 * null — there is no JWT on a worker request, so there is no `UserContext` and no tier.
 * Career Compass runs 100% of its traffic through that path
 * (submit-career-analysis-job -> process-career-analysis-job -> analyze-career under
 * `x-internal-job-secret`), so `resolvedTier` collapsed to 'free' for EVERY user and
 * Elite subscribers were analyzed, budgeted and shaped as Free.
 *
 * This resolves the tier from the DATABASE using the payload `userId` under the service
 * client. It NEVER accepts a client-supplied tier (D-14) — the caller passes an id, not
 * a tier. Mirrors `requireUserAuth`'s tier logic exactly (one chokepoint, no drift):
 * ADMIN_EMAIL -> 'elite', otherwise `normalizeActiveTier(profiles.subscription_tier)`.
 *
 * Fails CLOSED to 'free' on a missing row or a DB error — a lookup failure must never
 * hand out the expensive tier.
 *
 * ADDITIVE: every existing export in this module is untouched. Features that do not
 * call this see zero behavior change.
 *
 * @param userId - The user id from the trusted job payload (NOT a tier).
 * @param deps.client - Injectable for tests only; defaults to the real service client.
 */
export async function resolveTierForUserId(
  userId: string,
  deps?: { client?: ReturnType<typeof getServiceClient> },
): Promise<'free' | 'elite'> {
  const supabase = deps?.client ?? getServiceClient();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('email, subscription_tier')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile) {
    log.warn('internal-tier-resolution-failed', { userId });
    return 'free';
  }

  const row = profile as { email?: string | null; subscription_tier?: string | null };
  if (isAdminEmail(row.email)) {
    log.info('admin-tier-elevation', { type: 'internal', userId });
    return 'elite';
  }

  return normalizeActiveTier(row.subscription_tier);
}

// ── requireInternalOrUserAuth ────────────────────────────────────────────────

/**
 * For endpoints that can be called by both the internal job worker and by users.
 *
 * If the request carries `x-internal-job-secret`, internal auth is verified and null is returned.
 * If not, user JWT auth is verified and a UserContext is returned.
 *
 * If `bodyUserId` is provided and a user is authenticated, the userId must match.
 */
export async function requireInternalOrUserAuth(
  req: Request,
  bodyUserId?: string,
): Promise<UserContext | null> {
  const hasInternalSecret = req.headers.has('x-internal-job-secret');
  if (hasInternalSecret) {
    return await requireInternalAuth(req);
  }

  const ctx = await requireUserAuth(req);

  if (bodyUserId && ctx.userId !== bodyUserId) {
    log.warn('auth-failure', { reason: 'userid-mismatch', type: 'user' });
    throw unauthorizedResponse(req);
  }

  return ctx;
}
