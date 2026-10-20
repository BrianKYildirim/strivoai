/**
 * analysisError.test.ts — Phase 03 · 03-05 · LIFE-08.
 *
 * Locks the frontend taxonomy mirror against the backend authority:
 *   1. all 13 codes map to a { message, retryable },
 *   2. the retryable partition matches LIFE-06 EXACTLY (only MODEL_TIMEOUT +
 *      MODEL_RATE_LIMITED are retryable),
 *   3. no message leaks technical detail (no HTTP status, stack, payload, prompt,
 *      provider name, secret, or internal identifier),
 *   4. an unknown/missing code fails closed to UNKNOWN_ANALYSIS_ERROR
 *      (non-retryable).
 */
import { describe, it, expect } from 'vitest';
import {
  ANALYSIS_ERROR_CODES,
  mapAnalysisError,
  type AnalysisErrorCode,
} from '../analysisError';

// The authoritative retryable partition (LIFE-06). Kept literal here so a drift in
// analysisError.ts is caught rather than mirrored by importing the same source.
const RETRYABLE: ReadonlySet<AnalysisErrorCode> = new Set<AnalysisErrorCode>([
  'MODEL_TIMEOUT',
  'MODEL_RATE_LIMITED',
]);

describe('mapAnalysisError', () => {
  it('exposes exactly the closed set of 13 codes', () => {
    expect(ANALYSIS_ERROR_CODES).toHaveLength(13);
    expect(new Set(ANALYSIS_ERROR_CODES).size).toBe(13);
  });

  it('maps every one of the 13 codes to a non-empty user-facing message', () => {
    for (const code of ANALYSIS_ERROR_CODES) {
      const { message } = mapAnalysisError(code);
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('matches the LIFE-06 retryable partition exactly (only the 2 transient codes)', () => {
    for (const code of ANALYSIS_ERROR_CODES) {
      expect(mapAnalysisError(code).retryable).toBe(RETRYABLE.has(code));
    }
    // Spot-check the boundary explicitly.
    expect(mapAnalysisError('MODEL_TIMEOUT').retryable).toBe(true);
    expect(mapAnalysisError('MODEL_RATE_LIMITED').retryable).toBe(true);
    expect(mapAnalysisError('DATABASE_SAVE_FAILED').retryable).toBe(false);
    expect(mapAnalysisError('MERIT_RESERVATION_FAILED').retryable).toBe(false);
  });

  it('leaks no technical detail in any message (LIFE-08)', () => {
    // Patterns that would indicate an internal-detail leak in user copy.
    const leakPatterns: RegExp[] = [
      /\b\d{3}\b/,                         // HTTP status codes (400/402/500/...)
      /http[s]?:\/\//i,                    // URLs
      /\bstack\b/i,
      /\bexception\b/i,
      /\banthropic\b/i,                    // provider name
      /\bclaude\b/i,
      /\bsupabase\b/i,
      /\bpostgres\b/i,
      /\bsql\b/i,
      /\bnull\b/i,
      /\bundefined\b/i,
      /\bpayload\b/i,
      /\bprompt\b/i,
      /\btoken\b/i,
      /\bsecret\b/i,
      /[{}]/,                              // JSON fragments
    ];
    for (const code of ANALYSIS_ERROR_CODES) {
      const { message } = mapAnalysisError(code);
      for (const pattern of leakPatterns) {
        expect(pattern.test(message), `${code}: "${message}" matched ${pattern}`).toBe(false);
      }
    }
  });

  it('fails closed to UNKNOWN_ANALYSIS_ERROR for an unknown code', () => {
    const unknown = mapAnalysisError('SOME_NEW_BACKEND_CODE');
    const fallback = mapAnalysisError('UNKNOWN_ANALYSIS_ERROR');
    expect(unknown).toEqual(fallback);
    expect(unknown.retryable).toBe(false);
  });

  it('fails closed for null / undefined / empty code', () => {
    for (const bad of [null, undefined, '']) {
      const result = mapAnalysisError(bad);
      expect(result).toEqual(mapAnalysisError('UNKNOWN_ANALYSIS_ERROR'));
      expect(result.retryable).toBe(false);
    }
  });
});
