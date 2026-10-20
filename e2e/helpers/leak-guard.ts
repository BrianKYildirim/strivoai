/**
 * leak-guard.ts — the ONE place the XRUN-06 leak guard is defined for the
 * Playwright suite (Phase 03 · 03-12).
 *
 * The pattern itself is NOT retyped here. It is re-exported from
 * `src/lib/client-error-taxonomy.ts`, which is the same constant the vitest
 * table test and the two error-boundary component tests assert against. A leak
 * guard that each caller retypes is a leak guard that drifts: the browser half
 * would keep passing against a weakened regex while the unit half kept the
 * strong one, and nobody would notice which of the two was actually enforcing
 * the requirement.
 *
 * Plans 03-13 through 03-18 must import `LEAK_GUARD_PATTERN` / `assertNoLeak`
 * from here rather than copying the expression into their own specs.
 *
 * SECURITY: `assertNoLeak` never reproduces the page text in a failure message.
 * A leaking page can contain a resume paragraph, an email address or a signed
 * storage URL, and Playwright failure messages land in CI artifacts. Only the
 * MATCHED FRAGMENT — which is by definition engine boilerplate, not user
 * content — is surfaced, and it is clamped.
 */
import { expect, type Page } from '@playwright/test';
import { LEAK_GUARD_PATTERN } from '../../src/lib/client-error-taxonomy';

export { LEAK_GUARD_PATTERN };

/** Longest matched fragment ever put into a failure message or an artifact. */
const MAX_REPORTED_FRAGMENT = 80;

/** The rendered, visible text of the page. */
export async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body?.innerText ?? '');
}

/**
 * The single assertion this plan exists to make, plus its VACUITY GUARD.
 *
 * The vacuity guard is not decoration. A leak-guard assertion against an empty
 * document passes trivially, and the states this spec forces are exactly the
 * states most likely to produce an empty document — that is the failure mode
 * 03-08 found (`#root` with zero children and nothing logged). Asserting the
 * text is non-empty BEFORE running the regex is what makes a green here mean
 * "the right thing rendered and it was clean" rather than "nothing rendered".
 */
export async function assertNoLeak(page: Page, label: string): Promise<string> {
  // Poll rather than read once: several of the forced states settle a frame or
  // two after the locator that gated them became visible.
  await expect
    .poll(async () => (await bodyText(page)).trim().length, {
      message: `${label}: the page rendered NO visible text — the leak-guard assertion would pass vacuously`,
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  const text = await bodyText(page);
  const match = text.match(LEAK_GUARD_PATTERN);
  expect(
    match?.[0]?.slice(0, MAX_REPORTED_FRAGMENT) ?? null,
    `${label}: raw JavaScript / database / provider / stack text reached the user ` +
      '(XRUN-06). Only the matched fragment is reported — the page text itself is ' +
      'deliberately not reproduced.',
  ).toBeNull();

  return text;
}

/**
 * Prove the RIGHT message rendered, not merely that no bad one did. Every state
 * in the spec pairs `assertNoLeak` with this, because a leak guard that passes
 * on a page showing the wrong controlled message is still a broken surface.
 */
export function assertFrozenCopy(text: string, expected: readonly string[], label: string): void {
  for (const phrase of expected) {
    expect(text.includes(phrase), `${label}: expected frozen-table copy "${phrase}" was not on screen`).toBe(
      true,
    );
  }
}
