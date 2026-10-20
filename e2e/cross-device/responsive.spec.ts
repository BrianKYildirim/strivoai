/**
 * Phase 03 · 03-05 → 03-10 · XDEV-05 + XDEV-09 — horizontal overflow and the
 * motion budget across the matrix.
 *
 * PROMOTED FROM DISCOVERY TO REGRESSION by plan 03-10 (XTEST-03). 03-05 wrote
 * this to FIND defects and its failures were the deliverable; every one it found
 * (XD-04 … XD-10) is now fixed, so from here the contract below is asserted and a
 * failure is a regression, not a finding. The offender reporting is deliberately
 * kept — it is what makes a future failure actionable in one run instead of
 * three.
 *
 * THE CONTRACT (UI-SPEC F3): at every tested width, on every audit surface, in
 * both themes —
 *     document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
 * The only exemption is an element that opts in with `data-allow-overflow-x="true"`.
 *
 * WHY THIS BELONGS IN @xdev: the same CSS produces different used widths per
 * engine — WebKit and Gecko differ from Blink on flex/grid min-content sizing,
 * scrollbar gutters and font fallback metrics, and the two mobile projects run at
 * DPR 3 / 2.625 where sub-pixel rounding is real. A chromium-only sweep would
 * give a different answer, which is the admission rule for this subset.
 *
 * WHAT 03-05 FOUND AND 03-10 FIXED: XD-04 (landing, Gecko/WebKit only),
 * XD-05 (`/pricing` `scale-105` at 767 px), XD-06 (an unwrappable `Badge` holding
 * a model-generated string, measured 857 px), XD-07 (Career Compass fixed-width
 * readiness bars), XD-08 (the 5910 px Elite-gate orb), XD-09 (`/profile` at
 * 320 px) and XD-10 (the mobile-chromium secondary offenders).
 *
 * ACTIONABILITY: "overflow at 320px" is not a bug report. On failure the spec
 * reports the offending elements — tag, id, class list, computed width and right
 * edge — so 03-10 starts from a CSS selector, not a hypothesis.
 *
 * NO RUN IS STARTED: the four AI routes below are INPUT screens. Nothing here
 * clicks a start-analysis CTA, so no Merit is ever consumed.
 */
import { test, expect } from '@playwright/test';
import {
  SURFACES,
  THEMES,
  WIDTHS,
  applyTheme,
  gotoSettled,
  record,
  setWidth,
} from './surfaces';

interface Offender {
  tag: string;
  id: string;
  cls: string;
  width: number;
  right: number;
}

interface OverflowProbe {
  overflow: boolean;
  clientWidth: number;
  scrollWidth: number;
  offenders: Offender[];
}

/**
 * Measured in-page so a single round trip returns both the verdict AND the
 * evidence. Elements inside a `data-allow-overflow-x="true"` subtree are skipped
 * per UI-SPEC F3's opt-in exemption.
 */
async function probeOverflow(page: import('@playwright/test').Page): Promise<OverflowProbe> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const clientWidth = de.clientWidth;
    const scrollWidth = de.scrollWidth;
    if (scrollWidth <= clientWidth + 1) {
      return { overflow: false, clientWidth, scrollWidth, offenders: [] };
    }

    const offenders: Offender[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      // UI-SPEC F3: an intentional horizontal scroller opts in explicitly.
      if (el.closest('[data-allow-overflow-x="true"]')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right <= clientWidth + 1) continue;
      offenders.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        // getAttribute, not `.className` — SVGAnimatedString has no `.slice`.
        cls: (el.getAttribute('class') || '').slice(0, 160),
        width: Math.round(rect.width),
        right: Math.round(rect.right),
      });
    }
    // Widest right edge first: the outermost cause tends to be the deepest
    // overhang, and 03-10 wants the root cause, not the last child.
    offenders.sort((a, b) => b.right - a.right);
    return { overflow: true, clientWidth, scrollWidth, offenders: offenders.slice(0, 6) };
  });
}

