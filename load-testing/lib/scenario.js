// ── Scenario builder — turns PROFILE + TARGET env into a k6 options block ────
//
// Centralizes: profile selection (ramp/spike/soak/recovery), the hard clamp
// against CAPS, executor choice (closed VU model vs open arrival-rate), and the
// abort thresholds. Scenarios call buildOptions() and export the result.

import { ramp, spike, soak, recovery, rpsRamp } from '../profiles/stages.js';
import { clamp } from '../config/safety-limits.js';
import { buildThresholds } from '../config/thresholds.js';

function pickVuProfile(profile, target, env) {
  // Optional short-duration overrides (e.g. a tiny smoke rung): STAGE_RAMP_UP_SEC,
  // STAGE_HOLD_SEC, STAGE_RAMP_DOWN_SEC. Omitted → the profile's normal defaults.
  const num = (k) => (env && env[k] !== undefined ? Number(env[k]) : undefined);
  const rampOpts = {};
  if (num('STAGE_RAMP_UP_SEC') !== undefined) rampOpts.rampUpSec = num('STAGE_RAMP_UP_SEC');
  if (num('STAGE_HOLD_SEC') !== undefined) rampOpts.holdSec = num('STAGE_HOLD_SEC');
  if (num('STAGE_RAMP_DOWN_SEC') !== undefined) rampOpts.rampDownSec = num('STAGE_RAMP_DOWN_SEC');
  switch (profile) {
    case 'spike':
      return spike(target);
    case 'soak':
      return soak(target, rampOpts);
    case 'recovery':
      return recovery(target);
    case 'ramp':
    default:
      return ramp(target, rampOpts);
  }
}

/**
 * Build a k6 options object for a VU-concurrency scenario (closed model).
 * @param {object} p
 * @param {object} p.env            - __ENV
 * @param {string} p.capDimension   - key in CAPS to clamp TARGET against
 * @param {'fast'|'medium'|'submit'|'analysis'} p.latencyClass
 * @param {number} [p.defaultTarget]
 * @param {number} [p.gracefulStopSec=60]
 */
export function buildVuOptions({ env, capDimension, latencyClass, defaultTarget = 1, gracefulStopSec = 60 }) {
  const profile = env.PROFILE || 'ramp';
  const requested = env.TARGET !== undefined ? Number(env.TARGET) : defaultTarget;
  const target = clamp(capDimension, requested, (m) => console.warn(m));
  const stages = pickVuProfile(profile, target, env);

  return {
    scenarios: {
      main: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages,
        gracefulRampDown: `${gracefulStopSec}s`,
        gracefulStop: `${gracefulStopSec}s`,
      },
    },
    thresholds: buildThresholds(latencyClass),
    // Never let a scenario run past the hard duration cap even if stages sum higher.
    // (k6 enforces stage sums; this is a belt-and-suspenders note for reviewers.)
    tags: { profile, target: String(target), dimension: capDimension },
  };
}

/**
 * Build a k6 options object for an RPS scenario (open arrival-rate model).
 */
export function buildRpsOptions({ env, latencyClass, defaultRps = 10, preAllocatedVUs = 50, maxVUs = 500 }) {
  const requested = env.TARGET !== undefined ? Number(env.TARGET) : defaultRps;
  const targetRps = clamp('maxRps', requested, (m) => console.warn(m));

  return {
    scenarios: {
      main: {
        executor: 'ramping-arrival-rate',
        startRate: 0,
        timeUnit: '1s',
        preAllocatedVUs,
        maxVUs,
        stages: rpsRamp(targetRps),
      },
    },
    thresholds: buildThresholds(latencyClass),
    tags: { profile: 'rps-ramp', target: String(targetRps), dimension: 'maxRps' },
  };
}
