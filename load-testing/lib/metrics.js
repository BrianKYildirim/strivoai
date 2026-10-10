// ── Custom k6 metrics — one place to define every measured dimension ─────────
//
// The Part 2 metric list maps onto k6 metric types:
//   - Trend   -> latency distributions (p50/p95/p99) & durations
//   - Counter -> accepted / completed / failed / recovered / duplicates
//   - Gauge   -> instantaneous depth (queue depth, active conns)
//   - Rate    -> first-click completion rate, error rate
//
// Scenarios import the metrics they need and record into them. The threshold
// names in config/thresholds.js reference the Counters defined here.

import { Trend, Counter, Gauge, Rate } from 'k6/metrics';

// ── Throughput / outcome counters ────────────────────────────────────────────
export const acceptedRequests = new Counter('accepted_requests');
export const acceptedRuns = new Counter('accepted_runs');
export const completedRuns = new Counter('completed_runs');
export const failedRuns = new Counter('failed_runs');
export const recoveredRuns = new Counter('recovered_runs'); // auto-recovered

// ── Safety-invariant counters (any > 0 aborts the stage) ─────────────────────
export const businessErrors = new Counter('business_errors'); // raw error to user, etc.
export const duplicateJobs = new Counter('duplicate_jobs');
export const duplicateMeritCharges = new Counter('duplicate_merit_charges');
export const lostAcceptedRuns = new Counter('lost_accepted_runs');
export const stuckRuns = new Counter('stuck_runs');

// ── Latency trends (k6 reports p50/p90/p95/p99 for every Trend) ──────────────
export const analysisCompletionMs = new Trend('analysis_completion_ms', true);
export const queueWaitMs = new Trend('queue_wait_ms', true);
export const dbLatencyMs = new Trend('db_latency_ms', true);
export const uploadDurationMs = new Trend('upload_duration_ms', true);
export const pollLatencyMs = new Trend('poll_latency_ms', true);

// ── Depth / usage gauges (sampled by measure-supabase.mjs side-channel) ──────
export const queueDepth = new Gauge('queue_depth');
export const dbConnectionsInUse = new Gauge('db_connections_in_use');
export const realtimeConnections = new Gauge('realtime_connections');
export const edgeConcurrency = new Gauge('edge_concurrency');

// ── Rates ────────────────────────────────────────────────────────────────────
export const firstClickCompletion = new Rate('first_click_completion');
export const edgeTimeouts = new Counter('edge_function_timeouts');
export const providerRateLimited = new Counter('provider_rate_limited'); // 429 from AI

// ── Cost tracking (incremented per real-provider call in real-AI scenarios) ──
export const estimatedProviderCostUsdMilli = new Counter('est_provider_cost_usd_milli'); // $ * 1000

/**
 * Classify an HTTP response and record shared outcome metrics.
 * Returns true if the response is "accepted" (2xx / expected async 202).
 */
export function recordHttp(res, { acceptStatuses = [200, 201, 202] } = {}) {
  acceptedRequests.add(1);
  const ok = acceptStatuses.includes(res.status);
  if (res.status === 429) providerRateLimited.add(1);
  if (res.status === 504 || res.status === 408) edgeTimeouts.add(1);
  return ok;
}
