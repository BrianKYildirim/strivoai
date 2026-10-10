import { expect, test } from '@playwright/test';
import { E2E_TEST_EMAIL } from '../global-setup';
import { makeUniqueResumePdf } from '../fixtures/make-unique-resume';
import {
  adminClient,
  requireTestUserId,
} from '../helpers/test-user';

test('real UI rejects a unique three-page resume before network or persistent state', async ({ page }) => {
  const admin = adminClient();
  const userId = await requireTestUserId(admin, E2E_TEST_EMAIL);
  const { filePath, fileName } = makeUniqueResumePdf(3);
  const observed: string[] = [];
  page.on('request', (request) => {
    if (/validate-document|analyze-resume|deduct/i.test(request.url())) {
      observed.push(request.url());
    }
  });

  const count = async (table: string): Promise<number> => {
    const { count: value, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw new Error(`${table} control read failed: ${error.message}`);
    return value ?? 0;
  };
  const before = {
    resumes: await count('resumes'),
    results: await count('analysis_results'),
    jobs: await count('analysis_jobs'),
    merits: await count('merit_transactions'),
  };
  const { data: meritBefore, error: meritBeforeError } = await admin
    .from('user_merits')
    .select('subscription_balance, shop_balance')
    .eq('user_id', userId)
    .single();
  if (meritBeforeError) throw new Error(`merit balance control read failed: ${meritBeforeError.message}`);
  const { data: storageBefore, error: storageBeforeError } = await admin.storage
    .from('resumes')
    .list(userId, { search: fileName });
  if (storageBeforeError) throw new Error(`storage control read failed: ${storageBeforeError.message}`);

  await page.goto('/upload');
  await page.locator('#file-input').setInputFiles(filePath);
  await expect(page.getByText(
    'Your document is longer than the 2-page limit. Please upload a PDF or DOCX file containing no more than 2 pages.',
  )).toBeVisible();
  await expect(page.getByText(fileName)).toHaveCount(0);

  const after = {
    resumes: await count('resumes'),
    results: await count('analysis_results'),
    jobs: await count('analysis_jobs'),
    merits: await count('merit_transactions'),
  };
  const { data: meritAfter, error: meritAfterError } = await admin
    .from('user_merits')
    .select('subscription_balance, shop_balance')
    .eq('user_id', userId)
    .single();
  if (meritAfterError) throw new Error(`merit balance control read failed: ${meritAfterError.message}`);
  const { data: storageAfter, error: storageAfterError } = await admin.storage
    .from('resumes')
    .list(userId, { search: fileName });
  if (storageAfterError) throw new Error(`storage control read failed: ${storageAfterError.message}`);
  expect(after).toEqual(before);
  expect(meritAfter).toEqual(meritBefore);
  expect(storageBefore).toHaveLength(0);
  expect(storageAfter).toHaveLength(0);
  expect(observed).toEqual([]);
});
