/**
 * Phase 03 · 03-05 — the SINGLE place the cross-device discovery matrix's case
 * count is declared.
 *
 * WHY THIS FILE EXISTS: plan 03-05 requires the widths and audit surfaces be
 * "parameterised so the case count is visible and adjustable in one place". Five
 * discovery specs need the same list, and importing one `*.spec.ts` from another
 * would re-register its `test()` calls in the importing file. A plain `.ts`
 * module is NOT collected by Playwright's default `testMatch`
 * (`**\/*.@(spec|test).?(c|m)[jt]s?(x)`), so this is the only safe shape.
 *
 * BUDGET: every case here is paid for up to FIVE times inside the blocking
 * `verify:baseline` gate (03-03 measured the matrix at +5.6 s of a 180 s budget).
 * Adding a surface multiplies by `WIDTHS.length * THEMES.length * projects`. Cut
 * here — and record the cut in `03-RESIDUAL-REGISTER.md` — rather than dropping a
 * project.
 *
 * SCOPE GUARD: none of these routes starts an AI run. `/upload`,
 * `/linkedin-grader`, `/career-compass` and `/recruiting-lens` are the INPUT
 * screens of the paid features; discovery specs must never click their
 * start-analysis CTA, because every run consumes real Merits on the seeded
 * account.
 *
 * SECURITY: no credential, key or URL literal appears here. The session comes
 * from the shared `.auth/user.json` storageState; the origin comes from
 * `use.baseURL`.
 */
import { expect, type Page, type TestInfo } from '@playwright/test';

/** UI-SPEC F2 — the widths asserted inside the tagged cross-device subset. */
export const WIDTHS = [320, 375, 414, 640, 767, 768, 1024, 1280] as const;

/**
 * UI-SPEC F3 requires "both themes". Theming is a single class on
 * `<html>` (`tailwind.config.ts` → `darkMode: ['class']`; `ThemeToggle.tsx`
 * adds/removes `dark` / `light`), so a class swap is a faithful theme change and
 * avoids paying for a second page load per surface.
 */
export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

/** The two device projects. Tap targets are a DEVICE contract, not an engine one. */
export const MOBILE_PROJECTS = new Set(['mobile-webkit', 'mobile-chromium']);

export interface Surface {
  /** Stable id used in test titles and in the defect register. */
  id: string;
  /** Route path. Relative — resolved against `use.baseURL`. */
  path: string;
  /** Whether the route is behind `ProtectedRoute` (affects settle time only). */
  authed: boolean;
  /**
   * The surface renders at least one text-entry control for the SEEDED user.
   * Load-bearing anti-vacuity flag: UI-SPEC F5's ">= 16px" rule can only be
   * proven on a surface that actually has a control, and a probe that inspects
   * zero controls and reports zero violations is exactly the discovery theatre
   * this plan's threat model calls the worst possible outcome.
   */
  hasFormControls?: boolean;
  /**
   * The surface must be visited SIGNED OUT.
   *
   * Load-bearing: every project shares `.auth/user.json`, and an authenticated
   * visit to `/auth` is redirected away by `Auth.tsx`'s session listener. Without
   * this flag the "authentication" audit surface silently re-measures the landing
   * page and reports a confident, meaningless result — discovered the hard way in
   * plan 03-05 when `/auth` produced byte-identical offenders to `/`.
   */
  anonymous?: boolean;
}

/**
 * Ten routes covering the audit surfaces named in 03-CONTEXT.md § Phase Boundary.
 * Two named surfaces are deliberately absent:
 *   - Stripe checkout — its open/latency contract is UI-SPEC Surface G and is
 *     owned by plan 03-18, which drives the dialog rather than a route.
 *   - Admin isolation — the seeded E2E user is non-admin by construction
 *     (`e2e/global-setup.ts` seeds `subscription_tier: 'free'`), so `/admin/usage`
 *     renders an access denial, not the surface under test.
 *
 * `/profile` (account management) is included specifically because it is the ONLY
 * route the seeded FREE-tier user can reach that renders both a real `<textarea>`
 * and a Radix select trigger (`src/components/profile/EducationTargetsSection.tsx`
 * lines 134, 155, 289). Recruiting Lens's job-description textarea sits behind the
 * Elite gate, so without `/profile` the UI-SPEC F5 font-size probe would inspect
 * zero of the two primitives it exists to check and report a vacuous green.
 */
