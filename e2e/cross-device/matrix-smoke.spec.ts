/**
 * Phase 03 · 03-03 · XTEST-01 — the SEED @xdev spec for the cross-device matrix.
 *
 * WHAT THIS FILE IS FOR: it proves the matrix is not vacuous. `playwright.config.ts`
 * now registers five projects, but four of them carry `grep: /@xdev/` — so if NO spec
 * ever carried the tag, those four projects would collect zero tests and report green
 * forever. That is precisely the 09-09 rot recorded in TESTING-STRATEGY.md (a lane that
 * was green and proved nothing), and a matrix is worth exactly as much as its ability
 * to go red. This spec is the minimum that makes every project execute something and
 * makes the whole lane provably failable by mutation.
 *
 * WHAT THIS FILE IS *NOT*: it is not the discovery suite. The real cross-device
 * assertions (per-width overflow sweeps across the audit surfaces, touch targets,
 * safe-area, slow-network behaviour) are plan 03-05's. Keep this file small — every
 * test added to the @xdev subset is paid for FIVE times inside the blocking
 * `verify:baseline` gate, and a gate that gets slow gets bypassed with `-SkipVerify`.
 *
 * TAGGING: `@xdev` sits in the `test.describe` title. Playwright composes
 * "<project> <file> <describe> <test> <tags>" and matches each project's `grep`
 * against it, so the tag on the describe selects every test inside it on all five
 * projects. `chromium` has no grep and runs it too.
 *
 * ANTI-FLAKE: both assertions are STRUCTURAL, not timing-based — the app root has
 * rendered, and the document does not scroll horizontally at the project's OWN default
 * viewport (1280x720 desktop, 390x664 iPhone 14, 412x839 Pixel 7). No `waitForTimeout`,
 * no retry, no `test.slow()`. Cross-engine timing differences are the classic source of
 * matrix flake, and a flaky blocking gate is a bypassed blocking gate.
 *
 * SECURITY: no credential, URL or key appears here. The session comes from the shared
 * `.auth/user.json` storageState produced by the single chromium `setup` run
 * (`e2e/auth.setup.ts`); the base URL comes from the config's `use.baseURL`.
 */
import { test, expect } from '@playwright/test';

test.describe('cross-device matrix smoke @xdev', () => {
  test('app boots and the document does not scroll horizontally', async ({ page }, testInfo) => {
    // Make the executing project visible in the report so the matrix visibly
    // enumerates which engines/devices actually ran, rather than being asserted
    // only in the config.
    testInfo.annotations.push({ type: 'project', description: testInfo.project.name });

    await page.goto('/');

    // 1. The app root actually rendered. A white screen from a module-eval throw or a
    //    failed dynamic import leaves #root attached but EMPTY — that is the exact
    //    symptom class this phase exists to catch, so assert content, not presence.
    const root = page.locator('#root');
    await expect(root).toBeAttached();
    await expect(root).not.toBeEmpty();

    // 2. No horizontal overflow at the project's own default viewport (UI-SPEC F3).
    //    The +1 tolerates sub-pixel rounding on fractional-DPR devices (Pixel 7 is 2.625).
    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(
      overflows,
      `horizontal overflow on ${testInfo.project.name}`,
    ).toBe(false);
  });
});
