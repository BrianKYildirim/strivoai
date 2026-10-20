// ── Reusable k6 stage/profile builders — ramp / spike / soak / recovery ──────
//
// The Part 2 ladder runs ONE rung per invocation (no auto-escalation). Each
// builder returns a k6 `stages` array (for the ramping-vus / ramping-arrival-rate
// executors) sized to a single target passed in. The operator sets the target
// per stage; the builder never chooses the next rung.
//
// Durations are clamped by the caller against CAPS.maxStageDurationSec.

/**
 * RAMP: gentle linear climb to `target`, hold, gentle down. Measures steady
 * behavior at a level. Use for every ladder rung's primary measurement.
 */
export function ramp(target, { rampUpSec = 60, holdSec = 180, rampDownSec = 30 } = {}) {
  return [
    { duration: `${rampUpSec}s`, target },
    { duration: `${holdSec}s`, target },
    { duration: `${rampDownSec}s`, target: 0 },
  ];
}

/**
 * SPIKE: near-instant jump to `target`, short hold, near-instant drop. Verifies
 * the system queues rather than loses work, and does not crash. Run only at the
 * highest already-verified-safe level (Part 3).
 */
export function spike(target, { baseline = Math.max(1, Math.floor(target * 0.05)), spikeSec = 60, holdSec = 90 } = {}) {
  return [
    { duration: '30s', target: baseline },
    { duration: '5s', target }, // sharp spike
    { duration: `${spikeSec}s`, target },
    { duration: '5s', target: baseline },
    { duration: `${holdSec}s`, target: baseline }, // observe recovery at baseline
    { duration: '15s', target: 0 },
  ];
}

/**
 * SOAK: hold `target` for a sustained (but capped) window to surface slow leaks,
 * connection exhaustion, and queue drift that a short ramp misses.
 */
export function soak(target, { rampUpSec = 60, holdSec = 900 } = {}) {
  return [
    { duration: `${rampUpSec}s`, target },
    { duration: `${holdSec}s`, target },
    { duration: '30s', target: 0 },
  ];
}

/**
 * RECOVERY: drive to `target`, then drop to a trickle and HOLD there to prove the
 * system drains its queue, releases connections, and returns to baseline latency
 * after traffic falls (Part 3). Pair with measure-supabase.mjs to watch queue
 * depth fall back to ~0.
 */
export function recovery(target, { holdHighSec = 120, trickle = Math.max(1, Math.floor(target * 0.02)), observeSec = 300 } = {}) {
  return [
    { duration: '30s', target },
    { duration: `${holdHighSec}s`, target },
    { duration: '10s', target: trickle }, // traffic falls off a cliff
    { duration: `${observeSec}s`, target: trickle }, // observe drain + recovery
    { duration: '15s', target: 0 },
  ];
}

/**
 * Arrival-rate stages for RPS-shaped workloads (open model). Returns stages for
 * the `ramping-arrival-rate` executor where `target` is requests/sec.
 */
export function rpsRamp(targetRps, { rampUpSec = 60, holdSec = 180 } = {}) {
  return [
    { duration: `${rampUpSec}s`, target: targetRps },
    { duration: `${holdSec}s`, target: targetRps },
    { duration: '30s', target: 0 },
  ];
}

// Named ladder rungs (documentation-as-code — the harness never auto-advances).
export const LADDER = {
  executingAnalyses: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  browsingSessions: [100, 500, 1000, 2500, 5000, 10000],
};