/**
 * UI-SPEC F6's browser half: how many animations are running RIGHT NOW and never
 * stop.
 *
 * DELIBERATELY PAIRED WITH `src/test/platform/responsive-source-guard.test.ts`,
 * and neither is sufficient alone. `document.getAnimations()` returns CSS
 * animations and WAAPI animations — it does NOT observe framer-motion's
 * RAF-driven transforms (03-RESEARCH Pitfall 8 / residual R-08). So this count
 * can read a confident ZERO while a perpetual RAF loop is still burning the CPU
 * of the low-memory phone XDEV-09 is about. The source guard covers exactly that
 * blind spot by proving every `repeat: Infinity` is gated behind
 * `useReducedMotion()`; this function covers the half the source guard cannot —
 * what the composed page actually ends up running, including animations that
 * arrive from a dependency's stylesheet.
 */
async function countInfiniteAnimations(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() =>
    document.getAnimations().flatMap((animation) => {
      const timing = animation.effect?.getTiming();
      // `playState === 'finished'` matters: the global reduced-motion reset in
      // `index.css` clamps every CSS animation to one 0.01 ms iteration rather
      // than removing it, so a just-finished animation can still be in this
      // list for a frame. Only a genuinely perpetual one counts against F6.
      if (!timing || timing.iterations !== Infinity) return [];
      if (animation.playState === 'finished' || animation.playState === 'idle') return [];
      const target = (animation.effect as KeyframeEffect | undefined)?.target ?? null;
      const name = (animation as unknown as { animationName?: string }).animationName ?? 'web-animation';
      return [
        `${name} on <${target?.tagName.toLowerCase() ?? '?'} class="${(
          target?.getAttribute('class') || ''
        ).slice(0, 100)}">`,
      ];
    }),
  );
}

/** UI-SPEC F6 — "at most 2 concurrent infinite animations per screen". */
const MOTION_BUDGET = 2;

test.describe('responsive overflow discovery @xdev', () => {
  for (const surface of SURFACES) {
    test(`no horizontal overflow — ${surface.id}`, async ({ page }, testInfo) => {
      record(testInfo, 'project', testInfo.project.name);
      record(
        testInfo,
        'cases',
        `${WIDTHS.length} widths x ${THEMES.length} themes = ${WIDTHS.length * THEMES.length}`,
      );

      await gotoSettled(page, surface);

      // XDEV-09 / UI-SPEC F6, measured on the page load this test already paid
      // for. Folded in here rather than given its own describe block because a
      // separate default-motion pass would double the navigation cost of the
      // whole matrix — 10 surfaces x 5 projects of extra page loads — to
      // re-measure a page that is already open and settled.
      const running = await countInfiniteAnimations(page);
      record(testInfo, 'infinite-animations', String(running.length));
      expect(
        running.length,
        `UI-SPEC F6 allows at most ${MOTION_BUDGET} concurrent infinite animations per screen; ` +
          `${surface.id} runs ${running.length} on ${testInfo.project.name}. NOTE: this count ` +
          'cannot see framer-motion RAF transforms, so the real load is >= this number — see ' +
          `src/test/platform/responsive-source-guard.test.ts. Running: ${running.join(' | ')}`,
      ).toBeLessThanOrEqual(MOTION_BUDGET);

      const failures: string[] = [];

      for (const theme of THEMES) {
        await applyTheme(page, theme);
        for (const width of WIDTHS) {
          await setWidth(page, width);
          const probe = await probeOverflow(page);
          if (!probe.overflow) continue;

          const detail = probe.offenders
            .map(
              (o) =>
                `      <${o.tag}${o.id ? `#${o.id}` : ''} class="${o.cls}"> ` +
                `width=${o.width}px right=${o.right}px`,
            )
            .join('\n');
          failures.push(
            `  ${surface.id} @ ${width}px / ${theme}: ` +
              `scrollWidth=${probe.scrollWidth} > clientWidth=${probe.clientWidth}\n` +
              (detail || '      (no element exceeded the client width — check a ' +
                'transform, a negative margin, or a fixed-position decoration)'),
          );
        }
      }

      // ONE failure carrying the FULL backlog for this surface. Aborting on the
      // first width would force 03-10 to rediscover the rest one run at a time.
      expect(
        failures,
        `UI-SPEC F3 horizontal-overflow violations on ${testInfo.project.name}:\n${failures.join('\n')}`,
      ).toEqual([]);
    });
  }
});

