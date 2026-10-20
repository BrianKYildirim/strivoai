/**
 * Mobile continuity regression coverage for the shared public and authenticated
 * shells. These checks complement the broad overflow matrix by measuring fixed
 * navigation and rail geometry, which does not contribute to document
 * `scrollWidth` when it is clipped outside the viewport.
 *
 * No test starts an analysis, opens checkout, or mutates account data.
 */
import { expect, test, type Page } from '@playwright/test';
import { MOBILE_PROJECTS, gotoSettled, settle, signOutLocally } from './surfaces';

const PHONE_PORTRAIT = { width: 390, height: 844 };
const NARROW_PHONE = { width: 320, height: 568 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };

async function expectInsideViewport(page: Page, locator: import('@playwright/test').Locator) {
  const box = await locator.boundingBox();
  expect(box, 'expected the element to have a rendered bounding box').not.toBeNull();

  const viewport = page.viewportSize();
  expect(viewport, 'expected a configured mobile viewport').not.toBeNull();
  if (!box || !viewport) return;

  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
}

async function expectNoDocumentOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
}

test.describe('mobile shell continuity @xdev', () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      !MOBILE_PROJECTS.has(testInfo.project.name),
      'Mobile shell geometry is covered by the two emulated phone projects.',
    );
  });

  test('signed-out navigation and authentication fit narrow portrait and landscape phones', async ({ page }) => {
    await signOutLocally(page);
    await page.setViewportSize(NARROW_PHONE);
    await page.goto('/pricing');
    await settle(page);

    await expectInsideViewport(page, page.getByRole('link', { name: 'Sign In' }));
    await expectInsideViewport(page, page.getByRole('link', { name: 'Get Started' }));
    await expectNoDocumentOverflow(page);

    for (const viewport of [NARROW_PHONE, PHONE_LANDSCAPE]) {
      await page.setViewportSize(viewport);
      await page.goto('/auth');
      await settle(page);

      const authCard = page.getByRole('heading', { name: 'Welcome Back' }).locator('xpath=../..');
      await expectInsideViewport(page, authCard);
      await expectInsideViewport(page, page.getByRole('button', { name: 'Continue with Google' }));
      await expectInsideViewport(page, page.getByRole('button', { name: /Sign in with Email Code/ }));
      await expectNoDocumentOverflow(page);
    }
  });

  test('authenticated rail, content, and feature availability remain correct on phones', async ({ page }) => {
    await page.setViewportSize(PHONE_PORTRAIT);
    await gotoSettled(page, '/dashboard');

    const sidebar = page.locator('aside.fixed').first();
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(56);
    await expectInsideViewport(page, page.getByRole('heading', { name: 'Your Career OS' }));
    await expectNoDocumentOverflow(page);

    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(220);

    const interviewPrep = sidebar.getByText('Interview Prep', { exact: true }).locator('..');
    await expect(interviewPrep).toHaveAttribute('aria-disabled', 'true');
    await expect(interviewPrep).toHaveCSS('pointer-events', 'none');

    const recruitingLens = sidebar.getByText('Recruiting Lens', { exact: true }).locator('..');
    await expect(recruitingLens).toHaveAttribute('href', '/recruiting-lens');
    await expect(recruitingLens).not.toHaveAttribute('aria-disabled', 'true');
    await expect(recruitingLens).toBeVisible();

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(56);

    await page.setViewportSize(PHONE_LANDSCAPE);
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(72);
    await expectNoDocumentOverflow(page);
  });

  test('signed-in destination pages share the same unclipped mobile content boundary', async ({ page }) => {
    await page.setViewportSize(PHONE_PORTRAIT);

    const paths = [
      '/dashboard',
      '/onboarding',
      '/upload',
      '/career-compass',
      '/linkedin-grader',
      '/recruiting-lens',
      '/profile',
      '/history',
    ];

    for (const path of paths) {
      await gotoSettled(page, path);
      await expectNoDocumentOverflow(page);

      const content = page.locator('.app-shell-content');
      await expect(content).toBeVisible();
      await expectInsideViewport(page, content);
    }
  });
});
