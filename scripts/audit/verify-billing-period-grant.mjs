/**
 * Release-readiness audit — verify the get_billing_period_start fix.
 *
 * 1. An authenticated user CAN call it for THEMSELVES (was 42501 permission denied).
 * 2. An authenticated user CANNOT call it for SOMEONE ELSE (the new ownership guard —
 *    without this, re-granting EXECUTE on a SECURITY DEFINER function that reads
 *    profiles.created_at for a caller-supplied uuid would be an IDOR).
 * 3. service_role can still call it for an arbitrary user (edge functions rely on this
 *    via _shared/billing-period.ts).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.test.local', quiet: true });

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SVC = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const PW = process.env.E2E_TEST_PASSWORD;

const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { client: c, userId: data.user.id };
}

let failures = 0;
const check = (name, pass, detail) => {
  if (!pass) failures++;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}\n       ${detail}`);
};

const free = await signIn('audit+free@strivo.test');
const elite = await signIn('audit+elite@strivo.test');

// 1. self-call must now succeed
{
  const { data, error } = await elite.client.rpc('get_billing_period_start', { p_user_id: elite.userId });
  check(
    'authenticated user can read OWN billing period',
    !error && !!data,
    error ? `error ${error.code}: ${error.message}` : `billing_period_start = ${data}`,
  );
}

// 2. cross-user call must be REFUSED by the ownership guard
{
  const { data, error } = await elite.client.rpc('get_billing_period_start', { p_user_id: free.userId });
  check(
    'authenticated user CANNOT read ANOTHER user billing period (IDOR guard)',
    !!error && !data,
    error ? `refused: ${error.code} ${error.message}` : `LEAKED another user's billing start: ${data}`,
  );
}

// 3. service_role (edge path) must still work for arbitrary users
{
  const { data, error } = await admin.rpc('get_billing_period_start', { p_user_id: free.userId });
  check(
    'service_role can still read ANY user billing period (edge path intact)',
    !error && !!data,
    error ? `error ${error.code}: ${error.message}` : `billing_period_start = ${data}`,
  );
}

console.log(`\n${failures === 0 ? 'RESULT: get_billing_period_start fix VERIFIED' : `RESULT: ${failures} check(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
