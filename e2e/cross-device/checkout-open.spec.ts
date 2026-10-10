/**
 * Phase 03 · Plan 18 — Surface G checkout presentation contract.
 *
 * Every network interception in this file stalls before Stripe can return a
 * payment object. No test completes a checkout or confirms a PaymentIntent.
 */
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { assertNoLeak } from '../helpers/leak-guard';

const CHECKOUT_SESSION = '/functions/v1/create-checkout-session';
const PAYMENT_INTENT = '/functions/v1/create-payment-intent';
const MODAL = '[data-testid="checkout-modal"]';
const SAFE_FAILURE = "We couldn't start checkout. Please try again.";

interface DialogTiming {
  startedAt: number | null;
  firstFrameAt: number | null;
}

/**
 * Measure the user-visible interval inside the browser.
 *
 * A Node-side Date.now() around locator.click() includes Playwright transport,
 * actionability bookkeeping and runner scheduling after the browser has already
 * painted the dialog. The 500 ms contract is activation -> first rendered frame,
 * so record both ends on the page's performance clock while retaining the real
 * Playwright pointer click.
 */
async function armDialogTiming(page: Page, trigger: Locator): Promise<void> {
  await trigger.evaluate((button, modalSelector) => {
    const timing: DialogTiming = { startedAt: null, firstFrameAt: null };
    (window as unknown as { __checkoutDialogTiming: DialogTiming }).__checkoutDialogTiming =
      timing;

    const observer = new MutationObserver(() => {
      if (timing.startedAt === null || timing.firstFrameAt !== null) return;
      const modal = document.querySelector(modalSelector);
      if (!(modal instanceof HTMLElement)) return;
      window.requestAnimationFrame(() => {
        timing.firstFrameAt = performance.now();
        observer.disconnect();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    button.addEventListener(
      'click',
      () => {
        timing.startedAt = performance.now();
      },
      { capture: true, once: true },
    );
  }, MODAL);
}

async function dialogOpenMs(page: Page): Promise<number> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const timing = (window as unknown as {
          __checkoutDialogTiming: DialogTiming;
        }).__checkoutDialogTiming;
        return timing.startedAt !== null && timing.firstFrameAt !== null
          ? timing.firstFrameAt - timing.startedAt
          : null;
      }),
    )
    .not.toBeNull();
  return page.evaluate(() => {
    const timing = (window as unknown as {
      __checkoutDialogTiming: DialogTiming;
    }).__checkoutDialogTiming;
    return (timing.firstFrameAt as number) - (timing.startedAt as number);
  });
}

function countCreatingRequests(page: Page): { count: () => number; paths: () => string[] } {
  const paths: string[] = [];
  page.on('request', (request: Request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(CHECKOUT_SESSION) || pathname.endsWith(PAYMENT_INTENT)) {
      paths.push(pathname);
    }
  });
  return { count: () => paths.length, paths: () => paths };
}

async function stall(page: Page, endpoint: string): Promise<void> {
  await page.route(`**${endpoint}`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
        },
      });
      return;
    }
    await new Promise<void>(() => {
      // Deliberately unresolved: the visible dialog must not depend on a response.
    });
  });
}

async function forceDegraded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Worker;
    try {
      Object.defineProperty(window, 'isSecureContext', {
        configurable: true,
        get: () => false,
      });
    } catch {
      // The assertion on the blocked surface fails if the override did not take.
    }
  });
}

