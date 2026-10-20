import { expect, test } from '@playwright/test';
import { E2E_TEST_EMAIL } from '../global-setup';
import { adminClient, requireTestUserId } from '../helpers/test-user';

test('Recruiting Lens preserves the 6,000-character input and responsive contracts', async ({ page }) => {
  const admin = adminClient();
  const userId = await requireTestUserId(admin, E2E_TEST_EMAIL);
  const { data: profile, error } = await admin
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();
  if (error) throw new Error(`profile control read failed: ${error.message}`);
  const priorTier = profile.subscription_tier;
  await admin.from('profiles').update({ subscription_tier: 'elite' }).eq('id', userId);

  try {
    for (const width of [320, 639, 640, 767, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/recruiting-lens');
      const input = page.locator('#job-description');
      await expect(input).toBeVisible();
      await expect(input).toHaveAttribute('maxlength', '6000');
      await expect(input).toHaveAttribute(
        'aria-describedby',
        'job-description-help job-description-count',
      );
      await expect(page.locator('#job-description-help')).toHaveText(
        'Job descriptions may contain up to 6,000 characters.',
      );
      await input.fill('y'.repeat(6_001));
      await expect(input).toHaveValue('y'.repeat(6_000));

      const company = page.locator('#company-name');
      const role = page.locator('#role-title');
      await company.fill('Synthetic Company');
      await role.fill('Synthetic Role');

      const marker = `START-${'x'.repeat(5490)}-END`;
      await input.fill(marker);
      await expect(input).toHaveValue(marker);
      await expect(company).toHaveValue('Synthetic Company');
      await expect(role).toHaveValue('Synthetic Role');
      await expect(page.locator('#job-description-count')).toContainText(/5500\s*\/\s*6,000/);
      await expect(input).toBeFocused();

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      const box = await input.boundingBox();
      const availableContentWidth = width - 72;
      if (width < 768) {
        expect(box?.width ?? 0).toBeGreaterThan(availableContentWidth * 0.8);
      } else {
        expect(box?.width ?? 0).toBeGreaterThan(500);
      }
    }
  } finally {
    await admin.from('profiles').update({ subscription_tier: priorTier }).eq('id', userId);
  }
});
