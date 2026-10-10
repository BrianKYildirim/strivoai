import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TARGET = join(process.cwd(), 'src/components/UniversalAnalyzing.tsx');

/**
 * Remove every string/template literal so a rule can distinguish a value that is
 * RENDERED from one that merely lives in a CSS declaration.
 *
 * Added 2026-08-03 (quick 260803-hwm) for the rendered-percentage rule below.
 * Stripping only ever removes characters, so it can never manufacture a match —
 * the failure mode it must be checked against is the opposite one (a real
 * violation being swallowed), which is why that rule is mutation-checked.
 */
function stripLiterals(source: string): string {
  return source
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[\s\S]*?`/g, '``');
}

describe('Phase 03 · OT-7 honest waiting-surface source guard', () => {
  it('walks the real, non-empty target file', () => {
    expect(existsSync(TARGET)).toBe(true);
    expect(readFileSync(TARGET, 'utf8').length).toBeGreaterThan(500);
  });

  it('contains none of the three fabricated progress mechanisms', () => {
    // NARROWED on 2026-08-03 (quick 260803-fxz). The fourth rule — a ban on any
    // elapsed-time step advancement — was relaxed by explicit operator decision:
    // Career Compass, Recruiting Lens, LinkedIn Grader, Onboarding and Interview
    // Prep emit no per-stage signal, so the only alternative was a permanently
    // frozen ladder. The OT-7 honesty intent is retained in full elsewhere:
    // a real signal still takes precedence over the timer (the component runs it
    // only when `activeStageIndex` is omitted), and NO fabricated percentage and
    // NO duration claim is permitted — both still asserted below.
    const source = readFileSync(TARGET, 'utf8');
    expect(source).not.toMatch(/Math\.round\([^)]*[Pp]rogress|progressPercent|Math\.exp/);
    expect(source).not.toMatch(/expectedDurationMs|usually takes/i);

    // NARROWED on 2026-08-03 (quick 260803-hwm).
    //
    // WHAT CHANGED: `not.toMatch(/>\s*\{?[^<]*%\s*\}?/)` became a
    // literal-stripped `not.toMatch(/[}\d]\s*%/)`.
    //
    // WHY: the 260803-hwm visual restoration brought back the three orbiting
    // particles, whose dots are positioned with CSS percentage lengths
    // (`top: '50%'`). The old rule scanned raw source for any `>` … `%` pair
    // with no intervening `<`, so a percentage sitting in a style OBJECT — after
    // the previous JSX tag closed — false-positived. It could not tell a CSS
    // length from a rendered progress claim.
    //
    // WHAT IS STILL CAUGHT (mutation-checked, see the plan's task 2d): a
    // rendered `{Math.round(pct)}%` and a bare `95%` in markup both still fail,
    // because the interpolation's `}` / the digit survives stripping. The
    // OT-7 intent — the overlay must never state a percentage — is unchanged.
    expect(stripLiterals(source)).not.toMatch(/[}\d]\s*%/);
  });

  it('uses semantic colours and no emerald or hardcoded colour literal', () => {
    const source = readFileSync(TARGET, 'utf8');
    expect(source).not.toMatch(/emerald/i);

    // NARROWED on 2026-08-03 (quick 260803-hwm).
    //
    // WHAT CHANGED: `hsla?\(` became `hsla?\((?!\s*var\(--)`.
    //
    // WHY: the restored rotating conic border needs a real colour stop inside a
    // `conic-gradient(...)`, where a Tailwind class cannot reach. The project
    // convention for that is `hsl(var(--primary))` — a DESIGN-TOKEN reference,
    // which is exactly what this rule exists to require, but the old pattern
    // matched the `hsl(` prefix and could not tell it from a literal.
    //
    // WHAT IS STILL CAUGHT: every hex literal, every `rgb()`/`rgba()`, and any
    // `hsl()`/`hsla()` whose first argument is NOT a CSS custom property — so a
    // hardcoded `hsl(210 40% 98%)` still fails. Mutation-checked.
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\((?!\s*var\(--)/i);
  });

  it('gates every infinite animation with reduced-motion preference', () => {
    const source = readFileSync(TARGET, 'utf8');
    expect(source).toMatch(/useReducedMotion/);
    const infinite = [...source.matchAll(/repeat:\s*Infinity/g)];
    // RAISED from 2 to 12 on 2026-08-03 (quick 260803-hwm).
    //
    // WHY: the operator-mandated restoration of the pre-July-29 loader
    // (commit 0e5de83d) reinstated its full motion inventory — 3 ambient blobs,
    // the header halo, the rotating conic border, the icon pulse, 3 orbiting
    // particles (an orbit rotation + an opacity pulse each, but the two inner
    // pulses share the map body, so the JSX carries 2 of them), the active
    // row's glow, the active indicator's spinning ring and pulsing centre, and
    // the progress-bar glow layer.
    //
    // This number is a BUDGET, not a formality: raising it again must be a
    // deliberate edit accompanied by the same per-occurrence gate proof below,
    // because every additional infinite loop is CPU burned on the low-end phone
    // XDEV-09 is about.
    expect(infinite).toHaveLength(12);
    // Per-occurrence, not "somewhere in the file": a single gate anywhere above
    // would let a second, ungated loop ride in on the first one's proof.
    // UNCHANGED by 260803-hwm — this walk is the strongest rule in the file and
    // is what makes the raised count above safe.
    for (const match of infinite) {
      const before = source.slice(0, match.index);
      const gate = before.lastIndexOf('!prefersReducedMotion &&');
      expect(gate, 'every infinite animation needs its own gate').toBeGreaterThan(-1);
      expect(match.index! - gate).toBeLessThan(600);
    }
  });

  it('has one live region and only a background continuation affordance', () => {
    const source = readFileSync(TARGET, 'utf8');
    expect(source.match(/aria-live=/g)).toHaveLength(1);
    expect(source).toContain('continueInBackground');
    expect(source).not.toMatch(/>\s*(Cancel|Abort)\s*</i);
  });

  /**
   * ADDED 2026-08-03 (quick 260803-mqs). No rule above is modified or relaxed.
   *
   * The completed-step affordance is a green tick, not the word "Done". That
   * needs the system's FIRST green design token, so the assertion spans three
   * files: a `text-success` class is silently inert if either `--success` or the
   * Tailwind registration is dropped, and the tick would render in the inherited
   * text colour with no error anywhere.
   */
  it('renders completion as a tokenised green tick with the label kept for assistive tech', () => {
    const source = readFileSync(TARGET, 'utf8');
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    const tailwind = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8');

    // Both themes: `.light` splits the file, so either side missing the token
    // means one theme renders the tick in an undefined colour.
    const lightBlockStart = css.indexOf('.light {');
    expect(lightBlockStart).toBeGreaterThan(-1);
    expect(css.slice(0, lightBlockStart)).toMatch(/--success:\s*\d/);
    expect(css.slice(lightBlockStart)).toMatch(/--success:\s*\d/);

    expect(tailwind).toContain('hsl(var(--success))');
    expect(tailwind).toContain('hsl(var(--success-foreground))');

    expect(source).toContain('text-success');
    // The completion label survives ONLY inside sr-only. A visible one would be
    // the regression this replaced.
    for (const match of source.matchAll(/>\s*Done\s*</g)) {
      expect(
        source.slice(Math.max(0, match.index! - 60), match.index!),
        'a completion label may only be rendered sr-only',
      ).toContain('sr-only');
    }
  });
});
