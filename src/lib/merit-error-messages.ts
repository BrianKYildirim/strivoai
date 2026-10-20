/**
 * Single shared error-class toast taxonomy for Merit-deducting AI flows (NFR-04).
 *
 * Maps an HTTP status or error-class key to a user-facing { title, description }
 * shaped for `sonner` `toast.error(title, { description })`. The refund wording
 * is reconciled per D-10 / RESEARCH Pattern 3: every FORCED-REFUNDABLE AI error
 * (5xx, 529, 408, AbortError, network/timeout) follows a deduct-then-refund path,
 * so its copy says "your Merits were refunded" — NOT "no charge". "No charge"
 * applies ONLY to the rate-limit (429) never-deduct case. Validation/4xx copy
 * must never mention merits, refunds, or charges (D-10 refund-mention rule).
 *
 * Hard rule (NFR-04): no return value's title or description is ever the generic
 * "Something went wrong" — unmapped refundable AI errors fall back to the 5xx
 * message, and any other unmapped key falls back to the validation message.
 *
 * EXCEPTION to the refund wording (quick task 260713-2ay / D3): the copy above assumes every
 * refundable-class error actually WAS refunded. That assumption is false whenever the client
 * never heard back from the server (a client-side timeout, a dropped connection) — the run may
 * well have SUCCEEDED and charged. `useMerits.rollback()` only restores a React-Query cache;
 * it cannot refund anything. So when a caller can PROVE no refund happened, it passes
 * `meritsRefunded: false` and gets copy that makes no refund claim and points the user at
 * their History instead. `undefined` (the default, and every existing caller) keeps today's
 * wording byte-identical.
 */

export interface MeritErrorMessage {
  title: string;
  description?: string;
}

export interface MeritErrorContext {
  /** Pre-formatted reset date string for the 402 out-of-Merits message. */
  resetDate?: string;
  /** Retry-after window in seconds for the 429 rate-cap message. */
  retryAfterSec?: number;
  /**
   * Whether the SERVER confirmed it refunded the Merit (`merits_refunded` in the error body).
   *
   * - `true`  → refunded: keep the "your Merits were refunded" wording.
   * - `false` → EXPLICITLY not refunded (or unknowable): use the unconfirmed wording, which
   *             makes NO refund claim and tells the user to check History — the analysis may
   *             have completed and been charged.
   * - `undefined` → unknown: preserve legacy wording (every pre-existing caller).
   */
  meritsRefunded?: boolean;
}

/** Refundable AI-error wording (deduct-then-refund path) — shared across 5xx/529/408/network. */
const SERVER_ERROR: MeritErrorMessage = {
  title: 'Analysis hit a server error',
  description: 'Our service had a hiccup — your Merits were refunded. Please try again.',
};

const SERVICE_BUSY: MeritErrorMessage = {
  title: 'Analysis service is busy',
  description: 'High demand right now — your Merits were refunded. Try again in a moment.',
};

const TIMED_OUT: MeritErrorMessage = {
  title: 'Analysis timed out',
  description: 'That took too long — your Merits were refunded. Please try again.',
};

const CONNECTION_LOST: MeritErrorMessage = {
  title: 'Connection lost',
  description:
    "We couldn't reach the analysis service — your Merits were refunded. Check your connection and retry.",
};

const VALIDATION: MeritErrorMessage = {
  title: "We couldn't process that",
  description: "Your input couldn't be parsed — please check it and try again.",
};

/**
 * UNCONFIRMED-REFUND siblings (quick task 260713-2ay / D3).
 *
 * Used ONLY when the caller explicitly proves no refund was confirmed (`meritsRefunded: false`).
 * They must never assert a refund. Instead they give the user the actionable next step: the run
 * may have completed and charged, so check History BEFORE spending Merits on a re-run.
 */
const SERVER_ERROR_UNCONFIRMED: MeritErrorMessage = {
  title: 'Analysis hit a server error',
  description:
    'Our service had a hiccup. If it completed, it will appear in your History — check there before running it again.',
};

const SERVICE_BUSY_UNCONFIRMED: MeritErrorMessage = {
  title: 'Analysis service is busy',
  description:
    'High demand right now. If it completed, it will appear in your History — check there before running it again.',
};

const TIMED_OUT_UNCONFIRMED: MeritErrorMessage = {
  title: 'Analysis timed out',
  description:
    'That took too long. If it completed, it will appear in your History — check there before running it again.',
};

const CONNECTION_LOST_UNCONFIRMED: MeritErrorMessage = {
  title: 'Connection lost',
  description:
    "We couldn't reach the analysis service. If it completed, it will appear in your History — check there before running it again.",
};

/** Non-refundable network/connection error-class string keys. */
const NETWORK_KEYS = new Set(['aborterror', 'network', 'timeout', 'networkerror', 'failed to fetch']);

export function getMeritErrorMessage(
  codeOrStatus: number | string,
  ctx?: MeritErrorContext,
): MeritErrorMessage {
  // D3: branch to the no-refund-claim copy ONLY on an EXPLICIT negative. `undefined` (every
  // pre-existing caller on every other page) keeps the legacy refunded wording byte-identical.
  const refundUnconfirmed = ctx?.meritsRefunded === false;

  // String error-class keys (e.g. 'AbortError', 'network', 'timeout').
  if (typeof codeOrStatus === 'string') {
    const key = codeOrStatus.trim().toLowerCase();
    if (NETWORK_KEYS.has(key)) return refundUnconfirmed ? CONNECTION_LOST_UNCONFIRMED : CONNECTION_LOST;
    // Unknown string key → default to the refundable 5xx message (never generic).
    return refundUnconfirmed ? SERVER_ERROR_UNCONFIRMED : SERVER_ERROR;
  }

  const status = codeOrStatus;

  // Out of Merits (402) — interpolate reset date when present, else date-less fallback.
  if (status === 402) {
    return {
      title: "You're out of Merits",
      description: ctx?.resetDate
        ? `Your balance resets on ${ctx.resetDate}. Buy a top-up pack to keep going.`
        : 'Upgrade or buy a top-up pack to keep going.',
    };
  }

  // Rate cap (429) — never deducts, so "No charge".
  if (status === 429) {
    const secs = ctx?.retryAfterSec ?? 30;
    return {
      title: 'Analysis rate cap reached',
      description: `Try again in ${secs}s. No charge.`,
    };
  }

  // Forced-refundable AI errors (same axis as isRefundableAnthropicError).
  // The refund CLAIM is conditional (D3) — the error CLASS is not.
  if (status === 408) return refundUnconfirmed ? TIMED_OUT_UNCONFIRMED : TIMED_OUT;
  if (status === 529) return refundUnconfirmed ? SERVICE_BUSY_UNCONFIRMED : SERVICE_BUSY;
  if (status >= 500) return refundUnconfirmed ? SERVER_ERROR_UNCONFIRMED : SERVER_ERROR;

  // All other 4xx → validation copy (must NOT mention merits/refund/charge).
  if (status >= 400) return VALIDATION;

  // Any unmapped/non-error status → default to validation copy (never generic).
  return VALIDATION;
}
