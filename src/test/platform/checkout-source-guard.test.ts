import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO = process.cwd();
const CHECKOUT_FILES = [
  'src/components/StripeCheckoutWrapper.tsx',
  'src/components/topup/StripePaymentElementModal.tsx',
  'src/components/topup/TopUpProvider.tsx',
] as const;
const OPEN_PATHS = [
  {
    path: 'src/pages/Pricing.tsx',
    anchor: 'checkoutInFlightRef.current = true',
    open: 'setCheckoutOpen(true)',
  },
  {
    path: 'src/components/PricingTable.tsx',
    anchor: 'setLoadingTier(plan.tier)',
    open: 'setCheckoutOpen(true)',
  },
  {
    path: 'src/components/topup/TopUpProvider.tsx',
    anchor: 'inFlightPackRef.current = detail.packId',
    open: 'setOpen(true)',
  },
] as const;
const LOCKED_TESTIDS = [
  'checkout-modal',
  'checkout-preparing',
  'payment-loading',
  'checkout-unavailable',
  'payment-unavailable',
  'embedded-checkout',
] as const;

function read(path: string): string {
  return readFileSync(join(REPO, path), 'utf8');
}

function walkCheckoutSources(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkCheckoutSources(fullPath));
    } else if (
      entry.isFile()
      && /\.(ts|tsx)$/.test(entry.name)
      && /checkout|payment|topup/i.test(entry.name)
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function posixPath(path: string): string {
  return relative(REPO, path).split(sep).join('/');
}

describe('Phase 03 checkout source contract', () => {
  const discovered = walkCheckoutSources(join(REPO, 'src', 'components'));

  it('walks a non-empty checkout tree and all three named components exist', () => {
    expect(discovered.length).toBeGreaterThan(0);
    const missing = CHECKOUT_FILES.filter((path) => !existsSync(join(REPO, path)));
    expect(missing, `Missing checkout files: ${missing.join(', ')}`).toEqual([]);
  });

  it('opens every checkout surface before the first await on its money path', () => {
    const violations: string[] = [];
    for (const contract of OPEN_PATHS) {
      const source = read(contract.path);
      const anchorIndex = source.indexOf(contract.anchor);
      const openIndex = source.indexOf(contract.open, anchorIndex);
      const awaitIndex = source.indexOf('await ', anchorIndex);
      if (anchorIndex < 0 || openIndex < 0 || awaitIndex < 0 || openIndex > awaitIndex) {
        violations.push(`${contract.path}: dialog open must precede the first await`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('keeps all six testids and locked pending copy byte-identical', () => {
    const sources = CHECKOUT_FILES.map(read).join('\n');
    for (const testId of LOCKED_TESTIDS) {
      expect(sources, `Missing locked checkout testid: ${testId}`).toContain(testId);
    }
    const lockedCopy = 'Preparing secure checkout\u2026';
    expect(read('src/components/StripeCheckoutWrapper.tsx')).toContain(lockedCopy);
    expect(read('src/components/topup/StripePaymentElementModal.tsx')).toContain(lockedCopy);
    expect(lockedCopy.codePointAt(lockedCopy.length - 1)).toBe(0x2026);
  });

  it('keeps the pending timeout exactly 15000ms in the frozen contract', () => {
    const taxonomy = read('src/lib/client-error-taxonomy.ts');
    expect(taxonomy).toMatch(/CHECKOUT_PENDING_TIMEOUT_MS\s*=\s*15000\s*;/);
    expect(taxonomy).toContain("We couldn't start checkout. Please try again.");
  });

  it('never renders provider error fields from a checkout component', () => {
    const violations: string[] = [];
    for (const fullPath of discovered) {
      const source = readFileSync(fullPath, 'utf8');
      if (/\b(?:error|err)\.message\b/.test(source)) {
        violations.push(posixPath(fullPath));
      }
    }
    expect(violations, `Raw provider messages found: ${violations.join(', ')}`).toEqual([]);
  });
});
