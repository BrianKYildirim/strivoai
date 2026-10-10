/**
 * Release-readiness audit — duplicate-submit / double-charge probe.
 *
 * Fires TWO CONCURRENT IDENTICAL requests (a double-click) at each feature and
 * measures the total merits charged. Correct behavior: charged == single cost.
 * Double-charge: charged == 2x cost.
 *
 * Every payload carries a unique run nonce so the analysis_cache precheck is a
 * guaranteed MISS — otherwise a cache hit masks a real double-charge.
 *
 * Correct request contracts (read from the edge function sources):
 *   grade-linkedin        { profileContent (>=50), profileUrl }
 *   recruiting-lens       { resumeSummary (>=50), jobDescription (>=50), company, roleTitle }   [elite]
 *   interview-prep-analyze IntakeFormSchema 9-field                                             [elite]
 *   analyze-resume        { resumeText, resumeId }
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.test.local', quiet: true });

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SVC = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const PW = process.env.E2E_TEST_PASSWORD;

const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const NONCE = `audit-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const RESUME = (n) => `Jordan Ellis — Software Engineer (ref ${n})
Backend engineer with internship experience at Northwind Systems and Cobalt Labs.
Built a Go event-ingestion service handling 12M events/day, cutting p99 latency 840ms -> 190ms.
Implemented an idempotent Stripe webhook receiver processing 400k events/mo with zero double-charges.
Migrated billing reconciliation to Postgres partitioning: nightly runtime 6h -> 40m.
Projects: Raft consensus in Rust (2.1k stars); LSM-tree key-value store at 90k writes/sec.
Education: B.S. Computer Science, UC Irvine 2026, GPA 3.8.
Skills: Go, Rust, Python, TypeScript, PostgreSQL, Redis, Kafka, Kubernetes, AWS, Terraform.`;

const JD = (n) => `Senior Backend Engineer — Distributed Systems (req ${n})
Acme Cloud, San Francisco (Hybrid).
Own our event ingestion pipeline processing millions of events per day.
Requirements: 3+ years production backend in Go/Rust/Java; deep PostgreSQL (partitioning, replication);
Kafka or similar distributed log; Kubernetes + Terraform; strong testing discipline and on-call ownership.
Nice to have: Rust, consensus protocols, Prometheus/Grafana. Compensation $180k-$230k plus equity.`;

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
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
  return { status: r.status, json: j, raw: t.slice(0, 160) };
};

const elite = await signIn('audit+elite@strivo.test');
const free = await signIn('audit+free@strivo.test');

// resumeId for analyze-resume (the seeded row).
const { data: resumeRow } = await admin.from('resumes').select('id').eq('user_id', elite.userId).limit(1).maybeSingle();
const { data: freeResumeRow } = await admin.from('resumes').select('id').eq('user_id', free.userId).limit(1).maybeSingle();

const CASES = [
  {
    name: 'recruiting-lens',
    feature: 'recruiting_lens',
    actor: elite, tier: 'elite',
    threadsIdempotencyKey: false,
    body: () => ({
      resumeSummary: RESUME(NONCE),
      jobDescription: JD(NONCE),
      company: 'Acme Cloud',
      roleTitle: 'Senior Backend Engineer',
    }),
  },
  {
    name: 'interview-prep-analyze',
    feature: 'interview_prep',
    actor: elite, tier: 'elite',
    threadsIdempotencyKey: false,
    body: () => ({
      role_title: 'Senior Backend Engineer',
      company: 'Acme Cloud',
      job_description: JD(NONCE),
      background_context: `Backend intern, Go + Postgres. ref ${NONCE}`,
      interview_type: 'technical',
      question_categories: ['system_design', 'coding'],
      difficulty: 'mid',
      duration: 30,
      format: 'written',
    }),
  },
  {
    name: 'grade-linkedin',
    feature: 'linkedin_grading',
    actor: elite, tier: 'elite',
    threadsIdempotencyKey: true,
    body: () => ({
      profileContent: RESUME(NONCE),
      profileUrl: 'https://www.linkedin.com/in/jordan-ellis-audit',
    }),
  },
  {
    name: 'analyze-resume',
    feature: 'resume_analysis',
    actor: elite, tier: 'elite',
    threadsIdempotencyKey: true,
    body: () => ({ resumeText: RESUME(NONCE), resumeId: resumeRow?.id, stream: false }),
  },
];

console.log(`nonce=${NONCE}\n`);
console.log('feature                 cost  key?   statuses      charged   verdict');
console.log('─'.repeat(78));

const findings = [];
for (const c of CASES) {
  const { data: costRow } = await admin
    .from('merit_feature_costs').select('cost').eq('feature', c.feature).eq('tier', c.tier).maybeSingle();
  const cost = costRow?.cost ?? null;
  if (cost === null) {
    console.log(`${c.name.padEnd(23)} ${'--'.padEnd(5)} ${'-'.padEnd(6)} NO COST ROW -> tier_locked`);
    continue;
  }

  await setBal(c.actor.userId, 100);
  const before = await bal(c.actor.userId);
  const payload = c.body();
  const [a, b] = await Promise.all([call(c.name, payload, c.actor.jwt), call(c.name, payload, c.actor.jwt)]);
  const after = await bal(c.actor.userId);
  const charged = before - after;

  const bothSucceeded = a.status === 200 && b.status === 200;
  const doubleCharged = charged > cost;
  const verdict = doubleCharged ? 'FAIL double-charge' : charged === cost ? 'PASS charged once' : charged === 0 ? 'INFO no charge' : 'INFO';

  console.log(
    `${c.name.padEnd(23)} ${String(cost).padEnd(5)} ${(c.threadsIdempotencyKey ? 'yes' : 'NO').padEnd(6)} ` +
    `${String(a.status)}/${String(b.status)}`.padEnd(13) +
    `${String(charged).padEnd(9)} ${verdict}`
  );
  if (a.status !== 200) console.log(`    call A: ${a.raw}`);
  if (b.status !== 200) console.log(`    call B: ${b.raw}`);

  findings.push({ feature: c.name, cost, charged, doubleCharged, bothSucceeded, threadsKey: c.threadsIdempotencyKey, a: a.status, b: b.status });
}

console.log('\n────────── DOUBLE-CHARGE SUMMARY ──────────');
for (const f of findings) {
  if (f.doubleCharged) {
    console.log(`  DEFECT  ${f.feature}: a double-click charged ${f.charged} merits (single cost = ${f.cost}). idempotencyKey threaded: ${f.threadsKey ? 'yes' : 'NO'}`);
  }
}
if (!findings.some((f) => f.doubleCharged)) console.log('  No double-charge observed in this run.');
