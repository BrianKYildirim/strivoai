/**
 * Phase 03 · 03-10 — the STATIC half of the UI-SPEC Surface F contract.
 *
 * WHY A SOURCE GUARD EXISTS AT ALL. Three of Surface F's rules are structurally
 * unassertable from a browser, and a suite that only ran `e2e/cross-device/*`
 * would report a confident green over all three:
 *
 *   1. `document.getAnimations()` does not observe framer-motion's RAF-driven
 *      transforms (03-RESEARCH Pitfall 8 / residual R-08). A count taken under
 *      `reducedMotion: 'reduce'` returns 0 while a perpetual RAF loop is still
 *      burning the CPU of the exact low-memory phone XDEV-09 is about. The
 *      `useReducedMotion()` gate is therefore only provable from source.
 *   2. `env(safe-area-inset-*)` resolves to `0px` under Playwright emulation and
 *      `getComputedStyle` returns the RESOLVED value, so a computed-style
 *      safe-area assertion is a guaranteed false green (Pitfall 7). Real-notch
 *      verification belongs to XTEST-04.
 *   3. The `vh`-before-`dvh` cascade order is a property of the emitted CSS
 *      TEXT. Once the browser has resolved `min-height` there is exactly one
 *      value left to read and the inversion this plan exists to prevent is
 *      invisible.
 *
 * So the motion budget in particular is proven TWICE, by two independent
 * mechanisms that fail for different reasons: this file for the source-level
 * gate, and `e2e/cross-device/responsive.spec.ts` for the live animation count.
 * Neither is sufficient alone. That pairing is the deliverable.
 *
 * Modeled on `src/test/security/xss-sink-guard.test.ts` — same non-empty-walk
 * fail-closed discipline, same file+reason violation reporting.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/**
 * The route components behind the ten audit surfaces in
 * `e2e/cross-device/surfaces.ts`. Kept as an explicit list rather than derived
 * from the router so that adding a surface to the E2E matrix without adding it
 * here is a visible omission rather than a silent one.
 */
const SURFACE_ENTRIES = [
  'src/pages/Index.tsx',
  'src/pages/Auth.tsx',
  'src/pages/Pricing.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/Onboarding.tsx',
  'src/pages/Upload.tsx',
  'src/pages/LinkedInGrader.tsx',
  'src/pages/CareerCompass.tsx',
  'src/pages/RecruitingLens.tsx',
  'src/pages/Profile.tsx',
] as const;

/**
 * Files inside the surface subtree that are DELIBERATELY not held to a rule
 * here, each with the plan that owns it. An exclusion must name an owner — an
 * unexplained entry is how a guard rots into decoration.
 */
const MOTION_GATE_EXCLUSIONS = new Map<string, string>();

/** Resolve a `@/…` import specifier to a file on disk, or null if it is external. */
function resolveAlias(spec: string): string | null {
  if (!spec.startsWith('@/')) return null;
  const base = join(SRC, spec.slice(2));
  for (const ext of ['.tsx', '.ts']) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of ['.tsx', '.ts']) {
    const idx = join(base, 'index' + ext);
    if (existsSync(idx)) return idx;
  }
  return null;
}

function toPosixRelative(fullPath: string): string {
  return fullPath.slice(ROOT.length + 1).split(sep).join('/');
}

/**
 * Every source file reachable from an audit-surface route.
 *
 * Deliberately a real import walk rather than a hand-maintained list: the whole
 * failure mode this phase documents is a defect living in a file nobody thought
 * to check. A shared primitive that a surface pulls in transitively is on that
 * surface, and the guard has to agree with the browser about that.
 */
function collectSurfaceFiles(): string[] {
  const seen = new Set<string>();
  const visit = (full: string): void => {
    if (seen.has(full)) return;
    seen.add(full);
    const src = readFileSync(full, 'utf8');
    for (const match of src.matchAll(/from\s+['"](@\/[^'"]+)['"]/g)) {
      const resolved = resolveAlias(match[1]);
      if (resolved) visit(resolved);
    }
  };
  for (const entry of SURFACE_ENTRIES) visit(join(ROOT, entry));
  return [...seen].map(toPosixRelative).sort();
}

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

