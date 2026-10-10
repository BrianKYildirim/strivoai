import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// PRICE-06 static guard: after the Plan 33-05 restyle, no /pricing surface may
// retain the old .theme-v2 / arbitrary-CSS-var visual system. The surfaces are
// Pricing.tsx plus every component under src/components/pricing/.
const PRICING_DIR = 'src/components/pricing';
const SURFACES = [
  'src/pages/Pricing.tsx',
  ...readdirSync(PRICING_DIR)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => join(PRICING_DIR, f)),
];

// Forbidden tokens of the removed .theme-v2 system (D-07 / PRICE-06).
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: 'theme-v2 scope class', re: /\btheme-v2\b/ },
  { label: 'font-display', re: /\bfont-display\b/ },
  { label: 'font-mono', re: /\bfont-mono\b/ },
  { label: 'variant="boxy"', re: /variant=["']boxy["']/ },
  { label: 'variant="boxy-outline"', re: /variant=["']boxy-outline["']/ },
  { label: 'arbitrary CSS-var class [--...]', re: /\[--/ },
];

describe('PRICE-06 pricing token guard', () => {
  for (const { label, re } of FORBIDDEN) {
    it(`no /pricing surface contains ${label}`, () => {
      const offenders: string[] = [];
      for (const path of SURFACES) {
        const src = readFileSync(path, 'utf8');
        if (re.test(src)) offenders.push(path);
      }
      expect(
        offenders,
        `${label} forbidden on /pricing surfaces; offenders: ${offenders.join(', ')}`,
      ).toEqual([]);
    });
  }

  it('TierCardV2 wires the current-plan highlight via border-primary', () => {
    const src = readFileSync(join(PRICING_DIR, 'TierCardV2.tsx'), 'utf8');
    expect(src).toMatch(/border-primary/);
  });

  it('Pricing.tsx passes the explicit status contract to each TierCardV2', () => {
    const src = readFileSync('src/pages/Pricing.tsx', 'utf8');
    expect(src).toContain("tier === 'elite' ? 'current' : 'scheduled'");
    expect(src).toContain("currentTier === tier ? 'current' : 'available'");
  });

  it('Pricing.tsx guards both stale Free CTA and confirm paths while pending', () => {
    const src = readFileSync('src/pages/Pricing.tsx', 'utf8');
    expect(src).toMatch(/if \(tier === 'free'\) \{\s+if \(isDowngradePending\) return;/);
    expect(src).toMatch(/if \(downgradeInFlightRef\.current \|\| downgrading \|\| isDowngradePending\)/);
    expect(src).toContain('downgradeInFlightRef.current = true');
  });
});
