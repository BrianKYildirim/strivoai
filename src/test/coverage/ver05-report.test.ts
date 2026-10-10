import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePlanningPhaseDir } from '../planningPhasePath';

// VER-05 / D-17 — the milestone report's own completeness as EXECUTABLE CODE.
//
// The report claims it addresses the 14 mandated items. Nothing self-certifying is
// trustworthy: "all 14 items are addressed" must be a GATE-ENFORCED fact, not a sentence
// the report writes about itself. This file is that enforcement — the same trick
// `security-audit-docs.test.ts` plays on SECURITY-AUDIT.md (`it('has exactly 10 SEC-0x
// disposition rows')`) and `ver02-matrix.test.ts` plays on the coverage registry.
//
// Modeled 1:1 on those two: vitest + node:fs read relative to process.cwd(),
// auto-discovered by the `src/**/*.test.ts` glob — there is NO registration step and no
// allowlist anyone can quietly drop it from. It runs inside `verify:baseline`, so a report
// that silently loses an item, drops an Evidence citation, or cites a table that does not
// exist is a RED gate rather than a reviewer's hope.
//
// Threats (09-12-PLAN):
//   T-09-12-B  a self-certifying report        -> assertion 2 pins all 14 anchors
//   T-09-12-A  an unbacked completion claim     -> assertion 3 pins an Evidence line per item
//   (report trust)  a cite of a non-existent table -> assertion 4 forbids `analysis_runs`

const PHASE_DIR = resolvePlanningPhaseDir(
  '09-final-verification-milestone-report',
  'ver05-report',
);
const REPORT = join(
  PHASE_DIR,
  '09-MILESTONE-REPORT.md',
);

function readRequired(path: string): string {
  if (!existsSync(path)) {
    throw new Error(
      `[ver05-report] required milestone report missing (fail-closed): ${path}`,
    );
  }
  return readFileSync(path, 'utf8');
}

// The 14 mandated items (ROADMAP Phase 9 success criterion 4). This length-guarded array
// is the source of truth — a dropped item (array OR report) fails an assertion below.
const ITEM_COUNT = 14;

describe('VER-05 milestone report — existence + completeness (D-17)', () => {
  it('the VER-05 milestone report exists', () => {
    expect(
      existsSync(REPORT),
      '09-MILESTONE-REPORT.md is missing — VER-05 requires the evidence-based final report on disk',
    ).toBe(true);
  });

  it('the report addresses all 14 mandated items (each `## Item N:` anchor present exactly once)', () => {
    const src = readRequired(REPORT);
    const missing: number[] = [];
    const duplicated: number[] = [];
    for (let n = 1; n <= ITEM_COUNT; n++) {
      // Anchor form is `## Item N: ` at line start — the STABLE, individually-addressable
      // heading the report commits to. A rename or a drop turns this RED.
      const re = new RegExp(`^## Item ${n}: `, 'gm');
      const hits = src.match(re) ?? [];
      if (hits.length === 0) missing.push(n);
      else if (hits.length > 1) duplicated.push(n);
    }
    expect(
      missing,
      `mandated report items with no "## Item N:" anchor: ${missing.join(', ')}`,
    ).toEqual([]);
    expect(
      duplicated,
      `mandated report items whose anchor appears more than once: ${duplicated.join(', ')}`,
    ).toEqual([]);

    // Belt-and-braces scope guard: exactly 14 item anchors total, no 15th sneaking in.
    const allAnchors = src.match(/^## Item \d+: /gm) ?? [];
    expect(
      allAnchors.length,
      `expected exactly ${ITEM_COUNT} item anchors, found ${allAnchors.length}`,
    ).toBe(ITEM_COUNT);
  });

  it('every mandated item carries an **Evidence:** citation (no prose-only claim)', () => {
    const src = readRequired(REPORT);
    // Split the file into item sections: from each `## Item N:` heading up to the next
    // `## ` heading (item or otherwise). Each slice must contain an `**Evidence:**` line.
    const lines = src.split(/\r?\n/);
    const itemStarts: Array<{ n: number; idx: number }> = [];
    lines.forEach((line, idx) => {
      const m = line.match(/^## Item (\d+): /);
      if (m) itemStarts.push({ n: Number(m[1]), idx });
    });

    const withoutEvidence: number[] = [];
    for (let i = 0; i < itemStarts.length; i++) {
      const start = itemStarts[i].idx;
      // Section ends at the next `## ` heading of ANY kind (or EOF).
      let end = lines.length;
      for (let j = start + 1; j < lines.length; j++) {
        if (/^## /.test(lines[j])) {
          end = j;
          break;
        }
      }
      const section = lines.slice(start, end).join('\n');
      if (!/^\*\*Evidence:\*\*/m.test(section)) {
        withoutEvidence.push(itemStarts[i].n);
      }
    }
    expect(
      withoutEvidence,
      `report items with NO **Evidence:** line (D-17: every claim must cite by path): ${withoutEvidence.join(', ')}`,
    ).toEqual([]);
  });

  it('the report cites no table named `analysis_runs` (the lifecycle lives on public.analysis_jobs)', () => {
    // There is no `analysis_runs` table. A report that cites a non-existent table is a report
    // nobody should trust. The ONE legitimate place the substring appears is the reaper
    // migration FILENAME (`..._reap_stale_analysis_runs_cron.sql`) and the reaper endpoint
    // (`reap-stale-analysis-runs`, hyphenated) — those are real artifact names, not table
    // citations. Strip the known legitimate compound tokens, then forbid any bare `analysis_runs`.
    let src = readRequired(REPORT);
    for (const legit of ['reap_stale_analysis_runs_cron', 'reap-stale-analysis-runs']) {
      src = src.split(legit).join('');
    }
    expect(
      /analysis_runs/.test(src),
      'the report cites a non-existent `analysis_runs` table — the lifecycle table is `public.analysis_jobs`',
    ).toBe(false);
  });
});