describe('Phase 03 · UI-SPEC Surface F — responsive / touch / motion source guard', () => {
  const surfaceFiles = collectSurfaceFiles();

  it('resolves the audit-surface import graph (non-empty-walk guard)', () => {
    // Fail-closed. A broken alias resolver or a wrong cwd would walk zero files
    // and every assertion below would pass vacuously — the single most likely
    // way this guard silently stops guarding.
    expect(surfaceFiles.length).toBeGreaterThan(50);
    for (const entry of SURFACE_ENTRIES) {
      expect(surfaceFiles, `${entry} must appear in its own import walk`).toContain(entry);
    }
    // The walk must reach past the page layer into shared primitives, otherwise
    // it is only re-checking the ten files it was handed.
    expect(surfaceFiles).toContain('src/components/ui/button.tsx');
  });

  // ── UI-SPEC F5 / § Typography — iOS focus zoom (XD-13, OT-18) ──────────────

  it('F5/XD-13: textarea and select compute >= 16px below `md`', () => {
    // iOS Safari zooms the viewport on focus when a control computes under 16px
    // and does NOT zoom back out, which both breaks the layout and strands the
    // user. `input.tsx` already shipped the fix; these two were left at 14px.
    const offenders: string[] = [];

    // The two primitives 03-10 fixed carry the classes ADJACENTLY, which is the
    // literal form the plan specifies and the form a reviewer greps for.
    for (const rel of ['src/components/ui/textarea.tsx', 'src/components/ui/select.tsx']) {
      if (!read(rel).includes('text-base md:text-sm')) offenders.push(rel);
    }

    // `input.tsx` was already compliant before this plan and writes the same
    // contract with the classes at opposite ends of the shadcn class string, so
    // it is checked by TOKEN rather than by adjacency. `\b` boundaries matter:
    // the string also contains `file:text-sm`, which is the file-picker label,
    // not the control's own font size.
    const input = read('src/components/ui/input.tsx');
    if (!/(^|\s|")text-base(\s|")/.test(input) || !/(^|\s)md:text-sm(\s|")/.test(input)) {
      offenders.push('src/components/ui/input.tsx');
    }

    expect(
      offenders,
      'These form primitives must render >= 16px below `md` and are unchanged at `md`+ ' +
        '(`text-base` + `md:text-sm`). Reverting one to a bare `text-sm` reintroduces XD-13: ' +
        `iOS Safari zooms the viewport on focus and does not zoom back. Offenders: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  // ── UI-SPEC F5 — the dvh fallback cascade (Task 1's invariant) ─────────────

  it('F5: the viewport utilities emit `100vh` BEFORE `100dvh` inside one rule', () => {
    // The reason this is asserted on TEXT and not in a browser: `min-h-screen
    // min-h-[100dvh]` looks like a fallback pair, but Tailwind emits utilities
    // grouped by property with its own internal sort, so which declaration wins
    // is not guaranteed by class order. A single rule in source order is the
    // only deterministic construction — and once the browser has resolved
    // `min-height`, the inversion is unobservable.
    const css = read('src/index.css');
    for (const [name, prop] of [
      ['.min-h-viewport', 'min-height'],
      ['.h-viewport', 'height'],
    ] as const) {
      const rule = new RegExp(
        `\\${name}\\s*\\{[^}]*?${prop}:\\s*100vh;[^}]*?${prop}:\\s*100dvh;[^}]*?\\}`,
      );
      expect(
        rule.test(css),
        `${name} must emit \`${prop}: 100vh\` immediately followed by \`${prop}: 100dvh\` in a ` +
          'SINGLE rule. Splitting them across rules or reversing the order silently breaks the ' +
          'fallback on browsers without `dvh` support.',
      ).toBe(true);
    }
  });

  // ── UI-SPEC F6 / XD-24 — the motion budget's source half (OT-20) ───────────

  it('F6/XD-24: every framer-motion infinite loop on a surface is gated behind useReducedMotion()', () => {
    // THE assertion this file exists for. `repeat: Infinity` drives a
    // framer-motion RAF/WAAPI loop that `document.getAnimations()` cannot see
    // and that the global CSS `prefers-reduced-motion` reset in `index.css`
    // structurally cannot reach — CSS media queries do not apply to values
    // computed in JS. So the gate must be in the component, and source is the
    // only place its presence is provable.
    const offenders: string[] = [];
    for (const rel of surfaceFiles) {
      const src = read(rel);
      if (!/repeat:\s*(Infinity|Number\.POSITIVE_INFINITY)/.test(src)) continue;
      if (MOTION_GATE_EXCLUSIONS.has(rel)) continue;
      if (!/useReducedMotion/.test(src)) offenders.push(rel);
    }
    expect(
      offenders,
      'UI-SPEC F6 requires ZERO infinite animations under `prefers-reduced-motion: reduce`. These ' +
        'files run a framer-motion infinite loop with no `useReducedMotion()` gate. `getAnimations()` ' +
        'cannot observe them, so this guard is the only proof — import `useReducedMotion` from ' +
        `framer-motion and branch the \`animate\`/\`transition\` on it. Offenders: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('F6: every motion-gate exclusion still exists and still names an owning plan', () => {
    // Keeps the exclusion list honest. If 03-15 deletes or fixes
    // UniversalAnalyzing.tsx, this fails and the entry gets pruned deliberately
    // instead of quietly widening the hole.
    for (const [rel, reason] of MOTION_GATE_EXCLUSIONS) {
      expect(existsSync(join(ROOT, rel)), `${rel} is excluded but no longer exists`).toBe(true);
      expect(reason, `${rel}'s exclusion must name the plan that owns it`).toMatch(/03-\d\d/);
    }
  });

  it('F6: the global reduced-motion reset for CSS animations is present in index.css', () => {
    // The complement of the assertion above. Tailwind `animate-*` utilities and
    // hand-authored `@keyframes` are CSS animations, unreachable from
    // `useReducedMotion()`; a per-component fix cannot close them and a
    // per-utility opt-out would miss the next one added. Only the blanket
    // media-query reset holds for every current AND future CSS animation.
    const css = read('src/index.css');
    const reset =
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?animation-iteration-count:\s*1\s*!important/;
    expect(
      reset.test(css),
      'src/index.css must carry a `@media (prefers-reduced-motion: reduce)` block forcing ' +
        '`animation-iteration-count: 1 !important`. Without it every Tailwind `animate-*` utility ' +
        'keeps looping under `reduce`, and no component-level gate can stop it.',
    ).toBe(true);
  });

  it('F6: no `blur-3xl` sits on an animated element on an audit surface', () => {
    // A 3xl blur is the single most expensive paint in the app; compositing it
    // every frame is what makes a mid-range phone drop frames. Static blurs are
    // explicitly fine, so the rule is about co-occurrence on ONE element, not
    // about the utility existing in the file.
    const offenders: string[] = [];
    for (const rel of surfaceFiles) {
      if (MOTION_GATE_EXCLUSIONS.has(rel)) continue;
      const src = read(rel);
      if (!src.includes('blur-3xl')) continue;
      // Inspect the element the utility sits on: the enclosing tag, bounded so a
      // `blur-3xl` static div followed by an unrelated <motion.div> later in the
      // file cannot produce a false positive.
      for (const match of src.matchAll(/<[A-Za-z][^>]*blur-3xl[^>]*>/g)) {
        if (/\b(animate|whileHover|whileInView|whileTap)\s*=/.test(match[0])) {
          offenders.push(`${rel}: ${match[0].slice(0, 120)}`);
        }
      }
    }
    expect(
      offenders,
      `UI-SPEC F6 forbids \`blur-3xl\` on an animated element. Offenders: ${offenders.join(' | ')}`,
    ).toEqual([]);
  });

  // ── UI-SPEC F5 / WCAG 1.4.4 — the viewport meta (OT-19) ────────────────────

  it('OT-19/WCAG 1.4.4: the viewport meta disables neither pinch-zoom nor scaling', () => {
    // The tempting "fix" for iOS focus zoom is `maximum-scale=1` or
    // `user-scalable=no`. Both trade XD-13 for a WCAG 1.4.4 failure and remove
    // a low-vision user's only magnification. The real fix is the >= 16px font
    // size asserted above; this guard makes the wrong fix un-shippable.
    const html = read('index.html');
    const meta = html.match(/<meta[^>]*name=["']viewport["'][^>]*>/i);
    expect(meta, 'index.html must declare a viewport meta tag').not.toBeNull();
    const tag = meta![0];
    expect(tag, 'viewport meta must set width=device-width').toMatch(/width=device-width/);
    expect(
      /user-scalable/i.test(tag),
      `WCAG 1.4.4: the viewport meta must not contain \`user-scalable\`. Found: ${tag}`,
    ).toBe(false);
    expect(
      /maximum-scale/i.test(tag),
      `WCAG 1.4.4: the viewport meta must not contain \`maximum-scale\`. Found: ${tag}`,
    ).toBe(false);
  });

  it('OT-19: safe-area — `viewport-fit=cover` and `env(safe-area-inset-*)` ship together', () => {
    // A PAIRED invariant, deliberately not a bare "must contain viewport-fit"
    // assertion: `viewport-fit=cover` is plan 03-07's edit, and 03-10 may only
    // assert it. Written this way the rule is meaningful in both states — today
    // it holds because neither half is present, and the moment 03-07 opts the
    // page into the display cutout it becomes load-bearing, because that is
    // exactly when content can slide under a notch or a home indicator.
    //
    // The computed value is NOT assertable: `env()` resolves to `0px` under
    // Playwright emulation. Real-notch verification is XTEST-04's manual pass.
    const html = read('index.html');
    const meta = html.match(/<meta[^>]*name=["']viewport["'][^>]*>/i)?.[0] ?? '';
    const optedIn = /viewport-fit\s*=\s*cover/i.test(meta);
    if (!optedIn) {
      // Documented hand-off, not a silent skip: 03-07 owns the edit.
      expect(optedIn, 'viewport-fit=cover is pending plan 03-07').toBe(false);
      return;
    }
    const usesSafeArea =
      read('src/index.css').includes('env(safe-area-inset-') ||
      surfaceFiles.some((rel) => read(rel).includes('env(safe-area-inset-'));
    expect(
      usesSafeArea,
      'index.html opts into `viewport-fit=cover`, so the app now paints into the display cutout. ' +
        'At least one viewport-edge-anchored surface must pad with `env(safe-area-inset-*)`, or ' +
        'fixed headers/footers will sit under the notch and the home indicator.',
    ).toBe(true);
  });
});
