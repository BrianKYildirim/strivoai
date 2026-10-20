// ── HARD safety caps — a stage physically cannot exceed these ────────────────
//
// Every scenario clamps its requested load to these ceilings BEFORE k6 starts,
// so a fat-fingered env var (VUS=100000) can never fire more than the cap. The
// clamp is logged loudly. These are deliberately conservative; raise them only
// with an explicit, reviewed reason.

export const CAPS = {
  // Concurrency ceilings, PER DIMENSION. These are independent — 5000 browsing
  // VUs does NOT authorize 5000 AI analyses (see docs: dimensions are separate).
  maxBrowsingVUs: 10000, // website/dashboard read traffic (dimension: sessions)
  maxRps: 2000, // requests/second across a scenario (dimension: RPS)
  maxConcurrentUploads: 500, // simultaneous PDF uploads (dimension: uploads)
  maxQueuedAnalyses: 1000, // analysis jobs enqueued (dimension: queue depth)
  maxExecutingAnalyses: 250, // analyses running the model AT ONCE (dimension: executing)
  //   ^ real-AI executing analyses are the most expensive & rate-limited
  //     dimension; capped well below browsing. 500/1000 executing is gated
  //     behind an explicit REAL_AI_HIGH_CONCURRENCY=confirmed override.
  maxRealtimeConns: 5000, // concurrent realtime websocket subscriptions
  maxDbConnections: 60, // do not exceed the pooler ceiling for the tier

  // Duration ceilings — no single stage runs longer than this.
  maxStageDurationSec: 900, // 15 min hard cap per stage
  maxSoakDurationSec: 1800, // 30 min hard cap for the "short soak"

  // Cost ceilings.
  maxRealProviderSpendUsd: 5, // <<< operator-set hard cap for REAL Anthropic calls
  maxEstimatedInfraSpendUsd: 25, // abort a stage if projected infra cost exceeds this
};

// Executing-analysis ladder rungs above this require the explicit override,
// because they imply real provider spend and rate-limit pressure.
export const REAL_AI_HIGH_CONCURRENCY_RUNGS = [500, 1000];

/**
 * Clamp a requested value to its cap. Logs loudly when clamping.
 * @param {string} dimension - key in CAPS
 * @param {number} requested
 * @param {(msg:string)=>void} logFn
 * @returns {number} the clamped value
 */
export function clamp(dimension, requested, logFn) {
  const cap = CAPS[dimension];
  if (typeof cap !== 'number') {
    throw new Error(`[safety] unknown capped dimension "${dimension}"`);
  }
  const n = Number(requested);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`[safety] ${dimension} must be a non-negative number, got "${requested}"`);
  }
  if (n > cap) {
    const msg = `[safety] CLAMPED ${dimension}: requested ${n} exceeds hard cap ${cap}. Using ${cap}.`;
    if (logFn) logFn(msg);
    else console.warn(msg);
    return cap;
  }
  return n;
}

/**
 * Guard the executing-analysis dimension: rungs >= 500 require an explicit,
 * typed confirmation because they cost real provider money / hit rate limits.
 */
export function assertExecutingRungAllowed(rung, source) {
  if (REAL_AI_HIGH_CONCURRENCY_RUNGS.includes(Number(rung))) {
    const confirmed = source && source.REAL_AI_HIGH_CONCURRENCY === 'confirmed';
    if (!confirmed) {
      throw new Error(
        `[safety] executing-analyses rung ${rung} requires REAL_AI_HIGH_CONCURRENCY=confirmed ` +
          'AND all lower rungs to have passed. Refusing to auto-escalate.',
      );
    }
  }
}

/**
 * Estimated Anthropic cost per resume analysis run (worst-case, mirrors
 * scripts/validate-performance.mjs CALL_CONFIGS + Sonnet pricing). Used to
 * pre-flight-block a real-AI stage whose projected spend exceeds the cap.
 */
export const EST_COST_PER_REAL_ANALYSIS_USD = {
  free: 0.055, // worst-case ~; typical ~65% of this
  elite: 0.075,
};

/** Project real-provider spend for N real analyses and assert under the cap. */
export function assertRealSpendUnderCap(numAnalyses, tier, logFn) {
  const per = EST_COST_PER_REAL_ANALYSIS_USD[tier] ?? EST_COST_PER_REAL_ANALYSIS_USD.elite;
  const projected = numAnalyses * per;
  const cap = CAPS.maxRealProviderSpendUsd;
  const msg = `[safety] projected real-provider spend for ${numAnalyses} ${tier} analyses ≈ $${projected.toFixed(2)} (cap $${cap}).`;
  if (logFn) logFn(msg);
  if (projected > cap) {
    throw new Error(
      `${msg} REFUSING — exceeds the $${cap} real-provider cap. Reduce N, mock the provider, or raise the cap deliberately.`,
    );
  }
  return projected;
}
