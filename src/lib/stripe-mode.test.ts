/**
 * stripe-mode — regression tests for the debug session
 * `stripe-checkout-key-mismatch` (2026-07-17).
 *
 * The production bug: bundle built with pk_test_ + edge fn holding sk_live_.
 * These lock in the detection + the deliberately-conservative mismatch rule.
 */
import { describe, it, expect } from 'vitest';
import {
  publishableKeyMode,
  clientSecretMode,
  isStripeModeMismatch,
  describeStripeMode,
} from './stripe-mode';

describe('publishableKeyMode', () => {
  it('detects test and live publishable keys', () => {
    expect(publishableKeyMode('pk_test_abc123')).toBe('test');
    expect(publishableKeyMode('pk_live_abc123')).toBe('live');
  });

  it('returns unknown for absent/empty/unrecognised keys', () => {
    expect(publishableKeyMode(undefined)).toBe('unknown');
    expect(publishableKeyMode(null)).toBe('unknown');
    expect(publishableKeyMode('')).toBe('unknown');
    expect(publishableKeyMode('sk_live_nope')).toBe('unknown');
  });
});

describe('clientSecretMode', () => {
  it('detects mode from Checkout Session secrets', () => {
    expect(clientSecretMode('cs_test_a1b2')).toBe('test');
    expect(clientSecretMode('cs_live_a1b2')).toBe('live');
  });

  it('returns unknown for PaymentIntent secrets (they do not encode mode)', () => {
    // PaymentIntent client secrets (pi_..._secret_...) carry no test/live marker,
    // unlike Checkout Session secrets (cs_test_/cs_live_). Placeholder value only.
    expect(clientSecretMode('pi_EXAMPLE_secret_EXAMPLE')).toBe('unknown');
  });

  it('returns unknown for absent secrets', () => {
    expect(clientSecretMode(null)).toBe('unknown');
    expect(clientSecretMode('')).toBe('unknown');
  });
});

describe('isStripeModeMismatch', () => {
  it('flags the production incident shape: test frontend vs live backend', () => {
    expect(isStripeModeMismatch('test', 'live')).toBe(true);
    expect(isStripeModeMismatch('live', 'test')).toBe(true);
  });

  it('does not flag matching modes', () => {
    expect(isStripeModeMismatch('test', 'test')).toBe(false);
    expect(isStripeModeMismatch('live', 'live')).toBe(false);
  });

  it('never flags when either side is unknown (absence of evidence != mismatch)', () => {
    expect(isStripeModeMismatch('unknown', 'live')).toBe(false);
    expect(isStripeModeMismatch('test', 'unknown')).toBe(false);
    expect(isStripeModeMismatch('unknown', 'unknown')).toBe(false);
  });
});

describe('describeStripeMode', () => {
  it('names both modes and prescribes the redeploy, leaking no key material', () => {
    const msg = describeStripeMode('subscription checkout', 'test', 'live');
    expect(msg).toContain('TEST');
    expect(msg).toContain('LIVE');
    expect(msg).toContain('REDEPLOY');
    expect(msg).not.toMatch(/pk_(test|live)_[A-Za-z0-9]/);
    expect(msg).not.toMatch(/sk_(test|live)_[A-Za-z0-9]/);
  });
});
