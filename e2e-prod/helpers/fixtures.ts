/**
 * Shared fixture: attaches the observer to every page, asserts no raw technical
 * error leaked into visible copy, and captures MASKED artifacts on failure only.
 */
import { test as base, expect } from '@playwright/test';
import { observe, captureFailureArtifacts, findRawTechnicalErrors, type Observed } from './observe';
import { missingCredentialVars } from './env';

export const test = base.extend<{ observed: Observed }>({
  // The second fixture argument is named `provide`, not the conventional `use`:
  // eslint's react-hooks/rules-of-hooks treats a bare `use(...)` call as a React
  // hook and fails `npm run lint` (which runs `eslint .` and would break
  // verify:baseline). The name is arbitrary to Playwright.
  observed: async ({ page }, provide, testInfo) => {
    const observed = observe(page);
    await provide(observed);
    await captureFailureArtifacts(page, testInfo, observed);
  },
});

export { expect };

/**
 * Guard used by every spec file. If credentials are absent the whole suite
 * SKIPS with a clear, value-free message rather than failing noisily or, worse,
 * half-running against production.
 */
export function requireCredentials(): void {
  const missing = missingCredentialVars();
  test.skip(
    missing.length > 0,
    `Missing credential env vars: ${missing.join(', ')}. ` +
      'Export them or add a gitignored .env.prod-smoke.local.',
  );
}

/** Assert the current page shows no raw technical error text. */
export async function expectNoRawErrors(page: import('@playwright/test').Page, where: string) {
  const found = await findRawTechnicalErrors(page);
  expect(found, `raw technical error text visible on ${where}: ${found.join(', ')}`).toEqual([]);
}
