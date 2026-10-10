/**
 * Onboarding waiting-surface handoff wiring guard (quick 260803-mqs).
 *
 * THE REGRESSION THIS EXISTS TO CATCH. Onboarding's submit path navigates to
 * `/results/:id` while the analysis is STILL IN FLIGHT. A page-level overlay is
 * unmounted by that navigation, so the rich 5-step ladder vanished mid-wait and
 * the user dropped to the single-row 'Working on your analysis' fallback that
 * Results seeds. The fix is structural, not cosmetic: this page must render NO
 * overlay of its own and instead drive the route-independent
 * <AnalysisWaitingHost> (mounted above <Routes> in App.tsx) — exactly the shape
 * Upload.tsx already uses. "Exactly one overlay node stays alive across the
 * boundary" is then true by construction rather than by timing luck.
 *
 * A STATIC source-contract guard, modelled on `Upload.recovery.test.tsx`: the
 * question is about the wiring, and the wiring is the source. Rendering this
 * page would require mocking Supabase auth, storage, the merit context and four
 * lifecycle branches to prove something the file states literally.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const onboarding = readFileSync(resolve('src/pages/Onboarding.tsx'), 'utf8');

describe('Onboarding: hands the analysis wait to the persistent AnalysisWaitingHost', () => {
  it('consumes the analysis lock rather than owning overlay state', () => {
    expect(onboarding).toMatch(
      /import \{ useAnalysisLock \} from ["']@\/contexts\/AnalysisLockContext["'];/,
    );
    expect(onboarding).toMatch(
      /const \{ showWaitingSurface, hideWaitingSurface \} = useAnalysisLock\(\);/,
    );
  });

  it('seeds the five-step onboarding ladder under the title Results also uses', () => {
    // The title is load-bearing, not copy: UniversalAnalyzing keys BOTH its timed
    // step advance and its 45s/120s elapsed thresholds on `title`, so a title that
    // differs from Results' non-elite 'Analyzing your resume' restarts the ladder
    // at the navigation boundary — the exact bug being fixed.
    const seed = onboarding.match(/showWaitingSurface\(\{[\s\S]*?\}\);/);
    expect(seed, 'Onboarding must seed the host-owned waiting surface').not.toBeNull();
    expect(seed![0]).toContain("key: 'resume-analysis',");
    expect(seed![0]).toContain("title: 'Analyzing your resume',");
    expect(seed![0]).toContain('stageLabels: ONBOARDING_STAGE_LABELS,');
    // activeStageIndex is deliberately omitted: onboarding emits no per-stage
    // signal, so the sanctioned timed advance drives the ladder.
    expect(seed![0]).not.toContain('activeStageIndex');
  });

  it('renders no page-level overlay, so exactly one overlay can be alive', () => {
    expect(onboarding).not.toContain('<UniversalAnalyzing');
    expect(onboarding).not.toContain('UniversalAnalyzing } from');
  });

  it('marks the handoff before every navigation to Results', () => {
    // Iterated rather than counted: a future branch that navigates without first
    // setting the flag would strand the overlay (it holds the nav lock while
    // visible) on a page the user never left.
    expect(onboarding).toContain('let handedOffToResults = false;');
    const navigations = [...onboarding.matchAll(/navigate\(`\/results\/\$\{resume\.id\}`\)/g)];
    expect(navigations.length).toBeGreaterThanOrEqual(4);

    let previousNavigationIndex = -1;
    for (const navigation of navigations) {
      const handoff = onboarding
        .slice(0, navigation.index)
        .lastIndexOf('handedOffToResults = true;');
      expect(
        handoff,
        'every /results navigation must be preceded by handedOffToResults = true;',
      ).toBeGreaterThan(previousNavigationIndex);
      previousNavigationIndex = navigation.index!;
    }
  });

  it('fail-safe hides the surface on every path that did not hand off', () => {
    // Enumerating failure sites is the shape that strands overlays. One negated
    // check in the existing `finally` covers validation failure, terminal
    // analysis failure, an unexpected throw, and any future non-navigating branch.
    expect(onboarding).toContain(
      "if (!handedOffToResults) hideWaitingSurface('resume-analysis');",
    );
  });
});
