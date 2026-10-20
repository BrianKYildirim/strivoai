// ── Preflight guards — refuse to send traffic unless the target is CONFIRMED ─
//
// Layered defense so no scenario can fire against an unconfirmed / production
// target, and so a stage cannot silently exceed its planned load:
//   1. resolveEnv()          — rejects production ref & unlisted TARGET_ENV.
//   2. confirmTarget()       — operator must echo the exact project ref back via
//                              CONFIRM_TARGET, proving they looked at the target.
//   3. clamp()/assert*()     — hard caps (config/safety-limits.js).
//
// Every scenario calls preflight() in its k6 setup() before generating load.

import { resolveEnv } from '../config/environments.js';

/**
 * Resolve + validate the target and require an explicit human confirmation.
 * @param {object} source - __ENV (k6) or process.env (node)
 * @returns {{ env, url, anonKey, ref }}
 * @throws if the target is missing/prod/unconfirmed.
 */
export function preflight(source) {
  const resolved = resolveEnv(source);

  const confirm = source && source.CONFIRM_TARGET;
  if (!confirm) {
    throw new Error(
      `[guard] CONFIRM_TARGET is required. Set CONFIRM_TARGET="${resolved.ref}" to acknowledge you are ` +
        `sending traffic to project "${resolved.ref}" (${resolved.env}). This is the "confirm the target ` +
        'before sending traffic" gate.',
    );
  }
  if (confirm !== resolved.ref) {
    throw new Error(
      `[guard] CONFIRM_TARGET="${confirm}" does not match the resolved project ref "${resolved.ref}". ` +
        'Refusing to run — the target you confirmed is not the target you are pointed at.',
    );
  }

  console.log(
    `[guard] Target CONFIRMED: env=${resolved.env} ref=${resolved.ref} url=${resolved.url}. ` +
      'Production is blocklisted and cannot reach this point.',
  );
  return resolved;
}

/**
 * Warn (loudly, once) when a scenario that needs a real merit ledger is pointed
 * at Preview, where MERIT_SYSTEM_ENABLED=false makes merit accounting inert.
 */
export function warnIfMeritInert(resolved, needsMerit) {
  if (needsMerit && resolved.env === 'preview') {
    console.warn(
      '[guard] NOTE: Preview has MERIT_SYSTEM_ENABLED=false — merit deduction/refund/idempotency is ' +
        'INERT here. Duplicate-merit-charge cannot be measured on Preview. Use a throwaway merit-ON project ' +
        'for workload #6 conclusions.',
    );
  }
}
