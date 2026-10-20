/**
 * Phase 06 · 06-03 · FEAT-05 / D-04 / D-09 — CareerCompass run_id recovery guard.
 *
 * Source-contract guard (the established CareerCompass vitest convention — cf.
 * CareerCompass.phase22.test.ts, CareerCompass.prior-selectors.test.ts) proving the
 * D-04 poll-cap repair + D-09 large-result rehydration wiring on CareerCompass.tsx:
 *
 *   - the 180s MAX_POLL_MS cap no longer terminalizes a LIVE (flag-ON) run — it is
 *     short-circuited by `lifecycleOn ||`, so deadness is owned by the lifecycle
 *     terminal states + the Phase-3 reaper, not a 3-minute frontend clock;
 *   - useAnalysisRun run_id recovery: startRun(careerJobId) BEFORE the progress
 *     render (refresh/navigation re-attaches via URL+localStorage);
 *   - submit-lock: AnalysisLockContext.isLocked + useAnalysisRun.isActive block a
 *     duplicate concurrent submit;
 *   - preserve-previous-success: analysisRun.previousResult referenced (a later
 *     failure never clears the last success);
 *   - large-result rehydration: a COMPLETED run hydrates from the pinned
 *     analysis_results.raw_response read (no fallback chain);
 *   - History ?id= round-trip stays outside the hook (D-06);
 *   - dormancy: every new consumer is gated on isAnalysisLifecycleEnabled().
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve('src/pages/CareerCompass.tsx'), 'utf8');

describe('D-04: useAnalysisRun run_id recovery replaces the 180s poll cap', () => {
  it('imports + initializes useAnalysisRun and the analysis lock', () => {
    expect(source).toContain("import { useAnalysisRun } from \"@/hooks/useAnalysisRun\"");
    expect(source).toContain("import { useAnalysisLock } from \"@/contexts/AnalysisLockContext\"");
    expect(source).toContain('const analysisRun = useAnalysisRun();');
    expect(source).toContain('const { isLocked } = useAnalysisLock();');
  });

  it('calls startRun(careerJobId) so a refresh/navigation re-attaches to the live run', () => {
    expect(source).toContain('analysisRun.startRun(careerJobId)');
  });

  it('gates the 180s MAX_POLL_MS cap to the flag-OFF legacy path only (never terminalizes a live run)', () => {
    // The constant survives ONLY as the legacy cap; the loop is short-circuited by
    // lifecycleOn so a flag-ON run is bounded by terminal states + the reaper, not the clock.
    expect(source).toContain('while (lifecycleOn || Date.now() - pollStart < MAX_POLL_MS)');
  });
});

describe('submit + attemptNonce (D-04 / one-run one-charge)', () => {
  // RULE-1 FLIP (quick task 260713-hrd). This asserted the nonce was `lifecycleOn ?
  // crypto.randomUUID() : undefined` — and `lifecycleOn` is FALSE for career, so the server
  // received `undefined` on every real submit, fell back to minting a fresh idempotency key per
  // request, and each resubmit charged again. Production: one Elite user charged 8x (-24 merits)
  // for a single usable result.
  //
  // The nonce is now sent UNCONDITIONALLY and HELD across a resubmit of the same intent, so the
  // server derives the same key and replays `already_deducted`. One run = one charge.
  it('sends an attemptNonce UNCONDITIONALLY (not gated on the dormant lifecycle flag)', () => {
    expect(source).not.toContain('attemptNonce: lifecycleOn ? crypto.randomUUID() : undefined');
    expect(source).toContain('attemptNonce: submitToken.attemptNonce');
  });

  it('HOLDS the nonce in the shared guard so an accidental resubmit reuses it', () => {
    expect(source).toContain('const submitToken = submitGuard.beginSubmit();');
    expect(source).toContain('submitGuard.endSubmit(submitToken, { resetAttempt: true })');
  });

  it('engages a submit-lock (isLocked || analysisRun.isActive) to block a duplicate concurrent submit', () => {
    expect(source).toContain('if (lifecycleOn && (isLocked || analysisRun.isActive))');
    // and the button disabled expression carries the same lock (gated on the flag).
    expect(source).toContain('isAnalysisLifecycleEnabled() && (isLocked || analysisRun.isActive)');
  });
});

describe('preserve-previous-success (D-04)', () => {
  it('references analysisRun.previousResult so a later failure never clears the last success', () => {
    expect(source).toContain('analysisRun.previousResult');
  });
});

describe('D-09: large multi-structure raw_response rehydrates through the pinned read', () => {
  it('hydrates a completed run from analysis_results.raw_response with no speculative fallback chain', () => {
    expect(source).toContain('hydrateLatestCareerResult');
    expect(source).toContain("from('analysis_results')");
    expect(source).toContain('data.raw_response');
    // No speculative fallback chain off the persisted payload.
    expect(source).not.toMatch(/data\.result\s*\?\?/);
    expect(source).not.toMatch(/data\.analysis_data\s*\?\?/);
  });

  it('uses the pinned hydration on completion (hydrated ?? job envelope)', () => {
    expect(source).toContain('const hydrated = await hydrateLatestCareerResult(user.id)');
    expect(source).toContain('setAnalysis((hydrated ?? statusData.result) as AnalysisResult)');
  });
});

describe('D-06: ?id= hydration stays outside useAnalysisRun', () => {
  it('the ?id= deep-link hydration keeps its own pinned analysis_results.raw_response read', () => {
    expect(source).toContain("analysis_type");
    expect(source).toContain('career_compass');
    expect(source).toContain('Analysis not found');
  });
});

describe('dormancy: new wiring is gated on isAnalysisLifecycleEnabled()', () => {
  it('imports and gates on the lifecycle flag (byte-identical page while off)', () => {
    expect(source).toContain("import { isAnalysisLifecycleEnabled } from \"@/config/feature-flags\"");
    expect(source).toContain('const lifecycleOn = isAnalysisLifecycleEnabled();');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Quick task 260713-hrd — Career Compass audit + fix.
// Source-level guards (consistent with the suite's existing style above).
// ─────────────────────────────────────────────────────────────────────────────


// `source` with comments stripped. Removal assertions must read CODE, not prose — the page
// deliberately carries comments explaining WHAT was removed and WHY (e.g. a comment naming the
// "about 20 seconds" copy it deleted), and a naive substring check matches the documentation of
// the fix and fails on it.
const codeOnly = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('260713-hrd: there is no Pro — a saved `pro` row gets the Elite experience (RC-5)', () => {
  it('normalizes the tier instead of gating on the literal "elite"', () => {
    // The page used to compute `getEffectiveTier(...)` raw and then gate every Elite surface on
    // `subscriptionTier === "elite"`. `normalizeActiveTier` collapses pro -> elite everywhere else
    // in the app, so the users sitting on a legacy `pro` row PAID for Elite and were shown the
    // 2-tab Free UI.
    expect(source).toContain('import { normalizeActiveTier } from "@/config/pricing-config"');
    expect(source).toContain('normalizeActiveTier(getEffectiveTier(');
  });

  // 260713-hrd (second pass): Skills Gap and Strategy were withdrawn from the UI by operator
  // decision, so the Elite TabsList is 5 columns, not 7. The Elite-vs-Free GATE is what this
  // guard exists to protect (a `pro` row must get the Elite list, not the 2-tab Free one) —
  // that is unchanged. Only the column count moved.
  // Superseded by the "Free sees the full Elite tab structure, locked" block below: the TabsList
  // is no longer tier-conditional at all (Free sees the same 5 tabs, three of them locked), and
  // the three Elite triggers are generated from CAREER_ELITE_TABS rather than written as literal
  // JSX. What this guard actually exists to protect — a `pro` row must get the ELITE experience,
  // not the Free one — is now expressed as a tier-resolution assertion, which is the real
  // invariant. The old grid-cols-2 / literal-trigger assertions were describing the markup, not
  // the guarantee.
  it('a legacy `pro` row resolves to Elite, so its tabs are NOT locked', () => {
    expect(source).toContain('normalizeActiveTier(getEffectiveTier(');
    expect(codeOnly).toContain("tier !== 'elite' && CAREER_ELITE_TAB_VALUES.includes(tab)");
    expect(codeOnly).not.toContain('grid-cols-7');
  });

  it('the Skills Gap and Strategy tabs are gone from the UI, but their data is not deleted', () => {
    expect(source).not.toContain('TabsTrigger value="skillGap"');
    expect(source).not.toContain('TabsTrigger value="strategy"');
    expect(source).not.toContain('TabsContent value="skillGap"');
    expect(source).not.toContain('TabsContent value="strategy"');

    // ...while the Elite surfaces that MUST keep working still have their panels.
    expect(source).toContain('<TabsContent value="readiness"');
    expect(source).toContain('<TabsContent value="roadmap"');
    expect(source).toContain('<TabsContent value="compensation"');
  });
});

describe('Surprise Fits floor mirrors the server gate (audit 2026-07-15: min 1)', () => {
  it('treats an EMPTY Surprise Fits list as missing, but accepts 1 (mirrors CAREER_SURPRISE_FITS_MIN)', () => {
    // The client floor must track the server's CAREER_SURPRISE_FITS_MIN exactly, or the two
    // disagree about whether a report is complete. The audit lowered that floor from 2 to 1
    // (operator decision): a report with 1 genuine cross-domain fit is a success. Still an
    // explicit length check (not hasItems), so the contract stays visible and in sync.
    expect(source).not.toContain('if (!hasItems(result.surpriseFits)) missing.add');
    expect(source).toContain("result.surpriseFits.length < 1");
    expect(source).toContain("missing.add('surpriseFits')");
  });
});

describe('260713-hrd: exactly ONE loading surface, and it tells the truth (RC-6)', () => {
  it('renders UniversalAnalyzing and NOT the second inline step-list', () => {
    expect(source).toContain('<UniversalAnalyzing');
    // The page used to render BOTH at once, with contradicting copy.
    expect(codeOnly).not.toContain('about 20 seconds');
    expect(codeOnly).not.toContain('% complete');
  });

  it('has no orphaned progress-bar plumbing left behind', () => {
    expect(codeOnly).not.toContain('setProgress');
    expect(codeOnly).not.toContain('progressInterval');
  });

  it('passes the stage ladder and no longer passes retired display props', () => {
    // 260803-fxz: `subtitle`/`expectedDurationMs` were swallowed by an index signature
    // on UniversalAnalyzing and never rendered, so pinning that copy here was guarding
    // a prop that did nothing. Phase 03 OT-7 bans duration claims on the waiting
    // surface; the honest ladder is the `stageLabels` list the surface actually walks.
    expect(source).toContain('stageLabels={CAREER_COMPASS_STAGE_LABELS}');
    expect(codeOnly).not.toContain('expectedDurationMs');
    expect(codeOnly).not.toContain('This usually takes 1-2 minutes');
  });
});

describe('260713-hrd: the deadline no longer fabricates a failure or fakes a refund (RC-6)', () => {
  it('tries to recover a result that landed, before declaring anything', () => {
    const deadline = source.slice(source.indexOf('Deadline reached'));
    expect(deadline).toContain('hydrateLatestCareerResult(user.id)');
  });

  it('does NOT rollback on the deadline — the charge is real and the run may still be alive', () => {
    // rollback() restores the on-screen balance, which READS as "you were refunded" when nothing
    // was refunded. On deadline we re-read the true balance instead of inventing one.
    const deadline = source.slice(source.indexOf('Deadline reached'));
    expect(deadline).not.toContain('settle?.rollback()');
    expect(deadline).toContain('invalidateMerits()');
    expect(deadline).toContain('Still running');
  });

  it('keeps rollback for a GENUINE terminal failure', () => {
    expect(source).toContain("if (statusData.status === 'failed')");
    expect(source).toContain('settle?.rollback()');
  });
});

describe('260713-hrd: the dead prior-analysis gates are gone (Free is standalone)', () => {
  it('has no "Run these first to unlock Career Compass" blocking banner', () => {
    expect(codeOnly).not.toContain('Run these first to unlock');
    expect(codeOnly).not.toContain('missingPrior');
  });

  it('no longer treats a prior Resume Analysis as blocking', () => {
    expect(source).not.toContain('blocking\n');
    expect(source).toContain('blocking={false}');
  });

  it('no longer handles the deleted 412 gate codes', () => {
    expect(codeOnly).not.toContain('missing_prior_analyses');
    expect(codeOnly).not.toContain('linkedin_prior_missing');
  });

  it('surfaces the truncated/incomplete outcome honestly (and only because it really refunded)', () => {
    expect(source).toContain('output_truncated');
    expect(source).toContain('incomplete_output');
    expect(source).toContain('Your Merits were refunded');
  });
});

describe('260713-hrd: Free sees the full Elite tab structure, locked', () => {
  it('renders ONE 5-tab list for every tier — Free is no longer a 2-tab stub', () => {
    // The TabsList used to be `elite ? grid-cols-5 : grid-cols-2`, so a Free user could not see
    // that Career Comparison / Roadmap / Salary existed at all. The value of upgrading was
    // invisible. The list is now the same 5 columns at every tier.
    //
    // Phase 03 · 03-10 (UI-SPEC F3/F4): below `md` the five nowrap triggers
    // cannot fit the content box, so the list became an opt-in horizontal
    // scroller there and the five-column grid is restored at `md`+. The
    // tier-independence this test exists to protect is UNCHANGED — all five
    // triggers still render for every tier, which the negative assertions
    // below and the CAREER_ELITE_TABS tests continue to enforce.
    expect(codeOnly).toContain('md:grid md:w-full md:grid-cols-5');
    expect(codeOnly).toContain('data-allow-overflow-x="true"');
    expect(codeOnly).not.toContain('grid-cols-2"');
    expect(codeOnly).not.toContain('grid-cols-7');
  });

  it('locks exactly the three Elite tabs, and never Fields or Roles', () => {
    expect(codeOnly).toContain("{ value: 'readiness'");
    expect(codeOnly).toContain("{ value: 'roadmap'");
    expect(codeOnly).toContain("{ value: 'compensation'");
    // Fields and Roles are available at every tier — they must not be in the lockable set.
    const eliteTabsBlock = codeOnly.slice(
      codeOnly.indexOf('const CAREER_ELITE_TABS'),
      codeOnly.indexOf('const CAREER_ELITE_TAB_VALUES'),
    );
    expect(eliteTabsBlock).not.toContain("'fields'");
    expect(eliteTabsBlock).not.toContain("'roles'");
  });

  it('locks on TIER, not on the literal "elite" (a legacy `pro` row must NOT be locked out)', () => {
    expect(codeOnly).toContain("tier !== 'elite' && CAREER_ELITE_TAB_VALUES.includes(tab)");
    expect(codeOnly).toContain('normalizeActiveTier(getEffectiveTier(');
  });

  it('shows a lock icon and an Elite badge on a locked tab (not a bare disabled control)', () => {
    expect(codeOnly).toContain('<Lock className=');
    expect(codeOnly).toContain('<Crown className=');
    expect(codeOnly).toContain('Elite');
    // "disabled" would read as broken; the tab must stay interactive and explain itself.
    expect(codeOnly).not.toContain('<TabsTrigger\n                      disabled');
    expect(codeOnly).toContain('aria-label={locked ?');
    expect(codeOnly).toContain('title={locked ?');
  });

  it('clicking a locked tab opens the upgrade flow and does NOT change tabs', () => {
    // Controlled Tabs + an interception that returns BEFORE setActiveTab. If this regressed to
    // an uncontrolled <Tabs defaultValue>, a Free user could open an Elite panel.
    expect(codeOnly).toContain('value={activeTab}');
    expect(codeOnly).toContain('onValueChange={(next) => {');
    expect(codeOnly).toContain('if (isTabLockedForTier(next, subscriptionTier)) {');
    expect(codeOnly).toContain("navigate('/pricing')");
    expect(codeOnly).not.toContain('<Tabs defaultValue="fields"');

    // the interception must RETURN before the tab state is written
    const start = codeOnly.indexOf('onValueChange={(next) => {');
    expect(start).toBeGreaterThan(-1);
    const handler = codeOnly.slice(start, start + 400);
    expect(handler).toContain('return;');
    expect(handler).toContain('setActiveTab(next)');
    expect(handler.indexOf('return;')).toBeLessThan(handler.indexOf('setActiveTab(next)'));
  });

  it('never mounts an Elite panel for a Free user (the lock is not the security boundary)', () => {
    // Presentation locks are not a boundary. The panels stay gated on the resolved tier, and the
    // server tier-shapes the payload, so a Free analysis does not even CONTAIN Elite data.
    for (const panel of ['readiness', 'roadmap', 'compensation']) {
      const at = codeOnly.indexOf(`<TabsContent value="${panel}"`);
      expect(at).toBeGreaterThan(-1);
      const before = codeOnly.slice(Math.max(0, at - 200), at);
      expect(before).toContain('subscriptionTier === "elite" &&');
    }
  });

  it('does not re-add Skills Gap or Strategy', () => {
    expect(codeOnly).not.toContain('TabsTrigger value="skillGap"');
    expect(codeOnly).not.toContain('TabsTrigger value="strategy"');
    expect(codeOnly).not.toContain('TabsContent value="skillGap"');
    expect(codeOnly).not.toContain('TabsContent value="strategy"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// first-attempt-reliability · direction 3 — auto-retry ONCE, same nonce, on a
// TRANSIENT (retryable) failure before surfacing any terminal toast.
// ─────────────────────────────────────────────────────────────────────────────
describe('first-attempt-reliability · direction 3: auto-retry once with the SAME nonce', () => {
  it('hoists the submit body so the retry replays the SAME attemptNonce (one run = one charge)', () => {
    expect(codeOnly).toContain('const careerSubmitBody = {');
    expect(codeOnly).toContain('attemptNonce: submitToken.attemptNonce,');
    // Both the initial submit and the retry send the SAME hoisted body.
    expect((codeOnly.match(/'submit-career-analysis-job',\s*\n\s*\{ body: careerSubmitBody \}/g) || []).length)
      .toBeGreaterThanOrEqual(2);
  });

  it('retries at most ONCE (guarded by autoRetried) and follows the recovered run (currentJobId)', () => {
    expect(codeOnly).toContain('let autoRetried = false;');
    expect(codeOnly).toContain('let currentJobId = careerJobId;');
    expect(codeOnly).toContain('if (failureRetryable && !autoRetried) {');
    expect(codeOnly).toContain('autoRetried = true;');
    expect(codeOnly).toContain('currentJobId = retryJobId;');
    // The poll follows the (possibly re-submitted) run, not the frozen initial jobId.
    expect(codeOnly).toContain('body: { jobId: currentJobId }');
  });

  it('only a RETRYABLE failure is auto-retried; a genuine permanent failure still fails+refunds (not masked)', () => {
    // The gate reads the taxonomy retryable partition surfaced by get-analysis-job-status.
    expect(codeOnly).toContain('statusData.retryable === true');
    // The retry seam sits BEFORE the terminal rollback/toast, and a non-retryable code
    // (truncation/incomplete) skips it entirely and hits the existing terminal handling.
    const failedBranch = codeOnly.slice(
      codeOnly.indexOf("if (statusData.status === 'failed') {"),
      codeOnly.indexOf('pollAfterMs = statusData.pollAfterMs ?? 2500;'),
    );
    const retryIdx = failedBranch.indexOf('if (failureRetryable && !autoRetried) {');
    const rollbackIdx = failedBranch.indexOf('settle?.rollback();');
    expect(retryIdx).toBeGreaterThan(-1);
    expect(rollbackIdx).toBeGreaterThan(retryIdx);
    // The permanent truncation path is untouched (still surfaced + refunded).
    expect(failedBranch).toContain('output_truncated');
    expect(failedBranch).toContain('Your Merits were refunded');
  });

  it('the retry does NOT rollback the charge or reset the nonce (same run, same charge)', () => {
    // Between entering the retryable branch and the `continue`, there is no rollback and no
    // nonce reset — those belong only to the terminal path reached when the retry is exhausted.
    const retryStart = codeOnly.indexOf('if (failureRetryable && !autoRetried) {');
    // End at the first terminal rollback AFTER the retry block — a code literal that
    // survives comment stripping and marks where the transient-retry path hands off to
    // terminal handling.
    const retryBlock = codeOnly.slice(retryStart, codeOnly.indexOf('settle?.rollback();', retryStart));
    expect(retryBlock).not.toContain('settle?.rollback()');
    expect(retryBlock).not.toContain('attemptNonceRef.current = null');
    expect(retryBlock).toContain('continue;');
  });
});
