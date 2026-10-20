/**
 * Diagnostic: /applications rendered an EMPTY body for the Elite user but not Free.
 * Determine whether that is a real render failure or a slow-paint artifact of the sweep's
 * fixed 2.5s wait.
 */
import { test, expect } from '@playwright/test';

test('applications paint diagnostic', async ({ page }, testInfo) => {
  const tier = testInfo.project.name;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/applications', { waitUntil: 'domcontentloaded' });

  for (const ms of [1000, 3000, 6000, 10000]) {
    await page.waitForTimeout(ms === 1000 ? 1000 : 2000);
    const txt = (await page.locator('body').innerText().catch(() => '')) ?? '';
    const html = (await page.locator('body').innerHTML().catch(() => '')) ?? '';
    console.log(`[${tier}] t~${ms}ms  url=${page.url()}  innerText=${txt.trim().length}  innerHTML=${html.length}`);
  }

  const finalTxt = (await page.locator('body').innerText().catch(() => '')) ?? '';
  const finalHtml = (await page.locator('body').innerHTML().catch(() => '')) ?? '';
  console.log(`\n[${tier}] FINAL innerText (first 300):\n${finalTxt.slice(0, 300)}`);
  console.log(`\n[${tier}] FINAL innerHTML (first 500):\n${finalHtml.slice(0, 500)}`);
  console.log(`\n[${tier}] errors: ${JSON.stringify(errors, null, 2)}`);

  expect(true).toBe(true);
});
