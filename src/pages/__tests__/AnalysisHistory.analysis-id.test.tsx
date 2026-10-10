import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/pages/AnalysisHistory.tsx'), 'utf8');

describe('AnalysisHistory analysis_id routing contract', () => {
  it('types and reads usage_tracking.analysis_id', () => {
    expect(source).toContain('analysis_id: string | null');
    expect(source).toContain("select('*')");
  });

  it('resolves direct ids before timestamp proximity fallback', () => {
    const resolver = source.slice(source.indexOf('const getEntryRoute'));
    expect(resolver).toContain('if (entry.analysis_id)');
    expect(resolver.indexOf('if (entry.analysis_id)')).toBeLessThan(resolver.indexOf('findIdForEntry'));
  });

  it('renders orphan direct links unclickable by returning null', () => {
    expect(source).toContain('return direct ? `/linkedin-grader?id=${direct.id}` : null');
    expect(source).toContain('return direct ? `/recruiting-lens?id=${direct.id}` : null');
  });
});
