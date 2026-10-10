/**
 * Quick task 260713-2ay — LinkedIn Grader timeout/recovery contract.
 *
 * Static source-contract guard, following the established pattern for this page
 * (LinkedInGrader.linkedin-pdf-source.test.ts / LinkedInGrader.recovery.test.tsx): the page
 * has heavy providers, and the invariants below are all about the SHAPE of the failure path,
 * which a source contract pins precisely.
 *
 * The defects locked here:
 *  S2 — the client (120s) gave up BEFORE the server's own budget expired, abandoning a run the
 *       server went on to complete, charge and save. The user paid for a grade they never saw.
 *  S3 — the status was regex-scraped out of `error.message`; no server message contains a bare
 *       status code, so every failure degraded to 500 + the generic server-error toast.
 *  D3 — a grade that landed anyway was never looked for: the page rolled back and toasted an
 *       error over the top of a perfectly good, already-charged analysis.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raw = readFileSync(resolve('src/pages/LinkedInGrader.tsx'), 'utf8').replace(/\r\n/g, '\n');

/**
 * Operate on CODE only — drop block comments, then whole-line `//` comments.
 * Same idiom as supabase/functions/grade-linkedin/__tests__/fixed-source-guard.test.ts: a doc
 * comment naming a forbidden token must never satisfy OR break the guard. This fix deliberately
 * DOCUMENTS the regex scrape it deleted, and that prose must not read as a live reintroduction.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const source = stripComments(raw);

// Scope every assertion to handleAnalyze — `setResult` / `supabase.from('linkedin_grades')`
// legitimately appear elsewhere on this page (mount cache-load, ?id= hydration), so an
// unscoped grep would be vacuous.
const handleAnalyze = source.slice(
  source.indexOf('const handleAnalyze = async () => {'),
  source.indexOf('const getSectionIcon'),
);

describe('LinkedInGrader: the client must never give up before the server does (S2)', () => {
  it('waits 180s — longer than the server total deadline (165s) and the per-call timeout (90s)', () => {
    expect(handleAnalyze).toContain('180000');
    // The old budget was SHORTER than the server's own per-call timeouts.
    expect(handleAnalyze).not.toContain('120000');
  });
});

describe('LinkedInGrader: the real HTTP status, not a regex guess (S3)', () => {
  it('reads error.status directly', () => {
    expect(handleAnalyze).toMatch(/const status = \(error as \{ status\?: number \}\)\?\.status \?\? 500;/);
  });

  it('the regex status-scrape is GONE', () => {
    // /\b(4\d\d|5\d\d)\b/ never matched any real server message, so it always fell to 500 —
    // which is why a timeout rendered "server error" and TIMED_OUT was unreachable.
    expect(handleAnalyze).not.toContain('4\\d\\d');
    expect(handleAnalyze).not.toContain('5\\d\\d');
    expect(handleAnalyze).not.toMatch(/error\.message\.match\(/);
  });
});

describe('LinkedInGrader: recover a grade that landed anyway, BEFORE toasting (D3)', () => {
  it('takes a pre-submit watermark of the newest existing grade id', () => {
    expect(handleAnalyze).toContain('watermarkId');

    // The watermark must be captured BEFORE the request is sent, or it proves nothing.
    const watermarkIdx = handleAnalyze.indexOf('watermarkId = wm?.id ?? null;');
    const invokeIdx = handleAnalyze.indexOf('invokeWithTimeout<LinkedInGradeResponse>');
    expect(watermarkIdx).toBeGreaterThan(-1);
    expect(invokeIdx).toBeGreaterThan(watermarkIdx);
  });

  it('polls linkedin_grades for a landed grade BEFORE rolling back and toasting', () => {
    const recoveryIdx = handleAnalyze.indexOf('fetchLandedGrade()');
    const rollbackIdx = handleAnalyze.indexOf('settle.rollback();');
    const toastIdx = handleAnalyze.indexOf('toast.error(title,');

    expect(recoveryIdx).toBeGreaterThan(-1);
    expect(rollbackIdx).toBeGreaterThan(-1);
    // Recovery must be attempted FIRST — rolling back and toasting over a grade the server
    // already delivered and charged for is the exact user-visible bug.
    expect(recoveryIdx).toBeLessThan(rollbackIdx);
    expect(recoveryIdx).toBeLessThan(toastIdx);
  });

  it('a recovered grade is rendered and COMMITTED (the server really did charge), with no error toast', () => {
    const recoveryBlock = handleAnalyze.slice(
      handleAnalyze.indexOf('if (isAmbiguousFailure)'),
      handleAnalyze.indexOf('settle.rollback();'),
    );
    expect(recoveryBlock).toContain('setResult(landed);');
    expect(recoveryBlock).toContain('setShowInput(false);');
    expect(recoveryBlock).toContain('settle.commit();');
    // It must return before reaching the rollback/toast path.
    expect(recoveryBlock).toContain('return;');
    // A rollback here would show the user a phantom refund for work that WAS charged.
    expect(recoveryBlock).not.toContain('settle.rollback();');
    expect(recoveryBlock).not.toContain('toast.error');
  });

  it('only AMBIGUOUS failures poll — 400/402/403/429 surface instantly', () => {
    // 408 (timeout) and 5xx/529 and network (no status -> 500) may have landed a grade.
    // The unambiguous never-landed classes must not make the user wait through a poll.
    expect(handleAnalyze).toMatch(/const isAmbiguousFailure = status === 408 \|\| status >= 500;/);
  });

  it('the step animation is cleared FIRST, so a recovery return cannot leak it', () => {
    const catchIdx = handleAnalyze.indexOf('} catch (error) {');
    const clearIdx = handleAnalyze.indexOf('clearInterval(stepInterval);', catchIdx);
    const recoveryIdx = handleAnalyze.indexOf('fetchLandedGrade()');
    expect(clearIdx).toBeGreaterThan(catchIdx);
    expect(clearIdx).toBeLessThan(recoveryIdx);
  });
});

describe('LinkedInGrader: never claim a refund the server did not make (D3/S4)', () => {
  it('passes the server-confirmed meritsRefunded into the error copy', () => {
    expect(handleAnalyze).toContain("const meritsRefunded = serverBody?.merits_refunded === true;");
    expect(handleAnalyze).toContain('getMeritErrorMessage(status, { meritsRefunded })');
  });

  it('the refund signal comes from the SERVER body, not from local optimism', () => {
    // `settle.rollback()` restores a React-Query cache — it is NOT a refund, and must never be
    // the thing that licenses a "your Merits were refunded" message.
    expect(handleAnalyze).toContain('serverBody');
    expect(handleAnalyze).toMatch(/merits_refunded/);
  });
});
