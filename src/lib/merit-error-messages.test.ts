import { describe, it, expect } from 'vitest';
import { getMeritErrorMessage } from './merit-error-messages';

const GENERIC = 'Something went wrong';

describe('getMeritErrorMessage', () => {
  it('500 → server-error title, mentions refund', () => {
    const r = getMeritErrorMessage(500);
    expect(r.title).toBe('Analysis hit a server error');
    expect(r.description).toMatch(/refunded/i);
  });

  it('529 → service-busy title, mentions refund', () => {
    const r = getMeritErrorMessage(529);
    expect(r.title).toBe('Analysis service is busy');
    expect(r.description).toMatch(/refunded/i);
  });

  it('408 → timed-out title, mentions refund', () => {
    const r = getMeritErrorMessage(408);
    expect(r.title).toBe('Analysis timed out');
    expect(r.description).toMatch(/refunded/i);
  });

  it("'AbortError' → connection-lost title, mentions refund", () => {
    const r = getMeritErrorMessage('AbortError');
    expect(r.title).toBe('Connection lost');
    expect(r.description).toMatch(/refunded/i);
  });

  it("'network' → connection-lost title, mentions refund", () => {
    const r = getMeritErrorMessage('network');
    expect(r.title).toBe('Connection lost');
    expect(r.description).toMatch(/refunded/i);
  });

  it('402 with resetDate → out-of-merits title, interpolates date', () => {
    const r = getMeritErrorMessage(402, { resetDate: '2026-06-01' });
    expect(r.title).toBe("You're out of Merits");
    expect(r.description).toContain('2026-06-01');
  });

  it('402 without resetDate → date-less upgrade fallback', () => {
    const r = getMeritErrorMessage(402);
    expect(r.title).toBe("You're out of Merits");
    expect(r.description).not.toMatch(/\{resetDate\}|undefined/);
    expect(r.description).toMatch(/top-up/i);
  });

  it('429 with retryAfterSec → rate-cap title, includes "30s" and "No charge"', () => {
    const r = getMeritErrorMessage(429, { retryAfterSec: 30 });
    expect(r.title).toBe('Analysis rate cap reached');
    expect(r.description).toContain('30s');
    expect(r.description).toMatch(/No charge/i);
  });

  it('400 (validation) → generic-process title, NO merit/refund/charge mention', () => {
    const r = getMeritErrorMessage(400);
    expect(r.title).toBe("We couldn't process that");
    expect(r.description ?? '').not.toMatch(/merit|refund|charge/i);
  });

  it('never returns the generic "Something went wrong" copy', () => {
    const codes: Array<number | string> = [
      400, 401, 402, 403, 404, 408, 422, 429, 500, 502, 503, 529,
      'AbortError', 'network', 'timeout', 'unknown-thing', 0,
    ];
    for (const code of codes) {
      const r = getMeritErrorMessage(code);
      expect(r.title).not.toBe(GENERIC);
      expect(r.description ?? '').not.toBe(GENERIC);
    }
  });

  it('unmapped refundable AI error defaults to the 5xx message', () => {
    const r = getMeritErrorMessage(503);
    expect(r.title).toBe('Analysis hit a server error');
    expect(r.description).toMatch(/refunded/i);
  });
});
