/**
 * Phase 03 · 03-05 · XDEV-05 / UI-SPEC F4 + F5 — tap-target and input-zoom
 * DISCOVERY on the two DEVICE projects.
 *
 * WHY MOBILE-ONLY: a 44x44 hit area is a DEVICE contract (finger, `hasTouch`,
 * DPR), not an engine contract. Running it on the three desktop projects would
 * triple the matrix cost of this file and answer a question nobody asked, which
 * violates D-02's budget rule and 03-03's admission rule ("a spec joins @xdev
 * only if it asserts something engine-, viewport-, DPR- or input-modality-
 * dependent"). It stays in the @xdev subset because it must run on BOTH
 * `mobile-webkit` (WebKit, DPR 3) and `mobile-chromium` (Blink, DPR 2.625) —
 * rounding of a 43.5px box differs between them.
 *
 * THE CONTRACT:
 *   F4 — every interactive element on an audit surface is >= 44x44 CSS px, with
 *        >= 8 CSS px between adjacent tap targets.
 *   F5 — every `input` / `textarea` / `select` computes font-size >= 16px below
 *        `md`. Below 16px, iOS Safari ZOOMS the viewport on focus, which both
 *        breaks the layout and traps users who cannot zoom back out reliably.
 *
 * EXPECTED RED AT HEAD (this is the deliverable, not a defect in the spec):
 * `03-RESEARCH.md` § HEAD Grounding records `textarea.tsx` and `select.tsx` as
 * `text-sm` (14px) where the contract requires `text-base md:text-sm`. Plan
 * 03-10 owns the fix. Do NOT silence this assertion.
 *
 * THIS PLAN FINDS, IT DOES NOT FIX (D-22). No `src/` or `supabase/` file is
 * modified. No start-analysis CTA is clicked, so no Merit is consumed.
 */
import { test, expect } from '@playwright/test';
import { MOBILE_PROJECTS, SURFACES, gotoSettled, record, setWidth } from './surfaces';

/** UI-SPEC F4. */
const MIN_TAP_PX = 44;
const MIN_GAP_PX = 8;
/** UI-SPEC F5 — the iOS focus-zoom trigger, asserted at the narrowest device width. */
const MIN_CONTROL_FONT_PX = 16;
const FORM_CONTROL_WIDTH = 390;

const INTERACTIVE_SELECTOR = 'button, a, [role=button], input, select, summary';

/**
 * `[role=combobox]` is NOT decoration. shadcn's `SelectTrigger` renders a
 * `<button role="combobox">`, never a native `<select>` — a bare
 * `input, textarea, select` probe silently inspects ZERO of the two primitives
 * `03-RESEARCH.md` names as non-compliant, and reports green.
 */
const FORM_CONTROL_SELECTOR = 'input, textarea, select, [role=combobox]';

