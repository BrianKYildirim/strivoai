/**
 * Diagnostic: identify the exact DOM elements that exceed the 390px mobile viewport on
 * /recruiting-lens and /applications, so the overflow can be fixed at its source rather
 * than papered over with `overflow-x: hidden` on a parent.
 */
import { test, expect } from '@playwright/test';

const ROUTES = ['/recruiting-lens', '/applications'];

test('find overflowing elements at 390px', async ({ page }, testInfo) => {
  const tier = testInfo.project.name;
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    // Match the sweep's settle time exactly — /recruiting-lens overflowed at 1500ms but not
    // at 3000ms, which points at a transient (loading/skeleton) element rather than a
    // persistent layout bug.
    await page.waitForTimeout(1500);

    const culprits = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // An element is a culprit if its right edge extends past the viewport.
        if (r.right > vw + 1) {
          const cls = (el.className || '').toString().slice(0, 90);
          out.push(
            `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} ` +
            `right=${Math.round(r.right)} width=${Math.round(r.width)} vw=${vw} class="${cls}"`,
          );
        }
      }
      // Only the shallowest few matter — deeper ones are children of the same overflow.
      return out.slice(0, 8);
    });

    console.log(`\n===== [${tier}] ${route} =====`);
    if (!culprits.length) console.log('  (none)');
    for (const c of culprits) console.log(`  ${c}`);
  }
  expect(true).toBe(true);
});
