import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcePath = path.resolve(process.cwd(), 'src/pages/Results.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

describe('Results priority output contract', () => {
  it('does not render obsolete Priority Actions output', () => {
    expect(source).not.toContain('Priority Actions');
    expect(source).not.toContain('quickActions');
    expect(source).not.toContain('priorityActions');
  });

  it('keeps Priority Improvements as the active improvement section', () => {
    expect(source).toContain('Priority Improvements');
  });
});
