// Phase 22 Plan 02 — Results.tsx scan-new header-bar source-grep tests (SC-1)

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(resolve(__dirname, 'Results.tsx'), 'utf-8');

describe('SC-1 (22-02): Results.tsx scan-new header-bar', () => {
  it('renders Resume Screening Report title exactly once', () => {
    const matches = source.match(/Resume Screening Report/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('renders Analyze New Resume button label', () => {
    expect(source).toContain('Analyze New Resume');
  });

  it('button navigates to /upload', () => {
    expect(source).toContain('/upload');
  });

  it('header-bar uses flex items-center justify-between mb-6 layout', () => {
    expect(source).toContain('flex items-center justify-between mb-6');
  });

  it('title uses text-2xl font-semibold', () => {
    expect(source).toContain('text-2xl font-semibold');
  });
});
