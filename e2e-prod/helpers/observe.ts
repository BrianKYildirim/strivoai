/**
 * Observation layer: console errors, failed network calls, raw-technical-error
 * detection in visible copy, and masked failure screenshots.
 *
 * Screenshots are taken ONLY on failure and ALWAYS with credential-bearing and
 * user-content elements masked, so no artifact can leak a password field, an
 * email, or another user's resume text.
 */
import type { Page, TestInfo } from '@playwright/test';
import { redact, redactUrl } from './redact';

export type Observed = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
};

/**
 * Substrings that mean a RAW technical error leaked into user-facing copy.
 * Deliberately narrow — these are strings a product surface should never show.
 */
const RAW_ERROR_SIGNATURES = [
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'undefined is not',
  'null is not an object',
  'Cannot read properties of',
  'Unexpected token',
  'at Object.<anonymous>',
  'PGRST',              // PostgREST error codes
  'permission denied for',
  'violates row-level security',
  'duplicate key value violates',
  'supabase.co/functions',
  'Edge Function returned',
  'FunctionsHttpError',
  'non-2xx status code',
  'Internal Server Error',
  'stack trace',
];

/** Console/pageerror/network noise that is expected and not a product defect. */
const IGNORABLE = [
  'favicon',
  'Failed to load resource: net::ERR_INTERNET_DISCONNECTED',
  'ResizeObserver loop',
  'Download the React DevTools',
  'vercel',              // analytics/speed-insights beacons
  'speed-insights',
  '/_vercel/',
];

function isIgnorable(text: string): boolean {
  const lower = text.toLowerCase();
  return IGNORABLE.some((frag) => lower.includes(frag.toLowerCase()));
}

/** Attach console/network listeners. Call once per page, before navigation. */
export function observe(page: Page): Observed {
  const observed: Observed = { consoleErrors: [], pageErrors: [], failedRequests: [] };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = redact(msg.text());
    if (isIgnorable(text)) return;
    observed.consoleErrors.push(text);
  });

  page.on('pageerror', (err) => {
    const text = redact(err.message);
    if (isIgnorable(text)) return;
    observed.pageErrors.push(text);
  });

  page.on('requestfailed', (req) => {
    const url = redactUrl(req.url());
    if (isIgnorable(url)) return;
    observed.failedRequests.push(`${req.method()} ${url} — ${redact(req.failure()?.errorText ?? 'failed')}`);
  });

  page.on('response', (res) => {
    if (res.status() < 400) return;
    const url = redactUrl(res.url());
    if (isIgnorable(url)) return;
    // Status + path only. Bodies are never read or stored.
    observed.failedRequests.push(`HTTP ${res.status()} ${res.request().method()} ${url}`);
  });

  return observed;
}

/**
 * Scan the page's VISIBLE text for raw technical errors.
 * Returns the offending signatures found (empty array = clean).
 */
export async function findRawTechnicalErrors(page: Page): Promise<string[]> {
  const bodyText = await page.locator('body').innerText().catch(() => '');
  return RAW_ERROR_SIGNATURES.filter((sig) =>
    bodyText.toLowerCase().includes(sig.toLowerCase()),
  );
}

/**
 * Masked screenshot. Attached to the report ONLY when the test failed.
 * Masks credential inputs and long-form user content (resume/LinkedIn text).
 */
export async function captureFailureArtifacts(
  page: Page,
  testInfo: TestInfo,
  observed: Observed,
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return; // passed — capture nothing

  const masks = [
    page.locator('#email'),
    page.locator('#password'),
    page.locator('input[type="email"]'),
    page.locator('input[type="password"]'),
    page.locator('textarea'),
    page.locator('[data-testid="embedded-checkout"]'),
  ];

  try {
    const shot = await page.screenshot({
      fullPage: true,
      mask: masks,
      maskColor: '#111827',
    });
    await testInfo.attach('failure-screenshot-masked.png', {
      body: shot,
      contentType: 'image/png',
    });
  } catch {
    // A screenshot failure must never mask the real assertion failure.
  }

  const diagnostics = [
    `url: ${redactUrl(page.url())}`,
    '',
    `console errors (${observed.consoleErrors.length}):`,
    ...observed.consoleErrors.map((e) => `  - ${e}`),
    '',
    `page errors (${observed.pageErrors.length}):`,
    ...observed.pageErrors.map((e) => `  - ${e}`),
    '',
    `failed requests (${observed.failedRequests.length}):`,
    ...observed.failedRequests.map((e) => `  - ${e}`),
  ].join('\n');

  await testInfo.attach('diagnostics-redacted.txt', {
    body: redact(diagnostics),
    contentType: 'text/plain',
  });
}