/**
 * UI-SPEC F6 / § Accessibility Contract — under `prefers-reduced-motion: reduce`
 * the count must be exactly ZERO, not merely under budget.
 *
 * HARNESS FINDING (H-4), the reason this is not written the obvious way: the
 * documented top-level form `test.use({ reducedMotion: 'reduce' })` SILENTLY
 * NO-OPS in this config — the page still reports `no-preference`, so every
 * assertion under it would have measured the DEFAULT state and reported it as a
 * reduced-motion pass. `test.use({ contextOptions: { reducedMotion } })` and
 * `page.emulateMedia()` both work; the latter is used here because it is
 * explicit at the call site and cannot be undone by a fixture merge. It is set
 * BEFORE the first navigation, so the media query is evaluated as the stylesheet
 * is first applied rather than toggled after paint.
 *
 * The `matchMedia` assertion below is not decoration — it is the only thing that
 * caught H-4, and it is what keeps this whole block from rotting back into a
 * confident measurement of nothing.
 *
 * SCOPED SUBSET, and this is a budget decision recorded in
 * `03-RESIDUAL-REGISTER.md` (R-21): the four surfaces below are the only ones
 * measured to carry any infinite animation at all — the marquee wall on
 * `landing`, the skeleton shimmer on `dashboard`, `BlurredLockCard` on
 * `career-compass`, and the Elite gate on `recruiting-lens`. The other six
 * measured zero in BOTH modes, so paying for another 30 page loads across five
 * projects would buy a re-assertion of `0 === 0`. The SOURCE guard is not scoped
 * — it covers all ten surfaces plus their whole transitive import graph — so no
 * surface loses coverage of the gate itself, only of a redundant browser count.
 */
const MOTION_SURFACES = SURFACES.filter((surface) =>
  ['landing', 'dashboard', 'career-compass', 'recruiting-lens'].includes(surface.id),
);

test.describe('reduced-motion budget @xdev', () => {
  test('the scoped motion subset is non-empty (anti-vacuity guard)', () => {
    // A filter typo would silently reduce this describe block to zero tests and
    // Playwright would report a green run over nothing.
    expect(MOTION_SURFACES.length).toBe(4);
  });

  for (const surface of MOTION_SURFACES) {
    test(`zero infinite animations under reduce — ${surface.id}`, async ({ page }, testInfo) => {
      record(testInfo, 'project', testInfo.project.name);

      // Set BEFORE the first navigation — see H-4 in this file's header.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await gotoSettled(page, surface);

      // Proves the preference actually reached the page. Without this, a
      // harness regression in `reducedMotion` support would turn every assertion
      // below into a measurement of the DEFAULT state reported as a
      // reduced-motion pass — the exact false green this phase keeps finding,
      // and the one that actually fired here.
      const prefersReduce = await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
      expect(
        prefersReduce,
        'the reduced-motion preference did not reach the page; the assertion below would be vacuous',
      ).toBe(true);

      const running = await countInfiniteAnimations(page);
      expect(
        running,
        `UI-SPEC F6 requires ZERO infinite animations under \`prefers-reduced-motion: reduce\`, but ` +
          `${surface.id} runs ${running.length} on ${testInfo.project.name}. A CSS animation escaping ` +
          'here means the blanket reset in `src/index.css` was narrowed; a framer-motion loop escaping ' +
          'here is invisible to this count and is caught by the source guard instead. Running: ' +
          `${running.join(' | ')}`,
      ).toEqual([]);
    });
  }
});
