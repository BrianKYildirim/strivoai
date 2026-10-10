import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// SEC-04 XSS-sink regression guard (Phase 02 Plan 07). The 02-02 sweep (CODE-EDGE-FINDINGS
// domain 9) found EXACTLY ONE `dangerouslySetInnerHTML` sink in `src/`: the shadcn
// `ChartStyle` CSS-var injection at `src/components/ui/chart.tsx:70`. Its `__html` is built
// from the static `THEMES` constant + developer-supplied chart `config` props (`--color-*`
// CSS variables) — NO user-controlled data reaches the sink, so it is a benign, accepted sink.
//
// This static guard (vitest, node:fs, auto-discovered — no deno.json edit) locks that finding
// against regression: it walks every `.ts`/`.tsx` under `src/` and fails if `dangerouslySetInnerHTML`
// appears anywhere outside the allowlist, forcing an explicit security review before any NEW sink
// can ship. Modeled on `src/pages/__tests__/pricing-token-guard.test.ts`.

const SRC_DIR = join(process.cwd(), 'src');
const SINK = 'dangerouslySetInnerHTML';

// Allowlisted files that may legitimately contain the sink token, expressed as posix-relative paths:
//   - chart.tsx: the single benign shadcn CSS-var sink (no user data) — the accepted residual.
//   - this guard file: necessarily references the token in its assertion/comment/allowlist logic.
const ALLOWLIST = new Set<string>([
  'src/components/ui/chart.tsx',
  'src/test/security/xss-sink-guard.test.ts',
]);

function walkSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSource(full));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(full);
    }
  }
  return out;
}

function toPosixRelative(fullPath: string): string {
  return relative(process.cwd(), fullPath).split(sep).join('/');
}

describe('SEC-04 XSS sink guard', () => {
  const files = walkSource(SRC_DIR);

  it('discovers src/ TypeScript surfaces (length guard so the walk is non-empty)', () => {
    // Fail-closed: an empty walk (wrong cwd / broken glob) must not silently pass the sink audit.
    expect(files.length).toBeGreaterThan(0);
  });

  it('the allowlisted chart.tsx sink still exists (the accepted benign CSS-var sink)', () => {
    // Positive assertion: chart.tsx must still be the single documented sink. If it is ever
    // removed, this fails so the allowlist is pruned deliberately (not left stale).
    const chart = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'chart.tsx'), 'utf8');
    expect(chart.includes(SINK)).toBe(true);
  });

  it(`no src surface outside the allowlist contains ${SINK}`, () => {
    const offenders: string[] = [];
    for (const full of files) {
      const rel = toPosixRelative(full);
      if (ALLOWLIST.has(rel)) continue;
      if (readFileSync(full, 'utf8').includes(SINK)) offenders.push(rel);
    }
    expect(
      offenders,
      `New ${SINK} sink(s) found outside the allowlist (chart.tsx). Any user-controlled data reaching `
        + `an innerHTML sink is an XSS risk — sanitize/remove, or add an explicit allowlist entry with a `
        + `security justification. Offenders: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
