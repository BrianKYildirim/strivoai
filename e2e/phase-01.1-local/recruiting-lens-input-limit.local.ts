import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const recruitingLens = readFileSync(resolve('src/pages/RecruitingLens.tsx'), 'utf8');
const limits = readFileSync(resolve('src/config/document-limits.ts'), 'utf8');

test('Recruiting Lens pins the 6000/5400 input and accessible counter contracts', async () => {
  expect(limits).toContain('RECRUITING_LENS_JD_MAX_CHARS = 6000');
  expect(limits).toContain('RECRUITING_LENS_JD_WARN_CHARS = Math.floor');
  expect(recruitingLens).toContain('maxLength={RECRUITING_LENS_JD_MAX_CHARS}');
  expect(recruitingLens).toContain('aria-describedby="job-description-help job-description-count"');
  expect(recruitingLens).toContain('tabular-nums');
  expect(recruitingLens).toContain('min-h-[200px] md:min-h-[280px]');
});

test.describe('public upload responsive contract', () => {
  for (const width of [320, 639, 640, 767, 1280]) {
    test(`${width}px has no horizontal overflow or clipped helper`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByText(/PDF or DOCX files supported\. Maximum 2 pages\./)).toBeVisible({
        timeout: 30_000,
      });
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      const button = page.getByRole('button', { name: /upload your resume/i });
      const box = await button.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (width <= 767) expect(box?.width ?? 0).toBeGreaterThan(width * 0.7);
    });
  }
});
