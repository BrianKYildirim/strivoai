/**
 * Release-readiness audit — refund-on-failure probe.
 *
 * Uses the repo's own compound-guarded failure injector: when AI_TEST_MODE=true AND
 * AI_FORCE_FAILURE=true, invokeAnthropicText returns { ok:false, status:529 } — a
 * REFUNDABLE error per merit-gateway's isRefundableAnthropicError (>=500).
 *
 * So every feature should: deduct -> Anthropic 529 -> gateway refunds -> net charge 0.
 * A net charge > 0 means the user paid for an analysis they never received.
 *
 * Run ONLY with AI_FORCE_FAILURE=true set on Preview.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.test.local', quiet: true });

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SVC = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const PW = process.env.E2E_TEST_PASSWORD;

const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const N = `refund-${Date.now()}`;

const RESUME = `Jordan Ellis — Backend Engineer (${N}). Built a Go event-ingestion service handling 12M events/day,
cutting p99 latency 840ms to 190ms. Implemented an idempotent Stripe webhook receiver processing 400k events/mo
with zero double-charges. Migrated billing reconciliation to Postgres partitioning: nightly 6h to 40m.
Education: B.S. Computer Science, UC Irvine 2026. Skills: Go, Rust, PostgreSQL, Kafka, Kubernetes, AWS.`;
const JD = `Senior Backend Engineer — Distributed Systems (${N}). Own our event ingestion pipeline processing
millions of events per day. Requirements: 3+ years production backend in Go/Rust/Java; deep PostgreSQL;
Kafka; Kubernetes and Terraform; strong testing discipline and on-call ownership. $180k-$230k.`;

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { jwt: data.session.access_token, userId: data.user.id };
}
const bal = async (u) => {
  const { data } = await admin.from('user_merits').select('subscription_balance, shop_balance').eq('user_id', u).maybeSingle();
  return (data?.subscription_balance ?? 0) + (data?.shop_balance ?? 0);
};
const setBal = (u, n) => admin.from('user_merits').update({ subscription_balance: n, shop_balance: 0 }).eq('user_id', u);
const call = async (slug, body, jwt) => {
  const r = await fetch(`${URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, raw: t.slice(0, 110) };
};

const elite = await signIn('audit+elite@strivo.test');
const free = await signIn('audit+free@strivo.test');
const { data: eliteResume } = await admin.from('resumes').select('id').eq('user_id', elite.userId).limit(1).maybeSingle();
const { data: freeResume } = await admin.from('resumes').select('id').eq('user_id', free.userId).limit(1).maybeSingle();

const CASES = [
  { slug: 'analyze-resume', feature: 'resume_analysis', actor: free, tier: 'free',
    body: { resumeText: RESUME, resumeId: freeResume?.id, stream: false, attemptNonce: crypto.randomUUID() } },
  { slug: 'analyze-resume', feature: 'resume_analysis', actor: elite, tier: 'elite',
    body: { resumeText: RESUME, resumeId: eliteResume?.id, stream: false, attemptNonce: crypto.randomUUID() } },
  { slug: 'grade-linkedin', feature: 'linkedin_grading', actor: elite, tier: 'elite',
    body: { profileContent: RESUME, profileUrl: 'https://linkedin.com/in/audit', attemptNonce: crypto.randomUUID() } },
  { slug: 'recruiting-lens', feature: 'recruiting_lens', actor: elite, tier: 'elite',
    body: { resumeSummary: RESUME, jobDescription: JD, company: 'Acme Cloud', roleTitle: 'Senior Backend Engineer', attemptNonce: crypto.randomUUID() } },
  { slug: 'interview-prep-analyze', feature: 'interview_prep', actor: elite, tier: 'elite',
    body: { role_title: 'Senior Backend Engineer', company: 'Acme Cloud', job_description: JD,
            background_context: `Backend intern. ${N}`, interview_type: 'technical',
            question_categories: ['system_design'], difficulty: 'mid', duration: 30, format: 'written' } },
];

console.log('feature                       tier   cost  status  net-charge  verdict');
console.log('─'.repeat(76));
let failures = 0;

for (const c of CASES) {
  const { data: costRow } = await admin
    .from('merit_feature_costs').select('cost').eq('feature', c.feature).eq('tier', c.tier).maybeSingle();
  const cost = costRow?.cost ?? null;
  if (cost === null) { console.log(`${c.slug.padEnd(29)} ${c.tier.padEnd(6)} (no cost row — skipped)`); continue; }

  await setBal(c.actor.userId, 100);
  const before = await bal(c.actor.userId);
  const r = await call(c.slug, c.body, c.actor.jwt);
  const net = before - (await bal(c.actor.userId));

  // A refundable upstream failure must leave the user with net 0 charged.
  const ok = net === 0;
  if (!ok) failures++;
  console.log(
    `${c.slug.padEnd(29)} ${c.tier.padEnd(6)} ${String(cost).padEnd(5)} ${String(r.status).padEnd(7)} ${String(net).padEnd(11)} ` +
    `${ok ? 'PASS refunded' : `FAIL kept ${net} merit(s) for a failed analysis`}`,
  );
  if (!ok) console.log(`      body: ${r.raw}`);
  await setBal(c.actor.userId, 60);
}

console.log(`\n${failures === 0 ? 'RESULT: all refundable failures refunded correctly' : `RESULT: ${failures} feature(s) KEPT merits on a failed analysis`}`);
process.exit(failures === 0 ? 0 : 1);
