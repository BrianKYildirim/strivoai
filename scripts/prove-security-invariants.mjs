#!/usr/bin/env node
/**
 * Prove the client-role security invariants against a Supabase target: a normal
 * authenticated user (acting through PostgREST, exactly like the browser) can NOT
 *   1. change their subscription tier / billing columns,
 *   2. change their merit balance,
 *   3. grant themselves (or anyone) admin,
 *   4. read another user's data,
 * while legitimate own-data edits still work. RLS + the billing-guard trigger are
 * the boundary; this exercises them end-to-end with real JWTs.
 *
 * Refuses a production URL. Uses synthetic users it creates and deletes.
 *
 * Env (values never printed): SUPABASE_URL, SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY, LOADTEST_PASSWORD.
 *
 * Usage: node scripts/prove-security-invariants.mjs
 */

import { createClient } from '@supabase/supabase-js';

const PRODUCTION_REF = 'zjpjapgraoxdukdvpjes';
const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = process.env.LOADTEST_PASSWORD;
if (!URL || !ANON || !SVC || !PW) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, LOADTEST_PASSWORD required.');
if (URL.includes(PRODUCTION_REF)) throw new Error('REFUSING: production URL.');

const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

const checks = [];
function assert(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}
function rest(token, path, method, body) {
  return fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function mkUser(tag) {
  const email = `loadtest+sec-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@loadtest.strivio.invalid`;
  const { data: c, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  const { data: si, error: se } = await anon.auth.signInWithPassword({ email, password: PW });
  if (se) throw new Error(`signIn: ${se.message}`);
  return { id: c.user.id, token: si.session.access_token, email };
}

async function main() {
  console.log(`\n=== Security invariant proof — ${URL} ===\n`);
  const A = await mkUser('a');
  const B = await mkUser('b');
  // Seed B with a resume so we can test cross-user reads of real data.
  await admin.from('resumes').insert({ id: crypto.randomUUID(), user_id: B.id, file_name: 'b.pdf', file_url: 'local://b', file_size: 10, extracted_text: 'B private resume text.' });

  const tierBefore = (await admin.from('profiles').select('subscription_tier').eq('id', A.id).single()).data?.subscription_tier;
  const meritsBefore = (await admin.from('user_merits').select('subscription_balance,shop_balance').eq('user_id', A.id).single()).data;

  // 1) Cannot change subscription tier / billing columns.
  const tierRes = await rest(A.token, `profiles?id=eq.${A.id}`, 'PATCH', { subscription_tier: 'elite' });
  const tierAfter = (await admin.from('profiles').select('subscription_tier').eq('id', A.id).single()).data?.subscription_tier;
  assert('cannot change subscription_tier (rejected + unchanged)', tierRes.status >= 400 && tierAfter === tierBefore, `http=${tierRes.status}, tier ${tierBefore} -> ${tierAfter}`);
  // also stripe_customer_id
  const stripeRes = await rest(A.token, `profiles?id=eq.${A.id}`, 'PATCH', { stripe_customer_id: 'cus_hacked' });
  const stripeAfter = (await admin.from('profiles').select('stripe_customer_id').eq('id', A.id).single()).data?.stripe_customer_id;
  assert('cannot change stripe/billing columns (rejected + unchanged)', stripeRes.status >= 400 && (stripeAfter ?? null) === null, `http=${stripeRes.status}`);

  // 2) Cannot change merit balance.
  const meritRes = await rest(A.token, `user_merits?user_id=eq.${A.id}`, 'PATCH', { subscription_balance: 999999 });
  const meritsAfter = (await admin.from('user_merits').select('subscription_balance,shop_balance').eq('user_id', A.id).single()).data;
  const meritsUnchanged = meritsAfter?.subscription_balance === meritsBefore?.subscription_balance && meritsAfter?.shop_balance === meritsBefore?.shop_balance;
  // RLS has no UPDATE policy -> 0 rows updated (PostgREST may return 200 [] or 404); either way balance must be unchanged.
  const meritRepr = await meritRes.json().catch(() => null);
  assert('cannot change merit balance (0 rows / unchanged)', meritsUnchanged && (meritRes.status >= 400 || (Array.isArray(meritRepr) && meritRepr.length === 0)), `http=${meritRes.status}, bal ${meritsBefore?.subscription_balance} -> ${meritsAfter?.subscription_balance}`);

  // 3) Cannot grant self admin.
  const roleRes = await rest(A.token, 'user_roles', 'POST', { user_id: A.id, role: 'admin' });
  const roleRows = (await admin.from('user_roles').select('role').eq('user_id', A.id)).data || [];
  const isAdmin = (await admin.rpc('has_role', { _user_id: A.id, _role: 'admin' })).data;
  assert('cannot grant self admin (rejected + no role row + not admin)', roleRes.status >= 400 && roleRows.length === 0 && isAdmin !== true, `http=${roleRes.status}, rows=${roleRows.length}, has_role=${isAdmin}`);

  // 4) Cannot read another user's data.
  const pB = await rest(A.token, `profiles?id=eq.${B.id}&select=id,email`, 'GET');
  const pBrows = await pB.json().catch(() => []);
  assert('cannot read another user profile (0 rows)', Array.isArray(pBrows) && pBrows.length === 0, `rows=${pBrows.length}`);
  const rB = await rest(A.token, `resumes?user_id=eq.${B.id}&select=id,extracted_text`, 'GET');
  const rBrows = await rB.json().catch(() => []);
  assert('cannot read another user resume (0 rows)', Array.isArray(rBrows) && rBrows.length === 0, `rows=${rBrows.length}`);
  const mB = await rest(A.token, `user_merits?user_id=eq.${B.id}&select=subscription_balance`, 'GET');
  const mBrows = await mB.json().catch(() => []);
  assert('cannot read another user merits (0 rows)', Array.isArray(mBrows) && mBrows.length === 0, `rows=${mBrows.length}`);

  // 5) Positive control — legitimate own-profile edit still works.
  const okRes = await rest(A.token, `profiles?id=eq.${A.id}`, 'PATCH', { full_name: 'Legit Change' });
  const okRepr = await okRes.json().catch(() => []);
  const nameAfter = (await admin.from('profiles').select('full_name').eq('id', A.id).single()).data?.full_name;
  assert('CAN edit own allowed profile column (positive control)', okRes.status < 300 && nameAfter === 'Legit Change', `http=${okRes.status}, full_name=${nameAfter}`);
  const ownRead = await rest(A.token, `profiles?id=eq.${A.id}&select=id`, 'GET');
  const ownRows = await ownRead.json().catch(() => []);
  assert('CAN read own profile (positive control)', Array.isArray(ownRows) && ownRows.length === 1, `rows=${ownRows.length}`);

  // Teardown.
  await admin.auth.admin.deleteUser(A.id).catch(() => {});
  await admin.auth.admin.deleteUser(B.id).catch(() => {});

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== ${checks.length - failed.length}/${checks.length} invariants proven ===`);
  if (failed.length) {
    console.error(`FAILED: ${failed.map((c) => c.name).join('; ')}`);
    process.exit(1);
  }
  console.log('ALL SECURITY INVARIANTS HOLD.');
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
