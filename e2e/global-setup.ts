/**
 * Playwright global setup — Supabase TEST-project test-user seed (Plan 01-03, Task 1).
 *
 * Runs ONCE in the Node/Playwright process before any project, never in page
 * context. Uses the SERVICE-ROLE key (admin API) to idempotently create the
 * deterministic e2e baseline user and seed an "onboarded" resume row so the
 * login flow lands on /dashboard (ProtectedRoute redirects users with no resume
 * to /onboarding — see src/components/ProtectedRoute.tsx).
 *
 * SECURITY (threat T-03-01): SUPABASE_TEST_SERVICE_ROLE_KEY is read from
 * process.env HERE and HERE ONLY. It is NEVER passed to page.evaluate /
 * page.addInitScript / any browser-visible surface, and never appears in a
 * .spec.ts. The preview build the browser drives uses only the anon key
 * (VITE_SUPABASE_ANON_KEY). Do NOT hardcode any secret value in this file —
 * all values come from process.env (populated by dotenv(.env.test.local) in
 * playwright.config.ts, or by CI secrets).
 *
 * AI is NOT stubbed here: the AI_TEST_MODE seam is a server-side Supabase
 * function secret on the TEST project (deployed out-of-band). This file does
 * not reference it (it is intentionally absent from the whole e2e/ surface).
 */
import { createClient } from '@supabase/supabase-js';
import { resetAnalyzeResumeRateLimit, seedMerits } from './helpers/test-user';

export const E2E_TEST_EMAIL = 'e2e+baseline@strivo.test';

export default async function globalSetup(): Promise<void> {
  const url = process.env.SUPABASE_TEST_URL;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!url || !serviceRoleKey || !password) {
    throw new Error(
      '[e2e/global-setup] Missing required env. Need SUPABASE_TEST_URL, ' +
        'SUPABASE_TEST_SERVICE_ROLE_KEY, and E2E_TEST_PASSWORD (source them from ' +
        '.env.test.local locally or CI secrets). Refusing to run with a partial config.',
    );
  }

  // Service-role admin client — Node-side ONLY. persistSession:false so this
  // process never writes a session to disk.
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Idempotently ensure the test user exists. createUser throws if the email
  //    is already registered — that is the expected steady state, so swallow it.
  let userId: string | null = null;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: E2E_TEST_EMAIL,
    password,
    email_confirm: true,
  });

  if (created?.user?.id) {
    userId = created.user.id;
  } else if (createError) {
    // Already registered (or similar) — resolve the existing user id by paging
    // the admin user list and matching on email. Keep the user's password in
    // sync so a rotated E2E_TEST_PASSWORD still logs in deterministically.
    userId = await findUserIdByEmail(admin, E2E_TEST_EMAIL);
    if (userId) {
      await admin.auth.admin
        .updateUserById(userId, { password, email_confirm: true })
        .catch(() => {
          /* best-effort password sync; login is the real assertion */
        });
    }
  }

  if (!userId) {
    throw new Error(
      `[e2e/global-setup] Could not create or locate the test user ${E2E_TEST_EMAIL}. ` +
        `createUser error: ${createError?.message ?? 'none'}.`,
    );
  }

  // 2. The handle_new_user trigger auto-creates a free-tier profiles row on user
  //    creation. Ensure it exists at the expected tier AND reset the Stripe billing
  //    state so the checkout flow (Flow 3) always starts clean. A stale
  //    stripe_customer_id left by a prior run — or minted under a rotated/old key —
  //    makes checkout.sessions.create throw "No such customer", flaking the gate.
  //    Nulling the ids each run forces a fresh, valid test customer to be lazily
  //    created against the CURRENT TEST-project key (best-effort; the trigger owns
  //    the row, this only resets billing state for determinism).
  await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        subscription_tier: 'free',
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
      { onConflict: 'id' },
    )
    .then(() => undefined, () => undefined);

  // 3. Seed exactly one "onboarded" resume row (with grading_data) if the user
  //    has none, so ProtectedRoute's onboarding gate passes and the login flow
  //    settles on /dashboard. Idempotent: skip when a resume already exists.
  const { data: existingResumes } = await admin
    .from('resumes')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (!existingResumes || existingResumes.length === 0) {
    await admin.from('resumes').insert({
      user_id: userId,
      file_name: 'e2e-baseline-seed.pdf',
      file_url: 'seed://e2e-baseline',
      file_size: 1024,
      overall_score: 80,
      grading_data: { seeded: true, source: 'e2e/global-setup' },
      analyzed_at: new Date().toISOString(),
    });
  }

  // 4. Seed the PROFESSIONAL GOAL (quick 260712-msh). ProtectedRoute's onboarding gate
  //    now requires a resume AND a non-empty career_targets.professional_goal — a user
  //    with only a resume is redirected to /onboarding (Step 4), which would bounce the
  //    e2e user off /dashboard and fail auth.setup.ts, cascading into EVERY spec that
  //    depends on storageState.
  //
  //    The fix is to SEED THE GOAL, never to weaken the gate. Idempotent: skip when a
  //    goal is already present, so a human-edited goal on the test user is preserved.
  //
  //    Only the goal columns are written. professional_goal_structured and the three
  //    goal_readiness_* columns are TRIGGER-OWNED (migration 20260712000002) — the
  //    scorer recomputes them inside this very write, and the column-level GRANTs in
  //    20260712000001 reject a client write to them anyway.
  const { data: existingTargets } = await admin
    .from('career_targets')
    .select('professional_goal')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existingTargets?.professional_goal?.trim()) {
    await admin.from('career_targets').upsert(
      {
        user_id: userId,
        professional_goal: 'E2E baseline goal — Software Engineering role 2027',
        professional_goal_set_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  }

  // 5. Reset the CONSUMABLE resources every merit-spending spec depends on (09-09 / D9-04).
  //
  //    Hoisted here from two-tab-concurrency.spec.ts, where 09-06 first fixed it for ONE spec.
  //    It belongs in global-setup because BOTH facts below are now true of the whole suite:
  //    `resume-analysis.spec.ts` drives a genuine analysis again (D9-03), and the E2E lane runs
  //    inside the BLOCKING verify:baseline gate on every deploy.
  //
  //      - MERITS: a resume analysis costs 3 on free tier and the seeded user starts with 10
  //        lifetime Merits. Once the balance hits 0, `canAfford()` goes false, Upload's submit
  //        button renders `disabled`, and the spec fails with "element is not enabled" instead
  //        of a real assertion.
  //      - RATE LIMIT: analyze-resume allows a free user 5 analyses per HOUR. The 6th run in an
  //        hour (across PRs, retries, local verify:baseline invocations and deploy.ps1) is
  //        429'd: the row is created, the analysis never completes, and the spec fails on a
  //        TIMEOUT rather than on its assertion.
  //
  //    Both are resource-exhaustion flakes in a blocking gate, and a flaky gate is a bypassed
  //    gate. Resetting a TEST-project balance/counter is test-environment seeding, exactly like
  //    the Stripe billing-state reset in step 2 above - the merit system and the rate limiter
  //    are untouched and still enforce their real limits for every real user.
  await seedMerits(admin, userId);
  await resetAnalyzeResumeRateLimit(admin, userId);
}

/** Page the admin user list to find a user id by email (admin API has no direct lookup). */
async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) return null; // last page
  }
  return null;
}
