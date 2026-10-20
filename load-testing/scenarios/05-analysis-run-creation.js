// ── Workload 5: Analysis-run creation (QUEUED ANALYSES) ──────────────────────
//
// DIMENSION: queued analyses (queue depth). Submits resume-analysis JOBS via
// submit-resume-analysis-job, which enqueues a row in analysis_jobs and returns
// 202 { jobId }. This measures how fast the system ACCEPTS runs into the queue —
// distinct from how many run the model at once (workload 10). Each VU uses a
// UNIQUE resumeId so submissions are NOT deduped (duplicate dedup is workload 6).
//
// Pair with tools/measure-supabase.mjs to sample queue depth during the run.
// Watch for: 202 accept-rate holding, no lost accepts, per-user 429 rate limits.
//
// Run (one rung):
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e PROFILE=ramp -e TARGET=25 \
//     scenarios/05-analysis-run-creation.js

import http from 'k6/http';
import { check } from 'k6';
import { preflight, warnIfMeritInert } from '../lib/guards.js';
import { buildVuOptions } from '../lib/scenario.js';
import { session } from '../lib/session.js';
import { authHeaders } from '../lib/auth.js';
import {
  acceptedRuns,
  businessErrors,
  recordHttp,
  firstClickCompletion,
  providerRateLimited,
} from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));
const RESUME_TEXT = open(__ENV.RESUME_TEXT_FILE || '../fixtures/resumes/synthetic-resume.txt');

export const options = buildVuOptions({
  env: __ENV,
  capDimension: 'maxQueuedAnalyses',
  latencyClass: 'submit',
  defaultTarget: 25,
});

export function setup() {
  const resolved = preflight(__ENV);
  warnIfMeritInert(resolved, false); // enqueue works with merit on OR off
  return { url: resolved.url, anonKey: resolved.anonKey, users: USERS };
}

export default function (data) {
  const s = session(data);
  if (!s) {
    businessErrors.add(1);
    return;
  }

  const resumeId = `lt-run-${s.userId}-${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({
    userId: s.userId, // MUST equal JWT userId or the fn 403s
    resumeId,
    resumeText: RESUME_TEXT,
    previousSuggestions: [],
    previousScore: null,
  });

  const res = http.post(`${data.url}/functions/v1/submit-resume-analysis-job`, body, {
    headers: authHeaders(data.anonKey, s.accessToken),
    tags: { name: 'submit-resume-analysis-job' },
    timeout: '30s',
  });

  const accepted = recordHttp(res, { acceptStatuses: [202] });
  if (res.status === 429) providerRateLimited.add(1); // per-user submit rate limit

  const ok = check(res, {
    'submit 202': (r) => r.status === 202,
    'submit returns jobId': (r) => {
      try {
        return !!r.json('jobId');
      } catch {
        return false;
      }
    },
  });
  if (accepted && ok) acceptedRuns.add(1);
  firstClickCompletion.add(ok);
}
