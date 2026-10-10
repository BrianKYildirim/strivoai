import { describe, it, expect } from 'vitest';
import {
  maxTokensOutput,
  maxTokensInput,
  maxCharactersInput,
  type FeatureKey,
  type Tier,
} from '../pricing-config';
import { SC12_SNAPSHOT } from '../pricing-config.snapshot';

describe('D-19 SC-12 verbatim snapshot guard', () => {
  it('maxTokensOutput matches ROADMAP §SC-12 locked values', () => {
    expect(maxTokensOutput).toEqual(SC12_SNAPSHOT.maxTokensOutput);
  });

  it('maxTokensInput matches ROADMAP §SC-12 locked values', () => {
    expect(maxTokensInput).toEqual(SC12_SNAPSHOT.maxTokensInput);
  });

  it('maxCharactersInput matches ROADMAP §SC-12 locked values', () => {
    expect(maxCharactersInput).toEqual(SC12_SNAPSHOT.maxCharactersInput);
  });

  it('tier sums for maxTokensOutput reconcile to 22800 / 97000 / 109000', () => {
    const sum = (tier: Tier) =>
      (Object.keys(maxTokensOutput) as FeatureKey[]).reduce(
        (acc, f) => acc + maxTokensOutput[f][tier],
        0,
      );
    expect(sum('free')).toBe(SC12_SNAPSHOT.tierSums.maxTokensOutput.free);
    expect(sum('pro')).toBe(SC12_SNAPSHOT.tierSums.maxTokensOutput.pro);
    expect(sum('elite')).toBe(SC12_SNAPSHOT.tierSums.maxTokensOutput.elite);
  });

  it('4:1 char:token invariant holds on every non-null row', () => {
    for (const feat of Object.keys(maxTokensInput) as FeatureKey[]) {
      for (const tier of ['free', 'pro', 'elite'] as const) {
        const tok = maxTokensInput[feat][tier];
        const chr = maxCharactersInput[feat][tier];
        if (tok !== null && chr !== null) {
          expect(chr, `${feat}/${tier}: chars=${chr} tokens=${tok}`).toBe(tok * 4);
        } else {
          // Both must be null together — either both locked or neither
          expect(
            tok === null && chr === null,
            `${feat}/${tier}: asymmetric null state (tok=${tok} chr=${chr})`,
          ).toBe(true);
        }
      }
    }
  });
});
