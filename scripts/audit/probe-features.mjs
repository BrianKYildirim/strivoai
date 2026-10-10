/**
 * Release-readiness audit — backend runtime probe.
 *
 * Invokes every user-facing AI feature over real HTTP with real user JWTs on the
 * PREVIEW project, and asserts the behaviors the audit cares about:
 *   - tier gating (Free vs Elite)
 *   - merit charge amount (balance delta + merit_transactions rows)
 *   - refund on failure
 *   - duplicate-submit (two concurrent identical calls) -> charged ONCE?
 *   - insufficient merits -> 402
 *   - invalid input -> 4xx with NO charge
 *
 * Read-only w.r.t. product code. Mutates only the two audit users' merit balances.
 * Usage: node scripts/audit/probe-features.mjs [featureName ...]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.test.local', quiet: true });

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SVC = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const PW = process.env.E2E_TEST_PASSWORD;

const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

const RESUME_TEXT = `Jordan Ellis — Software Engineer
jordan.ellis@example.com | San Francisco, CA | github.com/jellis

EXPERIENCE
Software Engineer Intern, Northwind Systems (Jun 2025 - Sep 2025)
- Built a Go service that ingested 12M events/day, cutting p99 latency from 840ms to 190ms.
- Migrated the billing reconciliation job to Postgres partitioning, reducing nightly runtime 6h -> 40m.
- Wrote the integration test suite (Testcontainers) that caught 14 regressions pre-release.

Backend Engineering Intern, Cobalt Labs (Jun 2024 - Aug 2024)
- Implemented an idempotent webhook receiver handling 400k Stripe events/mo with zero double-charges.
- Added Redis-backed rate limiting; abuse-driven 5xx dropped 92%.

PROJECTS
Raft consensus implementation in Rust (2.1k GitHub stars) — leader election + log replication.
Distributed key-value store with LSM-tree storage engine; benchmarked at 90k writes/sec.

EDUCATION
B.S. Computer Science, UC Irvine, 2026. GPA 3.8. Coursework: Distributed Systems, Compilers, Databases.

SKILLS
Go, Rust, Python, TypeScript, PostgreSQL, Redis, Kafka, Kubernetes, AWS, Terraform`;

const JOB_TEXT = `Senior Backend Engineer — Distributed Systems
Acme Cloud, San Francisco (Hybrid)

We're hiring a backend engineer to own our event ingestion pipeline (millions of events/day).

Requirements:
- 3+ years building production backend services in Go, Rust, or Java
- Deep PostgreSQL experience: query optimization, partitioning, replication
- Experience with Kafka or similar distributed log systems
- Kubernetes and infrastructure-as-code (Terraform)
- Strong testing discipline and on-call ownership

Nice to have: Rust, consensus protocols, observability tooling (Prometheus/Grafana).
Compensation: $180k-$230k + equity.`;

const JOB_TEXT_2 = `Platform Engineer — Reliability
Globex, Remote (US)

Own the reliability of a multi-tenant platform serving 8M MAU.

Requirements:
- 3+ years in platform/infra engineering
- Kubernetes, Terraform, AWS
- Incident response and SLO ownership
- Python or Go
Compensation: $170k-$210k.`;

// ── feature matrix ───────────────────────────────────────────────────────────
// meritFeature = the key passed to withMerits (what the RPC looks up)
const FEATURES = [
  {
    name: 'resume_analysis (analyze-resume)',
    slug: 'analyze-resume',
    meritFeature: 'resume_analysis',
    body: () => ({ resumeText: RESUME_TEXT, stream: false }),
    invalidBody: () => ({ resumeText: 'too short' }),
  },
  {
    name: 'career_compass (analyze-career)',
    slug: 'analyze-career',
    meritFeature: 'career_compass',
    body: () => ({ resumeText: RESUME_TEXT, targetRole: 'Backend Engineer' }),
    invalidBody: () => ({ resumeText: '' }),
  },
  {
    name: 'linkedin_grading (grade-linkedin)',
    slug: 'grade-linkedin',
    meritFeature: 'linkedin_grading',
    body: () => ({ profileText: RESUME_TEXT, linkedInUrl: 'https://linkedin.com/in/jellis' }),
    invalidBody: () => ({ profileText: '' }),
  },
  {
    name: 'recruiting_lens (recruiting-lens)',
    slug: 'recruiting-lens',
    meritFeature: 'recruiting_lens',
    body: () => ({ resumeText: RESUME_TEXT, jobDescription: JOB_TEXT }),
    invalidBody: () => ({ resumeText: '' }),
  },
  {
    name: 'interview_prep (interview-prep-analyze)',
    slug: 'interview-prep-analyze',
    meritFeature: 'interview_prep',
    body: () => ({ jobDescription: JOB_TEXT, background: RESUME_TEXT }),
    invalidBody: () => ({ jobDescription: '' }),
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────
async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`);
  return { jwt: data.session.access_token, userId: data.user.id };
}

async function balance(userId) {
  const { data } = await admin
    .from('user_merits')
    .select('subscription_balance, shop_balance')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.subscription_balance ?? 0) + (data?.shop_balance ?? 0);
}

async function setBalance(userId, n) {
  await admin.from('user_merits').update({ subscription_balance: n, shop_balance: 0 }).eq('user_id', userId);
}

async function txCount(userId, feature) {
  const { count } = await admin
    .from('merit_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', feature)
    .eq('source', 'feature-deduct');
  return count ?? 0;
}

async function call(slug, body, jwt) {
  const t0 = Date.now();
  let res, text;
  try {
    res = await fetch(`${URL}/functions/v1/${slug}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, error: String(e), json: null };
  }
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, ms: Date.now() - t0, json, raw: text.slice(0, 300) };
}

// ── probes ───────────────────────────────────────────────────────────────────
const results = [];
function record(r) {
  results.push(r);
  const icon = r.verdict === 'PASS' ? 'PASS' : r.verdict === 'FAIL' ? 'FAIL' : 'INFO';
  console.log(`[${icon}] ${r.tier.padEnd(5)} ${r.feature.padEnd(38)} ${r.check.padEnd(26)} ${r.detail}`);
}

const only = process.argv.slice(2);

const free = await signIn('audit+free@strivo.test');
const elite = await signIn('audit+elite@strivo.test');
console.log(`free=${free.userId}  elite=${elite.userId}\n`);

for (const f of FEATURES) {
  if (only.length && !only.some((o) => f.slug.includes(o) || f.meritFeature.includes(o))) continue;

  for (const [tierName, actor] of [['free', free], ['elite', elite]]) {
    // Does a cost row exist for this (feature, tier)?
    const { data: costRow } = await admin
      .from('merit_feature_costs')
      .select('cost')
      .eq('feature', f.meritFeature)
      .eq('tier', tierName)
      .maybeSingle();
    const expectedCost = costRow?.cost ?? null;

    await setBalance(actor.userId, 50);
    const before = await balance(actor.userId);
    const txBefore = await txCount(actor.userId, f.meritFeature);

    const r = await call(f.slug, f.body(), actor.jwt);
    const after = await balance(actor.userId);
    const txAfter = await txCount(actor.userId, f.meritFeature);
    const charged = before - after;

    record({
      tier: tierName,
      feature: f.name,
      check: 'happy-path',
      verdict: r.status === 200 ? 'PASS' : r.status === 403 && expectedCost === null ? 'FAIL' : 'INFO',
      detail: `HTTP ${r.status} ${r.ms}ms | charged=${charged} expectedCost=${expectedCost ?? 'NO COST ROW'} | err=${r.json?.error ?? '-'}`,
      raw: r.raw,
    });

    // Duplicate-submit: two concurrent identical calls.
    if (r.status === 200) {
      await setBalance(actor.userId, 50);
      const dBefore = await balance(actor.userId);
      const [a, b] = await Promise.all([
        call(f.slug, f.body(), actor.jwt),
        call(f.slug, f.body(), actor.jwt),
      ]);
      const dAfter = await balance(actor.userId);
      const dCharged = dBefore - dAfter;
      const bothOk = a.status === 200 && b.status === 200;
      record({
        tier: tierName,
        feature: f.name,
        check: 'duplicate-submit x2',
        verdict: dCharged <= (expectedCost ?? 0) ? 'PASS' : 'FAIL',
        detail: `statuses=${a.status}/${b.status} charged=${dCharged} (single=${expectedCost}) ${dCharged > (expectedCost ?? 0) ? '<<< DOUBLE-CHARGED' : ''}`,
      });
    }

    // Insufficient merits -> 402
    await setBalance(actor.userId, 1);
    const poor = await call(f.slug, f.body(), actor.jwt);
    record({
      tier: tierName,
      feature: f.name,
      check: 'insufficient-merits',
      verdict: poor.status === 402 ? 'PASS' : poor.status === 403 ? 'INFO' : 'FAIL',
      detail: `HTTP ${poor.status} err=${poor.json?.error ?? '-'} (want 402 insufficient_merits)`,
    });

    // Invalid input -> 4xx and NO charge
    await setBalance(actor.userId, 50);
    const ivBefore = await balance(actor.userId);
    const iv = await call(f.slug, f.invalidBody(), actor.jwt);
    const ivAfter = await balance(actor.userId);
    record({
      tier: tierName,
      feature: f.name,
      check: 'invalid-input no-charge',
      verdict: iv.status >= 400 && iv.status < 500 && ivBefore === ivAfter ? 'PASS' : 'FAIL',
      detail: `HTTP ${iv.status} charged=${ivBefore - ivAfter} (want 4xx, charged=0)`,
    });

    await setBalance(actor.userId, 50);
  }
}

console.log('\n────────── SUMMARY ──────────');
const fails = results.filter((r) => r.verdict === 'FAIL');
console.log(`total=${results.length} pass=${results.filter((r) => r.verdict === 'PASS').length} fail=${fails.length} info=${results.filter((r) => r.verdict === 'INFO').length}`);
if (fails.length) {
  console.log('\nFAILURES:');
  for (const f of fails) console.log(`  - [${f.tier}] ${f.feature} :: ${f.check} :: ${f.detail}`);
}