test.describe('Surface G checkout opens without waiting @xdev', () => {
  test('OT-21/22: subscription opens within 500ms and a stalled request times out safely', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await stall(page, CHECKOUT_SESSION);
    const requests = countCreatingRequests(page);
    await page.goto('/pricing');

    const trigger = page.getByRole('button', { name: /upgrade to elite/i }).first();
    await expect(trigger).toBeVisible();
    const overflowBefore = await page.evaluate(() => document.body.style.overflow);
    await armDialogTiming(page, trigger);
    await trigger.click();

    await expect(page.locator(MODAL)).toBeVisible({ timeout: 500 });
    expect(await dialogOpenMs(page), 'checkout dialog open budget').toBeLessThanOrEqual(500);
    await expect(page.getByTestId('checkout-preparing')).toBeVisible();
    await expect(page.locator(MODAL)).toHaveCount(1);
    await expect.poll(requests.count).toBe(1);

    const focusIsInside = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="checkout-modal"]');
      return dialog?.contains(document.activeElement) ?? false;
    });
    expect(focusIsInside, 'focus enters the checkout dialog').toBe(true);

    await expect(page.locator(MODAL)).toHaveCount(0, { timeout: 17_000 });
    await expect(page.getByText(SAFE_FAILURE, { exact: true })).toBeVisible();
    await assertNoLeak(page, 'OT-22 checkout timeout');
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(overflowBefore);
  });

  test('OT-21: top-up opens within 500ms with one visible pending body', async ({ page }) => {
    await stall(page, PAYMENT_INTENT);
    const requests = countCreatingRequests(page);
    await page.goto('/pricing');

    const trigger = page.getByRole('button', { name: /buy \d+-merit pack/i }).first();
    await expect(trigger).toBeVisible();
    await armDialogTiming(page, trigger);
    await trigger.click();

    await expect(page.locator(MODAL)).toBeVisible({ timeout: 500 });
    expect(await dialogOpenMs(page), 'top-up dialog open budget').toBeLessThanOrEqual(500);
    await expect(page.getByTestId('payment-loading')).toBeVisible();
    await expect(page.locator(MODAL)).toHaveCount(1);
    await expect.poll(requests.count).toBe(1);

    await page.keyboard.press('Escape');
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('rapid mobile taps create exactly one payment object and one dialog', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile-'), 'mobile projects own the rapid-tap proof');
    await stall(page, PAYMENT_INTENT);
    const requests = countCreatingRequests(page);
    await page.goto('/pricing');

    const trigger = page.getByRole('button', { name: /buy \d+-merit pack/i }).first();
    await expect(trigger).toBeVisible();
    await trigger.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });

    await expect(page.getByTestId('payment-loading')).toBeVisible({ timeout: 500 });
    await expect(page.locator(MODAL)).toHaveCount(1);
    await expect.poll(requests.count).toBe(1);
    expect(requests.paths()).toHaveLength(1);
  });

  test('degraded checkout blocks before either payment endpoint', async ({ page }) => {
    const requests = countCreatingRequests(page);
    await forceDegraded(page);
    await page.goto('/pricing');

    const blocked = page.getByTestId('capability-blocked-checkout').first();
    await expect(blocked).toBeVisible();
    const blockedControl = page
      .locator('button[aria-disabled="true"][data-capability-blocked="true"]')
      .first();
    await blockedControl.click({ force: true });

    await expect(page.getByTestId('capability-blocked-checkout').last()).toBeVisible();
    expect(requests.paths()).toEqual([]);
    expect(requests.count()).toBe(0);
  });

  test('mobile-webkit dialog fits the visual viewport and restores body scroll', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-webkit', 'iOS viewport proof');
    await stall(page, PAYMENT_INTENT);
    await page.goto('/pricing');

    const trigger = page.getByRole('button', { name: /buy \d+-merit pack/i }).first();
    const overflowBefore = await page.evaluate(() => document.body.style.overflow);
    await trigger.click();
    const modal = page.locator(MODAL);
    await expect(modal).toBeVisible({ timeout: 500 });

    const geometry = await modal.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      return {
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(-1);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.scrollHeight).toBeGreaterThanOrEqual(geometry.clientHeight);

    const closeBox = await modal.getByRole('button', { name: 'Close' }).boundingBox();
    expect(closeBox, 'checkout close control has measurable geometry').not.toBeNull();
    expect(closeBox?.width).toBeGreaterThanOrEqual(44);
    expect(closeBox?.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(overflowBefore);
  });
});
