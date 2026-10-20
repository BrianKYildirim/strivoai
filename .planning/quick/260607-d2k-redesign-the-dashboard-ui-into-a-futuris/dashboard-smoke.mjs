import { chromium } from 'playwright';

const fakeUserId = '11111111-1111-4111-8111-111111111111';
const outDir = '.planning/quick/260607-d2k-redesign-the-dashboard-ui-into-a-futuris';
const dashboardUrl = process.env.DASHBOARD_URL || 'http://127.0.0.1:8080/dashboard';

function supabaseStorageKey(url) {
  const host = new URL(url).hostname;
  const ref = host.split('.')[0];
  return `sb-${ref}-auth-token`;
}

async function installRoutes(page) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://example.supabase.co';

  await page.route('**/auth/v1/token?grant_type=refresh_token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: fakeUserId, email: 'student@strivo.test', user_metadata: { full_name: 'Taylor Student' } },
      }),
    });
  });

  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: fakeUserId, email: 'student@strivo.test', user_metadata: { full_name: 'Taylor Student' } }),
    });
  });

  await page.route('**/rest/v1/rpc/has_role', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'false' });
  });

  await page.route('**/rest/v1/rpc/get_merit_balance', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total: 118,
        subscription_balance: 108,
        shop_balance: 10,
        next_reset_date: '2026-07-01',
      }),
    });
  });

  await page.route('**/rest/v1/profiles*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: fakeUserId, subscription_tier: 'elite', full_name: 'Taylor Student' }]),
    });
  });

  await page.route('**/rest/v1/resumes*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-1/2' },
      body: JSON.stringify([
        {
          id: 'resume-1',
          file_name: 'Taylor-Product-Analyst-Resume.pdf',
          created_at: '2026-06-06T12:00:00Z',
          analyzed_at: '2026-06-06T12:03:00Z',
          overall_score: 84,
          grading_data: {
            strengths: ['Strong product analytics projects with measurable outcomes', 'Clear leadership signal from campus initiatives'],
            priorityImprovements: ['Add quantified business impact to internship bullets', 'Tighten technical skills around SQL and dashboards'],
            suggestedTargetRoles: ['Product Analyst', 'Business Analyst', 'Growth Intern'],
            industryGuess: 'Technology',
          },
        },
        {
          id: 'resume-2',
          file_name: 'Taylor-General-Resume.pdf',
          created_at: '2026-05-28T12:00:00Z',
          analyzed_at: '2026-05-28T12:02:00Z',
          overall_score: 73,
          grading_data: {
            strengths: ['Readable education section'],
            priorityImprovements: ['Improve action verbs'],
            suggestedTargetRoles: ['Operations Intern'],
          },
        },
      ]),
    });
  });

  await page.route('**/rest/v1/linkedin_grades*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'linkedin-1',
          overall_score: 78,
          profile_url: 'https://linkedin.com/in/taylor',
          created_at: '2026-06-05T12:00:00Z',
          grading_data: {
            keyStrengths: ['Headline names target function', 'Project evidence matches analyst roles'],
            topFixes: ['Add a stronger featured project', 'Rewrite About section with proof points'],
          },
        },
      ]),
    });
  });

  await page.route('**/rest/v1/applications*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-1/2' },
      body: JSON.stringify([
        {
          id: 'job-1',
          role_applied: 'Product Analyst Intern',
          company_applied: 'Northstar Labs',
          created_at: '2026-06-04T12:00:00Z',
          location: 'New York, NY',
          salary: '$32/hr',
          industry: 'SaaS',
          status: 'saved',
          url: 'https://example.com/job',
        },
        {
          id: 'job-2',
          role_applied: 'Growth Strategy Intern',
          company_applied: 'Atlas AI',
          created_at: '2026-06-03T12:00:00Z',
          location: 'Remote',
          salary: null,
          industry: 'AI',
          status: 'saved',
          url: null,
        },
      ]),
    });
  });

  await page.route('**/rest/v1/analysis_results*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'history-1',
          analysis_type: 'recruiting_lens',
          created_at: '2026-06-06T13:00:00Z',
          primary_score: 82,
          source_reference: 'Northstar Labs',
        },
      ]),
    });
  });

  await page.addInitScript(({ key }) => {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem(key, JSON.stringify({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: now + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'student@strivo.test',
        user_metadata: { full_name: 'Taylor Student' },
      },
    }));
  }, { key: supabaseStorageKey(supabaseUrl) });
}

async function expectText(page, text) {
  const locator = page.getByText(text, { exact: true });
  await locator.waitFor({ state: 'visible', timeout: 15000 });
}

async function expectHeading(page, text) {
  const locator = page.getByRole('heading', { name: text, exact: true });
  await locator.waitFor({ state: 'visible', timeout: 15000 });
}

async function clickTab(page, name) {
  const tab = page.locator('[role="tab"]').filter({ hasText: name });
  await tab.waitFor({ state: 'visible', timeout: 15000 });
  await tab.click();
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.log(`[browser:error] ${error.message}`));
  await installRoutes(page);

  try {
    await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded' });
    await expectText(page, 'Your Career OS');
    await expectText(page, 'Career Readiness Score');
    await expectText(page, 'Your Next 3 Moves');
    await expectText(page, 'Live Career Profile');
    await expectText(page, 'Readiness Matrix');
    await expectText(page, 'Every Version, Ranked');
    await page.screenshot({ path: `${outDir}/dashboard-desktop.png`, fullPage: true });

    await clickTab(page, 'Saved Jobs');
    await expectText(page, 'Application Intelligence');
    await expectHeading(page, 'Product Analyst Intern');
    await page.screenshot({ path: `${outDir}/dashboard-jobs.png`, fullPage: true });

    await clickTab(page, 'Resume Vault');
    await page.setViewportSize({ width: 390, height: 1200 });
    await expectText(page, 'Your Career OS');
    await expectText(page, 'Resume Vault');
    await page.screenshot({ path: `${outDir}/dashboard-mobile.png`, fullPage: true });

    console.log('Dashboard smoke passed');
  } catch (error) {
    console.log(`Current URL: ${page.url()}`);
    console.log(`Title: ${await page.title()}`);
    await page.screenshot({ path: `${outDir}/dashboard-failure.png`, fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
