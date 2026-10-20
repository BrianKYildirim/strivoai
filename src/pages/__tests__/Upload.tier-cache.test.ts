import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { normalizeActiveTier } from '@/config/pricing-config';

// 260723-2b0 Task 6 — the Upload cache short-circuit must be tier-aware (D-1/D-4/D-6).
//
// The short-circuit navigates away BEFORE any edge function runs, so the (already correct)
// tier-aware SERVER cache never gets a chance. The client query must therefore carry the
// tier predicate itself. These assertions pin (a) the predicate STRING the query builds for
// each account tier — the behavioral contract a 'free' cached row must fail for an Elite
// user while a NULL row still matches — and (b) that the wiring in Upload.tsx cannot regress
// to interpolating a raw (possibly 'pro') tier.

const uploadSource = readFileSync(resolve('src/pages/Upload.tsx'), 'utf8').replace(/\r\n/g, '\n');

/** The exact `.or(...)` predicate Upload.tsx builds for a given click-time tier. */
function cachePredicate(latestTier: string | null | undefined): string {
  const cacheTier = normalizeActiveTier(latestTier);
  return `analyzed_tier.eq.${cacheTier},analyzed_tier.is.null`;
}

describe('Upload cache short-circuit is tier-aware (D-1/D-4/D-6)', () => {
  it('Free account builds a predicate that matches free rows and NULL rows only', () => {
    const p = cachePredicate('free');
    expect(p).toBe('analyzed_tier.eq.free,analyzed_tier.is.null');
    // An elite-stamped row does NOT satisfy this predicate.
    expect(p).not.toContain('analyzed_tier.eq.elite');
  });

  it('Elite account builds a predicate that EXCLUDES free rows (no cross-tier reuse)', () => {
    const p = cachePredicate('elite');
    expect(p).toBe('analyzed_tier.eq.elite,analyzed_tier.is.null');
    // A free-stamped row is NOT matched -> the upload falls through to the analyze path.
    expect(p).not.toContain('analyzed_tier.eq.free');
  });

  it('a NULL-tier row is reusable by BOTH tiers (asymmetric D-4: NULL matches any tier)', () => {
    expect(cachePredicate('free')).toContain('analyzed_tier.is.null');
    expect(cachePredicate('elite')).toContain('analyzed_tier.is.null');
  });

  it('D-6 regression guard: a raw "pro" account tier produces analyzed_tier.eq.elite, NEVER analyzed_tier.eq.pro', () => {
    const p = cachePredicate('pro');
    expect(p).toBe('analyzed_tier.eq.elite,analyzed_tier.is.null');
    expect(p).not.toContain('analyzed_tier.eq.pro');
  });

  it('normalizeActiveTier fails closed to free for unrecognized tiers (no bail-out branch needed)', () => {
    expect(cachePredicate(undefined)).toBe('analyzed_tier.eq.free,analyzed_tier.is.null');
    expect(cachePredicate('garbage')).toBe('analyzed_tier.eq.free,analyzed_tier.is.null');
  });

  it('Upload.tsx wires the predicate through normalizeActiveTier and never interpolates latestTier directly', () => {
    // Selects the column so the reused tier can be shown honestly in the toast.
    expect(uploadSource).toContain(".select('id, analyzed_at, analyzed_tier')");
    // Predicate is derived from the normalized tier, not the raw one.
    expect(uploadSource).toContain('const cacheTier = normalizeActiveTier(latestTier)');
    expect(uploadSource).toContain('.or(`analyzed_tier.eq.${cacheTier},analyzed_tier.is.null`)');
    // The D-6 trap: the raw tier must NEVER be interpolated into the predicate.
    expect(uploadSource).not.toContain('analyzed_tier.eq.${latestTier}');
    expect(uploadSource).not.toContain("analyzed_tier.eq.${tier}");
  });
});
