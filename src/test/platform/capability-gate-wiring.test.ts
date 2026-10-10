/**
 * capability-gate-wiring.test.ts — XDEV-01 / XRUN-01 static wiring guard (plan 03-11).
 *
 * THE FAILURE THIS EXISTS TO PREVENT: one AI page left unwired. If a single start CTA
 * never renders `BlockedAiEntryPoint`, that feature will happily start a run — reserve
 * Merits, charge the ledger — on a browser the gate has already judged incapable of
 * finishing it. The Merit ledger then holds a charge with no result.
 *
 * WHY STATIC AND NOT ONLY IN PLAYWRIGHT: the seeded E2E account is FREE tier, and two
 * of the five AI pages (Recruiting Lens, Interview Prep) render a tier gate before any
 * start CTA exists. A browser assertion on those two therefore cannot distinguish
 * "correctly wired but tier-gated" from "never wired at all", which is exactly how an
 * unwired page passes vacuously forever. This guard has no tier dependency.
 *
 * Modelled on `src/test/platform/polyfill-realm-source-guard.test.ts`, the repo's
 * canonical static-source guard, including its non-vacuity assertions.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();

/** The five AI start CTAs named by the phase brief. All five, or the guard is a lie. */
const AI_ENTRY_POINT_FILES: readonly string[] = [
  'src/pages/Upload.tsx',
  'src/pages/LinkedInGrader.tsx',
  'src/pages/CareerCompass.tsx',
  'src/pages/RecruitingLens.tsx',
  'src/pages/InterviewPrep.tsx',
];

/** The two checkout entry points. */
const CHECKOUT_ENTRY_POINT_FILES: readonly string[] = [
  'src/pages/Pricing.tsx',
  'src/components/topup/TopUpProvider.tsx',
];

/**
 * Explicitly NOT wired, and that is a decision rather than an omission:
 *  - `IntakeForm.tsx` is a SHARED component; Interview Prep is blocked at the page's
 *    render site instead, so the form is untouched for every other caller.
 *  - `Onboarding.tsx` is a post-signup submit, owned by plan 03-16 — not one of the
 *    five AI start CTAs.
 */
const DELIBERATELY_UNWIRED: readonly string[] = [
  'src/components/interviewPrep/IntakeForm.tsx',
  'src/pages/Onboarding.tsx',
];

function read(relPath: string): string {
  return readFileSync(join(REPO, relPath), 'utf8');
}

describe('XDEV-01 capability-gate wiring guard', () => {
  it('the entry-point lists are non-empty and the expected size (fail-closed)', () => {
    // An emptied list would make every assertion below pass over zero files.
    expect(AI_ENTRY_POINT_FILES.length).toBe(5);
    expect(CHECKOUT_ENTRY_POINT_FILES.length).toBe(2);
  });

  it('every named entry-point file still exists (a rename cannot shrink the guard)', () => {
    const missing = [...AI_ENTRY_POINT_FILES, ...CHECKOUT_ENTRY_POINT_FILES].filter(
      (rel) => !existsSync(join(REPO, rel)),
    );
    expect(
      missing,
      `Entry-point file(s) missing: ${missing.join(', ')}. If a page was renamed, update `
        + `this list deliberately — do not let the guard shrink by accident.`,
    ).toEqual([]);
  });

  it('all five AI start CTAs render BlockedAiEntryPoint', () => {
    const offenders = AI_ENTRY_POINT_FILES.filter(
      (rel) => !read(rel).includes('BlockedAiEntryPoint'),
    );
    expect(
      offenders,
      `AI start CTA(s) with no capability gate: ${offenders.join(', ')}. An unwired page `
        + `starts a run — and reserves Merits — on a browser that cannot finish it.`,
    ).toEqual([]);
  });

  it('all five AI pages read the capability verdict from the shared module', () => {
    const offenders = AI_ENTRY_POINT_FILES.filter(
      (rel) => !read(rel).includes('isAiBlocked'),
    );
    expect(
      offenders,
      `Page(s) importing the gate component without reading the verdict: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('both checkout entry points block before a session or PaymentIntent', () => {
    const offenders = CHECKOUT_ENTRY_POINT_FILES.filter((rel) => {
      const source = read(rel);
      return (
        !source.includes('useCheckoutCapability') ||
        !/BlockedCheckout(EntryPoint|Notice)/.test(source)
      );
    });
    expect(
      offenders,
      `Checkout entry point(s) with no capability gate: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('the shared IntakeForm and Onboarding are deliberately NOT gated here', () => {
    for (const rel of DELIBERATELY_UNWIRED) {
      expect(
        read(rel).includes('BlockedAiEntryPoint'),
        `${rel} must NOT be gated by plan 03-11 — see the note above this list.`,
      ).toBe(false);
    }
  });

  it('the gate never parses a user-agent string (D-06)', () => {
    // Feature detection, never version parsing. The evidential reason is local: the
    // getOrInsertComputed bug shipped in browsers that were otherwise current.
    for (const rel of [
      'src/lib/platform/capabilities.ts',
      'src/lib/platform/capability-copy.ts',
      'src/components/platform/CapabilityGate.tsx',
    ]) {
      const codeLines = read(rel)
        .split('\n')
        .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
      const offending = codeLines.filter((line) =>
        /navigator\s*\.\s*(userAgent|appVersion|platform)/.test(line),
      );
      expect(offending, `${rel} parses a user agent — D-06 forbids it`).toEqual([]);
    }
  });

  it('the gate does not probe capabilities the app never uses', () => {
    // 03-WORKER-FLOOR-FINDING.md / residual R-23: `structuredClone` is used ZERO times
    // repo-wide, so probing it would report a capability the app does not need and
    // produce a false `degraded` verdict. `TextDecoderStream` and `EventSource` are
    // absent for the same reason — `useResumeStream` uses `getReader()` + `TextDecoder`.
    const codeLines = read('src/lib/platform/capabilities.ts')
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
    for (const unused of ['structuredClone', 'TextDecoderStream', 'EventSource']) {
      const offending = codeLines.filter((line) => line.includes(unused));
      expect(
        offending,
        `capabilities.ts probes ${unused}, which HEAD never uses — that is a false-positive `
          + `block waiting to happen.`,
      ).toEqual([]);
    }
  });

  it('the guard can actually see file contents (parser sanity — non-vacuous)', () => {
    // If `read` silently returned '' the "no offenders" assertions above would pass
    // while proving nothing.
    for (const rel of [...AI_ENTRY_POINT_FILES, ...CHECKOUT_ENTRY_POINT_FILES]) {
      expect(read(rel).length, `${rel} read as empty`).toBeGreaterThan(100);
    }
    // And it must be capable of reporting an offender.
    expect('nothing here'.includes('BlockedAiEntryPoint')).toBe(false);
  });
});
