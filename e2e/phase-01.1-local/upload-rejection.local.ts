import { expect, test } from '@playwright/test';
import { buildResumePdfBytes } from '../fixtures/make-unique-resume';

test('public resume picker rejects three pages before any external side effect', async ({ page }) => {
  const unexpectedMutations: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
    } else {
      if (route.request().method() !== 'GET') {
        unexpectedMutations.push(`${route.request().method()} ${url.href}`);
      }
      await route.abort();
    }
  });

  await page.goto('/');
  const input = page.locator('input[type="file"]').first();
  await expect(input).toHaveAttribute('accept', '.pdf,.docx');
  await input.setInputFiles({
    name: 'three-page-resume.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(buildResumePdfBytes({
      pageCount: 3,
      runToken: 'phase-01.1-local-rejection',
    })),
  });

  await expect(page.getByText(
    'Your document is longer than the 2-page limit. Please upload a PDF or DOCX file containing no more than 2 pages.',
  )).toBeVisible({ timeout: 30_000 });
  await expect(input).toBeFocused();
  expect(await input.evaluate((node: HTMLInputElement) => node.files?.length ?? 0)).toBe(0);
  expect(unexpectedMutations).toEqual([]);
});

test('accepted control reaches the connected analyzing state', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({
    name: 'accepted-resume.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(buildResumePdfBytes({
      pageCount: 1,
      runToken: 'phase-01.1-local-accepted',
    })),
  });
  await expect(page.getByText(/Analyzing|Reading your resume/).first()).toBeVisible();
});
