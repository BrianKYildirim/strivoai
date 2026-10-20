import { expect, test } from '@playwright/test';
import { E2E_TEST_EMAIL } from '../global-setup';
import { makeUniqueResumePdf } from '../fixtures/make-unique-resume';
import { adminClient, requireTestUserId } from '../helpers/test-user';

test('five-page LinkedIn PDF remains accepted without the resume page-limit message', async ({ page }) => {
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
  const linkedIn = makeUniqueResumePdf(5);

  try {
    await page.goto('/linkedin-grader');
    const scanNew = page.getByRole('button', { name: /scan new profile/i });
    if (await scanNew.isVisible()) await scanNew.click();
    const input = page.locator('input[type="file"]');
    await expect(input).toHaveAttribute('accept', /pdf/i, { timeout: 30_000 });
    await input.setInputFiles(linkedIn.filePath);
    await expect(page.getByText(linkedIn.fileName)).toBeVisible();
    await expect(page.getByText(/longer than the 2-page limit/i)).toHaveCount(0);
  } finally {
    await admin.from('profiles').update({ subscription_tier: priorTier }).eq('id', userId);
  }
});
