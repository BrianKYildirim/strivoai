/**
 * Quick task 260713-hrd — RC-1 regression guard: the LIVE (internal/worker) Career
 * Compass path must resolve the user's REAL tier.
 *
 * THE BUG THIS LOCKS OUT
 * ---------------------------------------------------------------------------
 * 100% of Career Compass traffic goes CareerCompass.tsx -> submit-career-analysis-job
 * -> process-career-analysis-job -> analyze-career under `x-internal-job-secret`.
 * `requireInternalAuth()` is typed `Promise<null>` and ALWAYS returns null, so
 * analyze-career's `resolvedTier` (derived solely from `userContext`) was `'free'`
 * for EVERY user — Elite subscribers were analyzed, budgeted and shaped as Free.
 *
 * THE FIX: an additive `resolveTierForUserId(userId)` in `_shared/auth.ts` reads
 * `profiles.subscription_tier` under the service client, applies the ADMIN_EMAIL
 * elevation, and pipes through `normalizeActiveTier` — server-trusted, never
 * client-supplied (D-14). analyze-career calls it ONLY when `userContext === null`.
 *
 * D-14 IS NON-NEGOTIABLE: assertion (c) fail-closes on any reintroduction of a
 * `body.tier` / `rawBody.tier` read in analyze-career. A client-supplied tier on a
 * tier-sensitive money path is a privilege-escalation primitive.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveTierForUserId } from '../../_shared/auth.ts';

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

const careerSource = await Deno.readTextFile(winSafePath('../index.ts'));
const authSource = await Deno.readTextFile(winSafePath('../../_shared/auth.ts'));

/**
 * Minimal stub of the `.from().select().eq().maybeSingle()` chain that
 * resolveTierForUserId drives. Injected via the (test-only) optional client param —
 * the same "Injectable for tests" seam `_shared/ai-retry.ts` already uses.
 */
function stubClient(row: { email?: string; subscription_tier?: string } | null, error: unknown = null) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: () => Promise.resolve({ data: row, error }),
        }),
      }),
    }),
    // deno-lint-ignore no-explicit-any
  } as any;
}

// ── (a) the resolver exists, is server-trusted, and normalizes ────────────────

Deno.test('260713-hrd tier-resolution: _shared/auth.ts EXPORTS resolveTierForUserId', () => {
  assertEquals(typeof resolveTierForUserId, 'function');
  assert(
    authSource.includes('export async function resolveTierForUserId'),
    'resolveTierForUserId must be an exported async function on the shared auth chokepoint',
  );
});

Deno.test("260713-hrd tier-resolution: an 'elite' profile resolves to 'elite' (RC-1 — was 'free' for every queued run)", async () => {
  const tier = await resolveTierForUserId(
    'user-elite',
    { client: stubClient({ email: 'elite@example.com', subscription_tier: 'elite' }) },
  );
  assertEquals(tier, 'elite');
});

Deno.test("260713-hrd tier-resolution: a saved 'pro' profile resolves to 'elite' via normalizeActiveTier (there is no Pro)", async () => {
  const tier = await resolveTierForUserId(
    'user-pro',
    { client: stubClient({ email: 'pro@example.com', subscription_tier: 'pro' }) },
  );
  assertEquals(tier, 'elite', 'normalizeActiveTier collapses pro -> elite; a saved pro row gets the Elite experience');
});

Deno.test("260713-hrd tier-resolution: a 'free' profile resolves to 'free'", async () => {
  const tier = await resolveTierForUserId(
    'user-free',
    { client: stubClient({ email: 'free@example.com', subscription_tier: 'free' }) },
  );
  assertEquals(tier, 'free');
});

Deno.test('260713-hrd tier-resolution: the ADMIN_EMAIL is elevated to elite even when the stored tier is free', async () => {
  const adminEmail = (Deno.env.get('ADMIN_EMAIL') ?? 'strivolife@gmail.com').toLowerCase();
  const tier = await resolveTierForUserId(
    'user-admin',
    { client: stubClient({ email: adminEmail, subscription_tier: 'free' }) },
  );
  assertEquals(tier, 'elite', 'the admin account receives full Elite treatment end-to-end (mirrors requireUserAuth)');
  assert(
    authSource.includes('isAdminEmail'),
    'the resolver must reuse the SAME admin-elevation predicate as requireUserAuth (one chokepoint, no drift)',
  );
});

Deno.test("260713-hrd tier-resolution: a missing profile row FAILS CLOSED to 'free' (never elite)", async () => {
  assertEquals(await resolveTierForUserId('ghost', { client: stubClient(null) }), 'free');
  assertEquals(
    await resolveTierForUserId('boom', { client: stubClient(null, { message: 'db down' }) }),
    'free',
    'a DB error must fail closed on cost, never open',
  );
});

// ── (b) analyze-career calls it on the userContext === null (internal) branch ──

Deno.test('260713-hrd tier-resolution: analyze-career resolves the tier from the DB on the internal/worker branch', () => {
  assert(
    careerSource.includes('resolveTierForUserId('),
    'analyze-career must call resolveTierForUserId — otherwise every queued run is analyzed as free (RC-1)',
  );
  assert(
    /import \{[^}]*resolveTierForUserId[^}]*\} from ['"]\.\.\/_shared\/auth\.ts['"]/s.test(careerSource),
    "resolveTierForUserId must be imported from the shared auth chokepoint",
  );
  // It must be reachable ONLY when there is no JWT user context (the internal path).
  // Assert the SEMANTICS, not one spelling: the handler branches `if (userContext) { …jwt… }
  // else { …DB lookup… }`, so the DB call must sit strictly AFTER the JWT branch opens, and the
  // JWT branch must not itself call it.
  const jwtBranch = careerSource.indexOf('if (userContext) {');
  const dbCall = careerSource.indexOf('resolveTierForUserId(effectiveUserId)');
  assert(jwtBranch > -1, 'the JWT path must be an explicit branch on userContext');
  assert(dbCall > jwtBranch, 'the DB resolution must live in the NO-userContext (internal/worker) branch');
  assert(
    /\}\s*else\s+if\s*\([^)]*effectiveUserId/.test(careerSource),
    'the DB resolution must be the ELSE of the userContext branch — never reachable for a JWT caller',
  );
});

// ── (c) D-14 fail-closed: the tier is NEVER read off the request body ─────────

Deno.test('260713-hrd tier-resolution: analyze-career NEVER reads a client-supplied tier (D-14 fail-closed)', () => {
  for (const forbidden of ['rawBody.tier', 'requestBody.tier', 'body.tier']) {
    assert(
      !careerSource.includes(forbidden),
      `analyze-career must never read ${forbidden} — a client-supplied tier is a privilege-escalation primitive (D-14)`,
    );
  }
  assert(
    !/=\s*(rawBody|requestBody|body)\.tier/.test(careerSource),
    'no assignment may source the tier from the request body',
  );
});
