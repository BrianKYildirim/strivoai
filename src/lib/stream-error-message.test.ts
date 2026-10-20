/**
 * Leak-free guarantee for the streaming "Analysis Interrupted" screen.
 * Proves raw server / stack text is NEVER surfaced, while known-safe tokens and
 * curated strings map to controlled, user-facing copy.
 */
import { describe, it, expect } from 'vitest';
import { getSafeStreamErrorMessage } from './analysisError';

describe('getSafeStreamErrorMessage', () => {
  it('collapses raw server / stack text to a controlled generic message', () => {
    const rawSamples = [
      'TypeError: this.#t.getOrInsertComputed is not a function\n  at messageHandler.sendWithPromise',
      'Server error (500)',
      'ECONNRESET at internal/stream',
      '{"error":"Anthropic overloaded","stack":"..."}',
      'Unexpected token < in JSON at position 0',
    ];
    for (const raw of rawSamples) {
      const out = getSafeStreamErrorMessage(raw);
      expect(out).not.toContain('getOrInsertComputed');
      expect(out).not.toContain('sendWithPromise');
      expect(out).not.toContain('500');
      expect(out).not.toContain('ECONNRESET');
      expect(out).not.toContain('{');
      expect(out).toMatch(/interrupted before it finished/i);
    }
  });

  it('maps the rate-limit token to friendly copy (not the raw token)', () => {
    const out = getSafeStreamErrorMessage('rate_limit_exceeded');
    expect(out).not.toContain('rate_limit_exceeded');
    expect(out).toMatch(/busy/i);
  });

  it('maps the auth token to a session-expired message', () => {
    expect(getSafeStreamErrorMessage('Not authenticated')).toMatch(/session expired/i);
  });

  it('passes through known-safe curated strings unchanged', () => {
    expect(getSafeStreamErrorMessage('Connection failed. Please try again.')).toBe(
      'Connection failed. Please try again.',
    );
    expect(getSafeStreamErrorMessage('Stream disconnected. Please try again.')).toBe(
      'Stream disconnected. Please try again.',
    );
  });

  it('returns the generic message for null / empty', () => {
    expect(getSafeStreamErrorMessage(null)).toMatch(/interrupted before it finished/i);
    expect(getSafeStreamErrorMessage('')).toMatch(/interrupted before it finished/i);
  });
});
