// ── k6 thresholds → AUTOMATIC ABORT when a stage degrades materially ─────────
//
// k6 `thresholds` with `abortOnFail: true` stop the test the instant a stage
// crosses an unsafe line, so the harness enforces "stop if degradation becomes
// material" mechanically rather than relying on a human watching a dashboard.
//
// delayAbortEval gives a short grace window so a single cold-start blip does not
// abort a whole stage.

// Latency ceilings differ by workload class: a cheap DB read should be fast; a
// real AI analysis is expected to take tens of seconds.
export const LATENCY_CLASS = {
  // read/api-shaped endpoints (website, auth, polling, db reads)
  fast: {
    p95Ms: 1500,
    p99Ms: 3000,
  },
  // upload / extraction — heavier but still sub-request-timeout
  medium: {
    p95Ms: 8000,
    p99Ms: 15000,
  },
  // analysis creation / job submit (accepts fast, work happens async)
  submit: {
    p95Ms: 3000,
    p99Ms: 6000,
  },
  // full real AI analysis wall-clock (mocked mode is far faster; real ~35-50s)
  analysis: {
    p95Ms: 60000,
    p99Ms: 90000,
  },
};

// Error-rate ceiling shared across scenarios. A material rise aborts the stage.
export const MAX_ERROR_RATE = 0.02; // 2%

// Grace window before an abort is evaluated (lets cold starts settle).
const DELAY_ABORT_EVAL = '20s';

/**
 * Build a k6 `thresholds` object for a scenario.
 * @param {'fast'|'medium'|'submit'|'analysis'} latencyClass
 * @param {object} [opts]
 * @param {number} [opts.maxErrorRate]
 * @param {boolean} [opts.abort=true] - abortOnFail
 * @returns {object} k6 thresholds
 */
export function buildThresholds(latencyClass, opts = {}) {
  const cls = LATENCY_CLASS[latencyClass];
  if (!cls) throw new Error(`[thresholds] unknown latency class "${latencyClass}"`);
  const abortOnFail = opts.abort !== false;
  const maxErrorRate = opts.maxErrorRate ?? MAX_ERROR_RATE;

  return {
    // Built-in HTTP request duration.
    http_req_duration: [
      { threshold: `p(95)<${cls.p95Ms}`, abortOnFail, delayAbortEval: DELAY_ABORT_EVAL },
      { threshold: `p(99)<${cls.p99Ms}`, abortOnFail, delayAbortEval: DELAY_ABORT_EVAL },
    ],
    // Built-in failure rate.
    http_req_failed: [
      { threshold: `rate<${maxErrorRate}`, abortOnFail, delayAbortEval: DELAY_ABORT_EVAL },
    ],
    // Custom business error rate (defined in lib/metrics.js) — e.g. an accepted
    // job that was lost, a duplicate charge, an unretrievable result.
    business_errors: [{ threshold: 'count<1', abortOnFail: true }],
    // Safety-invariant violations must abort IMMEDIATELY (no grace).
    duplicate_jobs: [{ threshold: 'count<1', abortOnFail: true }],
    duplicate_merit_charges: [{ threshold: 'count<1', abortOnFail: true }],
    lost_accepted_runs: [{ threshold: 'count<1', abortOnFail: true }],
  };
}
