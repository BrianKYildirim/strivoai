import type { BrowserContext, Page } from '@playwright/test';

const VALIDATOR_ROUTE = '**/functions/v1/validate-document';

/**
 * Breaks deploy-gate circularity for existing E2E flows: the validator is the
 * artifact being deployed, so the pre-deploy baseline cannot require its remote
 * route to exist yet. Post-deploy *.live.ts specs exercise the real function.
 */
export async function mockValidDocumentResponse(
  target: BrowserContext | Page,
): Promise<void> {
  await target.route(VALIDATOR_ROUTE, async (route) => {
    const headers = {
      'access-control-allow-origin': 'http://localhost:8080',
      'access-control-allow-headers':
        'authorization, x-client-info, apikey, content-type, x-document-type, x-file-name',
      'access-control-allow-methods': 'POST, OPTIONS',
    };

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, kind: 'pdf', pageCount: 1 }),
    });
  });
}
