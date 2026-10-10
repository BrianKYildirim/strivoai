// ── Workload 10: Concurrent AI-analysis execution (EXECUTING ANALYSES) ───────
//
// DIMENSION: analyses running the model AT ONCE. This is the SCARCEST, most
// expensive dimension — capped far below browsing. Each VU holds one in-flight
// analyze-resume (stream:true) call; TARGET = simultaneously executing analyses.
//
// MODE=mock (default): requires the TARGET env to have AI_TEST_MODE=true (Preview
//   already does). No real provider cost; exercises the full lifecycle + merge.
// MODE=real: makes REAL Anthropic calls. Guarded by the $5 spend cap and, for the
//   500/1000 rungs, by REAL_AI_HIGH_CONCURRENCY=confirmed. Keep TARGET tiny.
//
// Ladder rungs (executingAnalyses): 1,5,10,25,50,100,250, then 500/1000 ONLY if
// every prior rung stayed safe AND the high-concurrency override is set.
//
// Run (mock, one rung):
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e PROFILE=ramp -e TARGET=10 \
//     -e MODE=mock scenarios/10-concurrent-ai-analysis.js

import http from 'k6/http';
import { check } from 'k6';
import { preflight, warnIfMeritInert } from '../lib/guards.js';
import { buildVuOptions } from '../lib/scenario.js';
import { buildThresholds } from '../config/thresholds.js';
import { session } from '../lib/session.js';
import { authHeaders } from '../lib/auth.js';
import { clamp, assertExecutingRungAllowed, assertRealSpendUnderCap, EST_COST_PER_REAL_ANALYSIS_USD } from '../config/safety-limits.js';
import {
  analysisCompletionMs,
  completedRuns,
  failedRuns,
  acceptedRuns,
  businessErrors,
  recordHttp,
  firstClickCompletion,
  providerRateLimited,
  estimatedProviderCostUsdMilli,
} from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));
const RESUME_TEXT = open(__ENV.RESUME_TEXT_FILE || '../fixtures/resumes/synthetic-resume.txt');
const MODE = __ENV.MODE || 'mock'; // mock | real
const TIER = __ENV.TIER || 'free';

// SMOKE=1 runs a BOUNDED "N concurrent, exactly one analysis each" rung (no VU
// looping, so per-user hourly rate limits aren't tripped) — for a tiny functional
// concurrency check. Otherwise the normal ramping-vus load profile is used.
const SMOKE = __ENV.SMOKE === '1' || __ENV.SMOKE === 'true';
const SMOKE_N = Math.max(1, Number(__ENV.TARGET || 5));
export const options = SMOKE
  ? {
      scenarios: {
        main: { executor: 'shared-iterations', vus: SMOKE_N, iterations: SMOKE_N, maxDuration: '120s' },
      },
      thresholds: buildThresholds('analysis'),
    }
  : buildVuOptions({
      env: __ENV,
      capDimension: 'maxExecutingAnalyses',
      latencyClass: 'analysis',
      defaultTarget: 5,
      gracefulStopSec: 120,
    });

// Resume rows are created SERVER-SIDE in the product (the upload edge function uses
// the service role); the client (authenticated) does NOT hold INSERT on `resumes`
// under the least-privilege grants that match prod. So the executing-analysis rung
// consumes resume ids PRE-SEEDED via service role by tools/seed-resumes.mjs (which
// writes fixtures/resume-ids.json: { "<email>": "<resumeId>" }). This keeps the
// load test faithful to prod WITHOUT granting `authenticated` any resume-write
// permission. Run `node load-testing/tools/seed-resumes.mjs` before this scenario.
const RESUME_IDS = JSON.parse(open(__ENV.RESUME_IDS_FILE || '../fixtures/resume-ids.json'));

export function setup() {
  const resolved = preflight(__ENV);
  warnIfMeritInert(resolved, false);

  const target = clamp('maxExecutingAnalyses', __ENV.TARGET !== undefined ? Number(__ENV.TARGET) : 5, (m) => console.warn(m));

  // Rungs 500/1000 require the explicit high-concurrency override AND lower rungs passed.
  assertExecutingRungAllowed(target, __ENV);

  if (MODE === 'real') {
    // Cap real provider spend for THIS stage. Estimate = concurrent * ~waves.
    // Conservative: assume each VU completes ~ (stage_seconds / avg_run_seconds) runs.
    const estRuns = Number(__ENV.EST_RUNS || target); // operator supplies expected total real runs
    assertRealSpendUnderCap(estRuns, TIER, (m) => console.log(m));
    console.log(`[wl10] MODE=real — ${estRuns} real analyses projected, tier=${TIER}. $5 cap enforced.`);
  } else {
    console.log('[wl10] MODE=mock — expecting AI_TEST_MODE=true on the target (no real provider cost).');
  }

  return { url: resolved.url, anonKey: resolved.anonKey, users: USERS };
}

export default function (data) {
  const s = session(data);
  if (!s) {
    businessErrors.add(1);
    return;
  }

  acceptedRuns.add(1);
  // Use this user's PRE-SEEDED resume id (created server-side via service role by
  // tools/seed-resumes.mjs). No client-side resume insert — matches prod grants.
  const resumeId = RESUME_IDS[s.email];
  if (!resumeId) {
    businessErrors.add(1); // missing seed — run tools/seed-resumes.mjs first
    return;
  }
  const body = JSON.stringify({
    resumeId,
    resumeText: RESUME_TEXT,
    userId: s.userId,
    stream: true,
    attemptNonce: `${__VU}-${__ITER}-${Date.now()}`,
  });

  const start = Date.now();
  // k6 returns the full accumulated SSE body once the stream closes.
  const res = http.post(`${data.url}/functions/v1/analyze-resume`, body, {
    headers: authHeaders(data.anonKey, s.accessToken, { Accept: 'text/event-stream' }),
    tags: { name: 'analyze-resume:stream' },
    timeout: '180s',
  });
  const dur = Date.now() - start;

  recordHttp(res, { acceptStatuses: [200] });
  if (res.status === 429) providerRateLimited.add(1);

  // A completed streaming analysis emits a `{"type":"complete"}` SSE event.
  const completed = res.status === 200 && typeof res.body === 'string' && res.body.indexOf('"type":"complete"') !== -1;
  const inStreamError = typeof res.body === 'string' && res.body.indexOf('"type":"error"') !== -1;

  if (completed) {
    completedRuns.add(1);
    analysisCompletionMs.add(dur);
    if (MODE === 'real') {
      const per = EST_COST_PER_REAL_ANALYSIS_USD[TIER] ?? EST_COST_PER_REAL_ANALYSIS_USD.elite;
      estimatedProviderCostUsdMilli.add(Math.round(per * 1000));
    }
  } else {
    failedRuns.add(1);
    if (inStreamError) businessErrors.add(1);
  }

  firstClickCompletion.add(check(null, { 'analysis completed': () => completed }));
}
