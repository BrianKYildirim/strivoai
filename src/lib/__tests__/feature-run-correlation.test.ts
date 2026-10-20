import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFeatureRunToken,
  getFeatureRunToken,
  type FeatureRunCorrelationEnvelope,
} from '@/lib/feature-run-correlation';

function envelope(overrides: Partial<FeatureRunCorrelationEnvelope> = {}): FeatureRunCorrelationEnvelope {
  return {
    feature: 'resume_analysis',
    runVariant: 'standard',
    inputType: 'pdf',
    documentCount: 1,
    serverActionNonce: 'deliberate_action_12345',
    ...overrides,
  };
}

describe('feature-run correlation', () => {
  beforeEach(() => clearFeatureRunToken());

  it('obtains and reuses one opaque token for the same deliberate action', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { featureRunToken: 'fr1.opaque' },
      error: null,
    });
    const action = envelope();
    await expect(Promise.all([
      getFeatureRunToken(action, { invoke }),
      getFeatureRunToken(action, { invoke }),
    ])).resolves.toEqual(['fr1.opaque', 'fr1.opaque']);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(action);
  });

  it('keeps deliberate rerun variants and nonces distinct', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: { featureRunToken: 'standard' }, error: null })
      .mockResolvedValueOnce({ data: { featureRunToken: 'rerun' }, error: null })
      .mockResolvedValueOnce({ data: { featureRunToken: 'next-action' }, error: null });

    await expect(getFeatureRunToken(envelope(), { invoke })).resolves.toBe('standard');
    await expect(getFeatureRunToken(envelope({ runVariant: 'rerun' }), { invoke })).resolves.toBe('rerun');
    await expect(getFeatureRunToken(envelope({ serverActionNonce: 'deliberate_action_67890' }), { invoke }))
      .resolves.toBe('next-action');
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('evicts failed requests so an explicit retry can recover', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: null, error: new Error('offline') })
      .mockResolvedValueOnce({ data: { featureRunToken: 'recovered' }, error: null });
    await expect(getFeatureRunToken(envelope(), { invoke })).rejects.toThrow('offline');
    await expect(getFeatureRunToken(envelope(), { invoke })).resolves.toBe('recovered');
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('expires the in-memory reuse window before the server token expires', async () => {
    let now = 0;
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: { featureRunToken: 'first' }, error: null })
      .mockResolvedValueOnce({ data: { featureRunToken: 'second' }, error: null });
    await expect(getFeatureRunToken(envelope(), { invoke, now: () => now })).resolves.toBe('first');
    now = 8 * 60 * 1000;
    await expect(getFeatureRunToken(envelope(), { invoke, now: () => now })).resolves.toBe('second');
  });
});
