/**
 * Release-readiness audit — Recruiting Lens double-charge FIX verification.
 *
 * Reproduces the exact client behavior: RecruitingLens.tsx holds a per-submit
 * attemptNonce in a ref and REUSES it across a retry (one intent = one charge).
 *
 * Test A (regression): two concurrent submits carrying the SAME client nonce
 *   -> must charge the 8-Merit cost EXACTLY ONCE.
 * Test B (control):    two submits with DIFFERENT nonces (two deliberate runs)
 *   -> must charge TWICE. Proves the fix dedups on intent, not blindly.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.test.local', quiet: true });

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SVC = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const PW = process.env.E2E_TEST_PASSWORD;

const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

const body = (tag) => ({
  resumeSummary:
    `Jordan Ellis — Backend Engineer (${tag}). Built a Go event-ingestion service handling 12M events/day, ` +
    `cutting p99 latency from 840ms to 190ms. Implemented an idempotent Stripe webhook receiver processing ` +
    `400k events/mo with zero double-charges. Migrated billing reconciliation to Postgres partitioning: ` +
    `nightly runtime 6h to 40m. Skills: Go, Rust, PostgreSQL, Kafka, Kubernetes, AWS, Terraform.`,
  jobDescription:
    `Senior Backend Engineer — Distributed Systems (${tag}). Own our event ingestion pipeline processing ` +
    `millions of events per day. Requirements: 3+ years production backend in Go/Rust/Java; deep PostgreSQL ` +
    `(partitioning, replication); Kafka; Kubernetes and Terraform; strong testing discipline and on-call ownership.`,
  company: 'Acme Cloud',
  roleTitle: 'Senior Backend Engineer',
});

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(error.message);
  return { jwt: data.session.access_token, userId: data.user.id };
}
const bal = async (u) => {
  const { data } = await admin.from('user_merits').select('subscription_balance, shop_balance').eq('user_id', u).maybeSingle();
  return (data?.subscription_balance ?? 0) + (data?.shop_balance ?? 0);
};
const setBal = (u, n) => admin.from('user_merits').update({ subscription_balance: n, shop_balance: 0 }).eq('user_id', u);
const call = async (payload, jwt) => {
  const r = await fetch(`${URL}/functions/v1/recruiting-lens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: r.status, raw: (await r.text()).slice(0, 120) };
};

const elite = await signIn('audit+elite@strivo.test');
const COST = 8;
let failures = 0;

// ── Test A: same client nonce (double-click / retry of ONE intent) ───────────
{
  const tag = `same-nonce-${Date.now()}`;
  const nonce = crypto.randomUUID();
  const payload = { ...body(tag), attemptNonce: nonce };

  await setBal(elite.userId, 100);
  const before = await bal(elite.userId);
  const [a, b] = await Promise.all([call(payload, elite.jwt), call(payload, elite.jwt)]);
  const charged = before - (await bal(elite.userId));

  const pass = charged === COST;
  if (!pass) failures++;
  console.log(`Test A  same attemptNonce (one intent, two submits)`);
  console.log(`        statuses=${a.status}/${b.status}  charged=${charged}  expected=${COST}`);
  console.log(`        ${pass ? 'PASS — charged exactly once' : `FAIL — charged ${charged}, expected ${COST}`}\n`);
  if (a.status !== 200) console.log(`        A: ${a.raw}`);
  if (b.status !== 200) console.log(`        B: ${b.raw}`);
}

// ── Test B: different nonces (two DELIBERATE runs) — must still charge twice ──
{
  const tag = `diff-nonce-${Date.now()}`;
  await setBal(elite.userId, 100);
  const before = await bal(elite.userId);
  const [a, b] = await Promise.all([
    call({ ...body(tag + '-1'), attemptNonce: crypto.randomUUID() }, elite.jwt),
    call({ ...body(tag + '-2'), attemptNonce: crypto.randomUUID() }, elite.jwt),
  ]);
  const charged = before - (await bal(elite.userId));

  const pass = charged === COST * 2;
  if (!pass) failures++;
  console.log(`Test B  different attemptNonces (two deliberate runs)`);
  console.log(`        statuses=${a.status}/${b.status}  charged=${charged}  expected=${COST * 2}`);
  console.log(`        ${pass ? 'PASS — each deliberate run charged (no over-dedup)' : `FAIL — charged ${charged}, expected ${COST * 2}`}\n`);
}

await setBal(elite.userId, 60);
console.log(failures === 0 ? 'RESULT: recruiting-lens idempotency VERIFIED' : `RESULT: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
