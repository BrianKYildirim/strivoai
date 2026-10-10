/**
 * Release-readiness audit — Preview test-user provisioner.
 *
 * Creates/resets two deterministic, fully-onboarded audit users on the PREVIEW
 * (test) Supabase project: one Free, one Elite. Mirrors e2e/global-setup.ts
 * (same onboarding gates: a resume row AND a non-empty career_targets goal).
 *
 * Service-role key is read from process.env only, never logged.
 * Usage: node scripts/audit/provision-audit-users.mjs [--merits-free N] [--merits-elite N]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.test.local' });

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const password = process.env.E2E_TEST_PASSWORD;

if (!url || !serviceRoleKey || !password) {
  console.error('[provision] Missing SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY / E2E_TEST_PASSWORD');
  process.exit(1);
}

function argNum(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}

export const AUDIT_FREE_EMAIL = 'audit+free@strivo.test';
export const AUDIT_ELITE_EMAIL = 'audit+elite@strivo.test';

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserIdByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function provision(email, tier, merits) {
  let userId = null;
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created?.user?.id) {
    userId = created.user.id;
  } else {
    userId = await findUserIdByEmail(email);
    if (userId) {
      await admin.auth.admin
        .updateUserById(userId, { password, email_confirm: true })
        .catch(() => {});
    }
  }
  if (!userId) throw new Error(`[provision] could not create or locate ${email}`);

  // Tier + clean billing state.
  await admin.from('profiles').upsert(
    {
      id: userId,
      email,
      subscription_tier: tier,
      subscription_status: 'active',
      stripe_customer_id: null,
      stripe_subscription_id: null,
    },
    { onConflict: 'id' },
  );

  // Deterministic merit balance.
  await admin.from('user_merits').upsert(
    {
      user_id: userId,
      subscription_balance: merits,
      shop_balance: 0,
    },
    { onConflict: 'user_id' },
  );

  // Onboarding gate 1: a resume row.
  const { data: resumes } = await admin
    .from('resumes')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  if (!resumes?.length) {
    await admin.from('resumes').insert({
      user_id: userId,
      file_name: 'audit-seed.pdf',
      file_url: 'seed://audit',
      file_size: 1024,
      overall_score: 80,
      grading_data: { seeded: true, source: 'scripts/audit/provision-audit-users.mjs' },
      analyzed_at: new Date().toISOString(),
    });
  }

  // Onboarding gate 2: a professional goal.
  const { data: targets } = await admin
    .from('career_targets')
    .select('professional_goal')
    .eq('user_id', userId)
    .maybeSingle();
  if (!targets?.professional_goal?.trim()) {
    await admin.from('career_targets').upsert(
      {
        user_id: userId,
        professional_goal: 'Software Engineering role, new grad 2027, backend/distributed systems',
        professional_goal_set_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  }

  return userId;
}

const freeId = await provision(AUDIT_FREE_EMAIL, 'free', argNum('--merits-free', 30));
const eliteId = await provision(AUDIT_ELITE_EMAIL, 'elite', argNum('--merits-elite', 60));

console.log(JSON.stringify({ free: { email: AUDIT_FREE_EMAIL, id: freeId }, elite: { email: AUDIT_ELITE_EMAIL, id: eliteId } }, null, 2));
