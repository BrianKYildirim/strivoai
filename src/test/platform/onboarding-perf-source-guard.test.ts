import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Source guard for the onboarding latency optimizations (quick 260805-8ni).
 *
 * The measured prod baseline was 11.57s of strictly serial overhead before `analyze-resume`
 * was even dispatched — and because VITE_FEATURE_ANALYSIS_LIFECYCLE is off, that whole window
 * is time the user spends on the setup screen. Every property asserted here is load-bearing
 * for that fix AND for the invariants the fix was required not to disturb. They are cheap to
 * regress accidentally during an unrelated edit to this handler, and a regression is invisible
 * at runtime (it just gets slower, or quietly changes which error a user sees), so guard them
 * in source.
 */

const REPO = process.cwd();
const ONBOARDING = 'src/pages/Onboarding.tsx';
const KEEP_WARM = 'supabase/functions/keep-warm/index.ts';

function read(relativePath: string): string {
  return readFileSync(join(REPO, relativePath), 'utf8');
}

describe('onboarding submit path stays fast (quick 260805-8ni)', () => {
  const source = read(ONBOARDING);

  it('fires the feature-run token without awaiting it', () => {
    // `await getFeatureRunToken(` is the regression: it reinstates a blocking round-trip to an
    // endpoint that returns 503 on 100% of prod calls, for a value the code already treats as
    // optional. 4.21s of the 11.57s baseline.
    expect(source).not.toContain('await getFeatureRunToken(');
    expect(source).toContain('getFeatureRunToken(correlationEnvelope).catch(() => undefined)');
  });

  it('attaches the token rejection handler at creation, not at the await', () => {
    // Without a catch at creation, the 503 lands on a promise nobody is awaiting yet and
    // surfaces as an unhandled rejection.
    const firing = source.indexOf('getFeatureRunToken(correlationEnvelope)');
    const awaiting = source.indexOf('await featureRunTokenPromise');
    expect(firing).toBeGreaterThan(-1);
    expect(awaiting).toBeGreaterThan(firing);
  });

  it('does not begin a costing run before the document validation gate', () => {
    // Firing begin-feature-run earlier would buy more overlap, but it would mint costing runs
    // for documents that are then rejected — runs that are never created today.
    const validation = source.indexOf('"validate-document"');
    const firing = source.indexOf('getFeatureRunToken(correlationEnvelope)');
    expect(validation).toBeGreaterThan(-1);
    expect(firing).toBeGreaterThan(validation);
  });

  it('keeps writes -> extraction -> merits STRICTLY SEQUENTIAL', () => {
    // This is a REGRESSION GUARD, not a perf guard. Running these concurrently (attempted and
    // reverted in quick 260805-8ni) makes onboarding intermittently hang at the final waiting
    // stage and never navigate to /results: the career_targets upsert fires the Goal Readiness
    // trigger, whose compute_goal_readiness() READS resumes, while extraction's
    // persistAcceptedPdfjsResumeText WRITES resumes.
    expect(source).toContain('const writeResults = await Promise.all(writes)');
    expect(source).toContain('const resumeExtraction = await extractDocumentFromFile({');
    expect(source).toContain('await invalidateMerits()');
    // The concurrent shape must not come back.
    expect(source).not.toContain('Promise.allSettled([');
    expect(source).not.toContain('const extractionPromise');
    expect(source).not.toContain('const meritsPromise');
  });

  it('orders the three steps writes -> extraction -> merits in source', () => {
    const writes = source.indexOf('const writeResults = await Promise.all(writes)');
    const writeError = source.indexOf('if (writeError) throw writeError');
    const extraction = source.indexOf('const resumeExtraction = await extractDocumentFromFile({');
    const merits = source.indexOf('await invalidateMerits()');

    expect(writes).toBeGreaterThan(-1);
    expect(writeError).toBeGreaterThan(writes);
    expect(extraction).toBeGreaterThan(writeError);
    expect(merits).toBeGreaterThan(extraction);
  });

  it('keeps the upgrade-signal branch after extraction', () => {
    // reconcileTierUpgrade runs a bounded 10s DB-waiting poll behind a user-visible toast.
    const extraction = source.indexOf('const resumeText = resumeExtraction.text');
    const reconcile = source.indexOf('await reconcileTierUpgrade(');
    expect(extraction).toBeGreaterThan(-1);
    expect(reconcile).toBeGreaterThan(extraction);
  });

  it('still passes resumeId to extraction so resume text is persisted', () => {
    // Career Compass reads persisted resume text; backend PDF parsing is a permanent no-op, so
    // dropping resumeId here breaks Career Compass while leaving Resume Analysis looking fine.
    const call = source.slice(
      source.indexOf('const resumeExtraction = await extractDocumentFromFile({'),
      source.indexOf('const resumeText = resumeExtraction.text'),
    );
    expect(call).toContain('resumeId: resume.id');
  });

  it('still writes the durable onboarding handoff marker', () => {
    expect(source).toContain('sessionStorage.setItem(`onboarding_wait_${resume.id}`');
  });

  it('still clears the correlation envelope on every terminal path', () => {
    expect(source).toContain('clearFeatureRunToken(correlationEnvelope)');
  });
});

describe('onboarding critical-path functions stay warm (quick 260805-8ni)', () => {
  const source = read(KEEP_WARM);

  it('keeps validate-document and begin-feature-run warm', () => {
    // Both are on the onboarding submit path. Cold preflights measured at 976ms and 1267ms
    // against ~200-230ms warm.
    const list = source.slice(
      source.indexOf('const WARM_FUNCTIONS'),
      source.indexOf('];', source.indexOf('const WARM_FUNCTIONS')),
    );
    expect(list).toContain("'validate-document'");
    expect(list).toContain("'begin-feature-run'");
  });
});
