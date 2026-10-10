/**
 * Quick task 260713-2ay — error copy must be HONEST.
 *
 * Two production defects are locked here:
 *
 *  S3 — every failure reported as a 500. `parseSupabaseFunctionError` threw the HTTP status
 *       away, so LinkedInGrader regex-scraped a 3-digit code out of `error.message`. No server
 *       message contains a bare status code, so the scrape ALWAYS missed and every error —
 *       timeouts included — fell through to 500 and the generic "server error" copy. The
 *       TIMED_OUT (408) branch was literally unreachable in production.
 *
 *  S4 — "your Merits were refunded" claimed on failures where NOTHING was refunded.
 *       `useMerits.rollback()` only restores a React-Query cache; it cannot refund. When the
 *       client times out or the connection drops, the run may well have SUCCEEDED and charged
 *       — telling that user their Merits came back is simply false.
 */
import { describe, expect, it } from 'vitest';
import { getMeritErrorMessage } from '@/lib/merit-error-messages';

describe('getMeritErrorMessage — status mapping (S3 regression lock)', () => {
  it('408 maps to the TIMEOUT copy, NOT the generic server-error copy', () => {
    const timedOut = getMeritErrorMessage(408);
    const serverError = getMeritErrorMessage(500);

    expect(timedOut.title).toBe('Analysis timed out');
    expect(timedOut.title).not.toBe(serverError.title);
  });

  it('529 maps to the busy copy, and 5xx to the server-error copy', () => {
    expect(getMeritErrorMessage(529).title).toBe('Analysis service is busy');
    expect(getMeritErrorMessage(500).title).toBe('Analysis hit a server error');
    expect(getMeritErrorMessage(503).title).toBe('Analysis hit a server error');
  });
});

describe('getMeritErrorMessage — refund claims must be earned (S4 / D3)', () => {
  it('a CONFIRMED refund still says the Merits were refunded', () => {
    const msg = getMeritErrorMessage(408, { meritsRefunded: true });
    expect(msg.description).toContain('refunded');
  });

  it('an UNCONFIRMED refund makes NO refund claim — this is the "stop lying" assertion', () => {
    const msg = getMeritErrorMessage(408, { meritsRefunded: false });

    // The whole point: not a single word of this may assert a refund happened.
    expect(msg.description?.toLowerCase()).not.toContain('refund');
    // ...and it must still be the TIMEOUT class, and still actionable.
    expect(msg.title).toBe('Analysis timed out');
    expect(msg.description).toContain('History');
  });

  it.each([
    [500, 'server error'],
    [529, 'busy'],
  ])('status %i with an unconfirmed refund claims no refund', (status) => {
    const msg = getMeritErrorMessage(status, { meritsRefunded: false });
    expect(msg.description?.toLowerCase()).not.toContain('refund');
    expect(msg.description).toContain('History');
  });

  it('a network/abort error class with an unconfirmed refund claims no refund', () => {
    const msg = getMeritErrorMessage('AbortError', { meritsRefunded: false });
    expect(msg.description?.toLowerCase()).not.toContain('refund');
  });
});

describe('getMeritErrorMessage — the default path must NOT regress for other pages', () => {
  // Only an EXPLICIT `meritsRefunded: false` switches copy. `undefined` — i.e. every
  // pre-existing caller on every other page — must be byte-identical to today.
  it('500 with no context is byte-identical to the legacy refunded copy', () => {
    expect(getMeritErrorMessage(500)).toEqual({
      title: 'Analysis hit a server error',
      description: 'Our service had a hiccup — your Merits were refunded. Please try again.',
    });
  });

  it('408 / 529 / network with no context keep their legacy refunded copy', () => {
    expect(getMeritErrorMessage(408).description).toContain('your Merits were refunded');
    expect(getMeritErrorMessage(529).description).toContain('your Merits were refunded');
    expect(getMeritErrorMessage('network').description).toContain('your Merits were refunded');
  });

  it('an explicit meritsRefunded:true is identical to the legacy (undefined) copy', () => {
    expect(getMeritErrorMessage(500, { meritsRefunded: true })).toEqual(getMeritErrorMessage(500));
  });

  it('402 and 429 are untouched — 429 never deducts, 402 never claims a refund', () => {
    const outOfMerits = getMeritErrorMessage(402, { meritsRefunded: false });
    expect(outOfMerits.title).toBe("You're out of Merits");
    expect(outOfMerits.description?.toLowerCase()).not.toContain('refund');

    const rateCapped = getMeritErrorMessage(429, { retryAfterSec: 30, meritsRefunded: false });
    expect(rateCapped.title).toBe('Analysis rate cap reached');
    expect(rateCapped.description).toContain('No charge');
  });
});