export const SURFACES: readonly Surface[] = [
  { id: 'landing', path: '/', authed: false },
  { id: 'auth', path: '/auth', authed: false, anonymous: true, hasFormControls: true },
  { id: 'pricing', path: '/pricing', authed: false },
  { id: 'dashboard', path: '/dashboard', authed: true },
  { id: 'onboarding', path: '/onboarding', authed: true },
  { id: 'resume-analysis', path: '/upload', authed: true },
  { id: 'linkedin-grader', path: '/linkedin-grader', authed: true },
  { id: 'career-compass', path: '/career-compass', authed: true },
  { id: 'recruiting-lens', path: '/recruiting-lens', authed: true },
  { id: 'profile', path: '/profile', authed: true, hasFormControls: true },
] as const;

/**
 * Raw engine/runtime text that must NEVER reach a user (UI-SPEC § Copywriting
 * Contract / XRUN-06). Used by the network specs as a leak guard — these are
 * engine-SPECIFIC strings, which is exactly why the check belongs in the @xdev
 * subset: the same failure produces different text in chromium, firefox and
 * webkit, and a chromium-only assertion would miss two thirds of it.
 */
export const RAW_ENGINE_ERROR_PATTERNS: readonly RegExp[] = [
  /Failed to fetch/i,
  /NetworkError when attempting to fetch/i,
  /\bLoad failed\b/,
  /ERR_INTERNET_DISCONNECTED/,
  /ERR_NAME_NOT_RESOLVED/,
  /\bTypeError:/,
  /\bSyntaxError:/,
  /Unexpected token '</,
  /Failed to load module script/i,
  /disallowed MIME type/i,
  /at .*\.js:\d+:\d+/,
];

/**
 * Navigate and wait for a LAYOUT-STABLE page.
 *
 * Deliberately structural, never timing-based: `#root` has content, the first
 * heading is visible (ProtectedRoute has resolved past its spinner), web fonts
 * have settled (font swap changes measured widths), and two animation frames
 * have passed so React has committed. No `waitForTimeout`, no retry.
 */
export async function gotoSettled(page: Page, surface: Surface | string): Promise<void> {
  const target = typeof surface === 'string' ? { path: surface } : surface;
  if (typeof surface !== 'string' && surface.anonymous) {
    await signOutLocally(page);
  }
  await page.goto(target.path);
  await settle(page);
}

/**
 * Drop the seeded session for THIS context only, so a signed-out surface renders.
 *
 * Cookies and the `localStorage` session are cleared and the page is reloaded, so
 * the next module evaluation reads empty storage. Done in-context rather than via
 * `browser.newContext()` so the project's device emulation (viewport, DPR,
 * `hasTouch`, user agent) is preserved — a `newContext()` would silently drop it
 * and turn `mobile-webkit` into plain desktop WebKit.
 *
 * SECURITY: nothing is read out of storage, only cleared. No value is logged.
 */
export async function signOutLocally(page: Page): Promise<void> {
  // An origin must be loaded before storage is scriptable.
  await page.goto('/');
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* restricted storage — already nothing to clear */
    }
  });
  await page.context().clearCookies();
}

export async function settle(page: Page): Promise<void> {
  const root = page.locator('#root');
  await expect(root).toBeAttached({ timeout: 30_000 });
  await expect(root).not.toBeEmpty({ timeout: 30_000 });
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      await document.fonts.ready;
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

/**
 * Apply a theme by swapping the `<html>` class, mirroring `ThemeToggle.tsx`
 * exactly. Then wait two frames so the resulting layout is measurable.
 */
export async function applyTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate(async (next) => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(next);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, theme);
}

/**
 * Resize and wait for the resulting layout to commit. `setViewportSize` resolves
 * before the render triggered by the resize, so two frames are required or a
 * measurement can read the PREVIOUS width's layout.
 */
export async function setWidth(page: Page, width: number): Promise<void> {
  const current = page.viewportSize();
  await page.setViewportSize({ width, height: current?.height ?? 800 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Record a discovery observation on the test report.
 *
 * SECURITY: annotations land in CI artifacts. Callers pass booleans, counts and
 * element shapes ONLY — never a storage value, a cookie, a request header or a
 * token. There is deliberately no `console.log` anywhere in this directory.
 */
export function record(testInfo: TestInfo, type: string, description: string): void {
  testInfo.annotations.push({ type, description });
}

/** Returns the visible body text, used only for leak-guard pattern matching. */
export async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body?.innerText ?? '');
}

/** Names of raw-engine patterns present in `text`. Never returns the text itself. */
export function rawEngineLeaks(text: string): string[] {
  return RAW_ENGINE_ERROR_PATTERNS.filter((pattern) => pattern.test(text)).map(
    (pattern) => pattern.source,
  );
}
