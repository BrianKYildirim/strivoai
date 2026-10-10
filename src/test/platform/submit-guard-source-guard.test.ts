import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO = process.cwd();
const PAGES_DIR = join(REPO, 'src', 'pages');

const MONEY_PATH_PAGES = [
  'src/pages/Upload.tsx',
  'src/pages/Onboarding.tsx',
  'src/pages/LinkedInGrader.tsx',
  'src/pages/RecruitingLens.tsx',
  'src/pages/CareerCompass.tsx',
] as const;

const ELITE_RERUN = 'src/hooks/useEliteRerun.ts';
const START_LABELS = [
  'Analyze Resume',
  'Finish Setup',
  'Get Personalized Analysis',
  'Analyze Job',
  'Discover My Career Path',
] as const;

function read(relativePath: string): string {
  return readFileSync(join(REPO, relativePath), 'utf8');
}

function walkPages(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== '__tests__') {
      files.push(...walkPages(fullPath));
    } else if (
      entry.isFile()
      && /\.(ts|tsx)$/.test(entry.name)
      && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativePath(fullPath: string): string {
  return relative(REPO, fullPath).split(sep).join('/');
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

describe('Phase 03 submit-guard source contract', () => {
  const pageFiles = walkPages(PAGES_DIR);

  it('walks a non-empty page tree and all named money-path files still exist', () => {
    expect(pageFiles.length).toBeGreaterThan(0);
    const expected = [...MONEY_PATH_PAGES, ELITE_RERUN];
    const missing = expected.filter((path) => !existsSync(join(REPO, path)));
    expect(missing, `Missing guarded submit files: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps submit nonce generation out of page handlers', () => {
    const violations: string[] = [];
    for (const fullPath of pageFiles) {
      const source = readFileSync(fullPath, 'utf8');
      for (const match of source.matchAll(/crypto\.randomUUID\s*\(/g)) {
        violations.push(`${relativePath(fullPath)}:${lineNumber(source, match.index!)}`);
      }
    }
    expect(
      violations,
      `Inline submit nonce generation is forbidden; use useSubmitGuard. Violations: ${violations.join(', ')}`,
    ).toEqual([]);
  });

  it('routes every money-path page and the Elite rerun through the shared primitive', () => {
    const violations: string[] = [];
    for (const path of MONEY_PATH_PAGES) {
      const source = read(path);
      if (!source.includes("from '@/hooks/useSubmitGuard'") && !source.includes('from "@/hooks/useSubmitGuard"')) {
        violations.push(`${path}: missing useSubmitGuard import`);
      }
      if (!source.includes('useSubmitGuard({')) {
        violations.push(`${path}: missing useSubmitGuard call`);
      }
    }
    const rerunSource = read(ELITE_RERUN);
    if (!rerunSource.includes('beginRerun(sourceResume.id)')) {
      violations.push(`${ELITE_RERUN}: deliberate rerun does not call beginRerun`);
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('keeps disabled off every money-path start CTA', () => {
    const violations: string[] = [];
    for (const path of MONEY_PATH_PAGES) {
      const source = read(path);
      for (const button of source.matchAll(/<Button\b[\s\S]*?<\/Button>/g)) {
        const block = button[0];
        const label = START_LABELS.find((candidate) => block.includes(candidate));
        if (!label) continue;
        if (/\sdisabled\s*=/.test(block)) {
          violations.push(`${path}:${lineNumber(source, button.index!)} (${label}) uses disabled`);
        }
        if (!block.includes('aria-disabled=')) {
          violations.push(`${path}:${lineNumber(source, button.index!)} (${label}) lacks aria-disabled`);
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
