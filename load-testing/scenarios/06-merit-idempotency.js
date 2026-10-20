// ── Workload 6: Merit deduction & idempotency (DUPLICATE-SUBMISSION test) ─────
//
// SAFETY-CRITICAL correctness test, not a throughput ladder. Fires CONCURRENT
// DUPLICATE submissions for the SAME resumeId and asserts the system charges
// once and creates one job:
//   - submit-resume-analysis-job dedups an active job for a resumeId -> the two
//     concurrent submits must return the SAME jobId (one fresh, one reused).
//   - Two DIFFERENT jobIds for one resumeId => duplicate_jobs (ABORTS the stage).
//
// Merit-charge correctness (one -N deduction per intent, no double-charge) is
// verified out-of-band by tools/measure-supabase.mjs against merit_transactions.
// IMPORTANT: on Preview MERIT_SYSTEM_ENABLED=false, so the merit ledger is inert
// and duplicate-CHARGE cannot be measured there — run merit conclusions against a
// throwaway merit-ON project. Job-level dedup IS measurable on Preview.
//
// Run:
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e PROFILE=ramp -e TARGET=10 \
//     -e DUP_FANOUT=3 scenarios/06-merit-idempotency.js

import http from 'k6/http';
import { check } from 'k6';
import { preflight, warnIfMeritInert } from '../lib/guards.js';
import { buildVuOptions } from '../lib/scenario.js';
import { session } from '../lib/session.js';
import { authHeaders } from '../lib/auth.js';
import {
  acceptedRuns,
  duplicateJobs,
  businessErrors,
  recordHttp,
  firstClickCompletion,
} from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));
const RESUME_TEXT = open(__ENV.RESUME_TEXT_FILE || '../fixtures/resumes/synthetic-resume.txt');
const DUP_FANOUT = Math.max(2, Number(__ENV.DUP_FANOUT || 3)); // concurrent duplicates

export const options = buildVuOptions({
  env: __ENV,
  capDimension: 'maxQueuedAnalyses',
  latencyClass: 'submit',
  defaultTarget: 10,
});

export function setup() {
  const resolved = preflight(__ENV);
  warnIfMeritInert(resolved, true); // this workload's charge assertions NEED merit ON
  return { url: resolved.url, anonKey: resolved.anonKey, users: USERS };
}

export default function (data) {
  const s = session(data);
  if (!s) {
    businessErrors.add(1);
    return;
  }

  // One stable intent per (VU,iteration): the same resumeId submitted N times AT
  // ONCE. This is the "user double-clicks / retries" scenario.
  const resumeId = `lt-dup-${s.userId}-${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({
    userId: s.userId,
    resumeId,
    resumeText: RESUME_TEXT,
    previousSuggestions: [],
    previousScore: null,
  });
  const headers = authHeaders(data.anonKey, s.accessToken);

  const reqs = [];
  for (let i = 0; i < DUP_FANOUT; i++) {
    reqs.push({
      method: 'POST',
      url: `${data.url}/functions/v1/submit-resume-analysis-job`,
      body,
      params: { headers, tags: { name: 'dup-submit' }, timeout: '30s' },
    });
  }
  const responses = http.batch(reqs);

  const jobIds = new Set();
  let acceptedCount = 0;
  for (const res of responses) {
    recordHttp(res, { acceptStatuses: [202] });
    if (res.status === 202) {
      acceptedCount++;
      try {
        const id = res.json('jobId');
        if (id) jobIds.add(id);
      } catch {
        /* ignore parse */
      }
    }
  }

  // INVARIANT: N concurrent duplicates for one resumeId => exactly ONE distinct job.
  const distinct = jobIds.size;
  const dedupedCorrectly = check(null, {
    'duplicate submit -> single job': () => distinct <= 1,
  });
  if (!dedupedCorrectly) {
    duplicateJobs.add(distinct - 1); // > 0 aborts the stage via threshold
    businessErrors.add(1);
  }
  if (acceptedCount > 0) acceptedRuns.add(1); // one logical accepted run
  firstClickCompletion.add(dedupedCorrectly);
}
