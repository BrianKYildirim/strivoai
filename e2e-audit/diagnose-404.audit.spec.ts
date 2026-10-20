/**
 * Diagnostic: capture the exact URLs of failing network requests per route, so a
 * "Failed to load resource: 404" console line can be attributed to a real dead
 * endpoint vs a benign missing asset.
 */
import { test, expect } from '@playwright/test';

const ROUTES = ['/dashboard', '/career-compass', '/recruiting-lens', '/history', '/profile'];

test('capture failing request URLs', async ({ page }, testInfo) => {
  const tier = testInfo.project.name;
  const bad: string[] = [];

  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => {
    bad.push(`FAILED ${r.method()} ${r.url()} — ${r.failure()?.errorText}`);
  });

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
  }

  const unique = [...new Set(bad)];
  console.log(`\n===== [${tier}] failing requests (${unique.length}) =====`);
  for (const b of unique) console.log(`  ${b}`);
  console.log('===== end =====\n');

  expect(true).toBe(true);
});
