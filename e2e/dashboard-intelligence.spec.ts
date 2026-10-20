import { expect, test, type Locator } from '@playwright/test';

test.use({ storageState: '.auth/user.json' });

test('dashboard intelligence sections keep final order and removed surfaces absent', async ({ page }) => {
  await page.goto('/dashboard');

  const careerOs = page.getByText('Your Career OS').first();
  const nextMoves = page.getByRole('heading', { name: 'Your Next 3 Moves' });
  const readinessMatrix = page.getByRole('heading', { name: 'Readiness Matrix' });
  const recruiterFirstImpression = page.getByRole('heading', { name: 'Recruiter First Impression' });
  const profileAlignment = page.getByRole('heading', { name: 'Profile Alignment', exact: true });

  // Quick 260712-msh: the resume-vault section ("Every Version, Ranked") and the 2-tab
  // shell it lived in were removed from the dashboard UI. SavedJobsDashboard now renders
  // directly as a section, so the "Saved Jobs" TAB no longer exists either.
  //
  // This is a Rule-1 stale-test reconciliation: these two locators used to assert the OLD
  // contract (toBeVisible) and now assert the NEW one (removed). They join the existing
  // removed-surface proofs below rather than inventing a new idiom.
  //
  // REMOVAL IS UI-ONLY: resume versions, analysis history, comparison, /results/*,
  // /improvements/* and /history are all untouched and still reachable.
  const resumeVault = page.getByRole('heading', { name: 'Every Version, Ranked' });
  const savedJobsTab = page.getByRole('tab', { name: 'Saved Jobs' });

  await expect(careerOs).toBeVisible();
  await expect(nextMoves).toBeVisible();
  await expect(readinessMatrix).toBeVisible();
  await expect(recruiterFirstImpression).toBeVisible();
  await expect(profileAlignment).toBeVisible();

  // The NEW contract: the hero renders the real, persisted Goal Readiness score. This
  // proves the REPLACEMENT, not just the deletion — the decorative "Live readiness"
  // number is gone and Goal Readiness took its place.
  await expect(page.getByText('Goal Readiness').first()).toBeVisible();

  await expect(resumeVault).toHaveCount(0);
  await expect(savedJobsTab).toHaveCount(0);
  await expect(page.getByText('Progress and Achievements')).toHaveCount(0);
  await expect(page.getByText('Activity Stream')).toHaveCount(0);
  await expect(page.getByText('Live Career Profile')).toHaveCount(0);
  await expect(page.getByText('Career Launch Path')).toHaveCount(0);

  const appearsBefore = async (before: Locator, after: Locator) => {
    const beforeHandle = await before.elementHandle();
    const afterHandle = await after.elementHandle();
    expect(beforeHandle).not.toBeNull();
    expect(afterHandle).not.toBeNull();

    return page.evaluate(
      ([left, right]) => Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING),
      [beforeHandle!, afterHandle!],
    );
  };

  expect(await appearsBefore(careerOs, nextMoves)).toBe(true);
  expect(await appearsBefore(nextMoves, readinessMatrix)).toBe(true);
  expect(await appearsBefore(readinessMatrix, recruiterFirstImpression)).toBe(true);
  // The two ordering assertions that routed through resumeVault are gone with the section
  // itself; the chain is re-linked directly. The rest of the order is preserved exactly.
  expect(await appearsBefore(recruiterFirstImpression, profileAlignment)).toBe(true);
});