test.describe('touch target discovery @xdev', () => {
  for (const surface of SURFACES) {
    test(`tap targets and control font size — ${surface.id}`, async ({ page }, testInfo) => {
      // Scoped to the two device projects. Declared in the test body rather than a
      // `beforeEach(({}, testInfo) => …)`: Playwright requires a destructuring
      // pattern for the fixtures argument and ESLint's `no-empty-pattern` rejects
      // the empty one, so the two tools only agree here.
      test.skip(
        !MOBILE_PROJECTS.has(testInfo.project.name),
        'Tap targets and iOS focus-zoom are device contracts — only the two mobile projects.',
      );

      record(testInfo, 'project', testInfo.project.name);

      await gotoSettled(page, surface);
      await setWidth(page, FORM_CONTROL_WIDTH);

      const probe = await page.evaluate(
        ({ selector, controlSelector, minTap, minGap, minFont }) => {
          const isVisible = (el: Element): boolean => {
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (Number(style.opacity) === 0) return false;
            const rect = el.getBoundingClientRect();
            // `sr-only` controls (e.g. the visually-hidden file input) are
            // clipped to 1px by design and are operated through their <label>.
            if (rect.width <= 1 || rect.height <= 1) return false;
            return true;
          };

          const describe = (el: Element): string => {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            const cls = (el.getAttribute('class') || '').slice(0, 90);
            const name =
              el.getAttribute('aria-label') ||
              (el.textContent || '').trim().slice(0, 40) ||
              el.getAttribute('name') ||
              '';
            return `<${tag}${id} class="${cls}">${name ? ` "${name}"` : ''}`;
          };

          const elements = Array.from(document.querySelectorAll(selector)).filter(isVisible);

          const undersized: string[] = [];
          const boxes: { label: string; x: number; y: number; w: number; h: number }[] = [];
          for (const el of elements) {
            const rect = el.getBoundingClientRect();
            const w = Math.round(rect.width * 100) / 100;
            const h = Math.round(rect.height * 100) / 100;
            boxes.push({ label: describe(el), x: rect.left, y: rect.top, w: rect.width, h: rect.height });
            if (w + 0.5 < minTap || h + 0.5 < minTap) {
              undersized.push(`${describe(el)} — ${w}x${h}px (min ${minTap}x${minTap})`);
            }
          }

          // Adjacency = the two boxes overlap on one axis and are separated by
          // less than the minimum gap on the other. Overlapping boxes are NOT a
          // gap violation (a button inside a link is one target, not two).
          const crowded: string[] = [];
          for (let i = 0; i < boxes.length; i += 1) {
            for (let j = i + 1; j < boxes.length; j += 1) {
              const a = boxes[i];
              const b = boxes[j];
              const overlapsY = a.y < b.y + b.h && b.y < a.y + a.h;
              const overlapsX = a.x < b.x + b.w && b.x < a.x + a.w;
              const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
              const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
              if (overlapsY && gapX >= 0 && gapX < minGap) {
                crowded.push(
                  `${a.label} | ${b.label} — horizontal gap ${Math.round(gapX * 100) / 100}px (min ${minGap})`,
                );
              } else if (overlapsX && gapY >= 0 && gapY < minGap) {
                crowded.push(
                  `${a.label} | ${b.label} — vertical gap ${Math.round(gapY * 100) / 100}px (min ${minGap})`,
                );
              }
            }
          }

          const smallFont: string[] = [];
          const controls = Array.from(document.querySelectorAll(controlSelector)).filter(isVisible);
          for (const el of controls) {
            const px = parseFloat(getComputedStyle(el).fontSize);
            if (Number.isFinite(px) && px + 0.01 < minFont) {
              smallFont.push(`${describe(el)} — font-size ${px}px (min ${minFont})`);
            }
          }

          return {
            undersized,
            crowded,
            smallFont,
            inspected: elements.length,
            controlsInspected: controls.length,
          };
        },
        {
          selector: INTERACTIVE_SELECTOR,
          controlSelector: FORM_CONTROL_SELECTOR,
          minTap: MIN_TAP_PX,
          minGap: MIN_GAP_PX,
          minFont: MIN_CONTROL_FONT_PX,
        },
      );

      record(testInfo, 'interactive-elements', String(probe.inspected));
      record(testInfo, 'form-controls', String(probe.controlsInspected));

      // A surface with no interactive element means navigation silently failed;
      // a green "0 violations of 0 elements" is the vacuity this phase exists to
      // rule out.
      expect(probe.inspected, `no interactive element found on ${surface.id}`).toBeGreaterThan(0);

      // ANTI-VACUITY for F5 specifically. A surface declared to carry text-entry
      // controls must actually expose one to the probe; otherwise the "0 font-size
      // violations" result below means "nothing was measured", not "nothing is wrong".
      if (surface.hasFormControls) {
        expect(
          probe.controlsInspected,
          `${surface.id} is declared to render form controls but the F5 probe found none — ` +
            `the >= ${MIN_CONTROL_FONT_PX}px assertion would be vacuous`,
        ).toBeGreaterThan(0);
      }

      // ALL THREE violation classes reported together — one run yields the whole
      // backlog for 03-10 instead of one element per run.
      const report: string[] = [];
      if (probe.undersized.length) {
        report.push(`F4 tap targets < ${MIN_TAP_PX}px (${probe.undersized.length}):`);
        report.push(...probe.undersized.map((line) => `    ${line}`));
      }
      if (probe.crowded.length) {
        report.push(`F4 adjacent targets < ${MIN_GAP_PX}px apart (${probe.crowded.length}):`);
        report.push(...probe.crowded.map((line) => `    ${line}`));
      }
      if (probe.smallFont.length) {
        report.push(`F5 form controls < ${MIN_CONTROL_FONT_PX}px at ${FORM_CONTROL_WIDTH}px (${probe.smallFont.length}):`);
        report.push(...probe.smallFont.map((line) => `    ${line}`));
      }

      expect(
        report,
        `UI-SPEC F4/F5 violations on ${surface.id} / ${testInfo.project.name}:\n${report.join('\n')}`,
      ).toEqual([]);
    });
  }
});
