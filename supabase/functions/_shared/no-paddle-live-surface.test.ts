// Phase 8 (Paddle retirement) negative-reference sweep guard: asserts that no live
// application file reintroduces a Paddle reference now that the paddle-webhook
// function, its config, and all Paddle-only schema have been fully removed.
//
// Historical/audit paths are intentionally NOT scanned — they are allowed to keep
// Paddle references: .planning/ (planning artifacts document the retirement itself),
// supabase/migrations/ (past migrations that created/dropped Paddle schema are part
// of the historical record).
//
// Within the scanned files, a handful of lines legitimately mention "paddle" in
// past tense (documenting that Paddle was fully removed) or as a filename
// substring (this guard's own registration string in deno.json's test:ci). The
// check runs LINE BY LINE: a line containing "paddle" only fails the guard if it
// does not match one of that file's ALLOWED_LINE_PATTERNS. Any new, unexpected
// "paddle" line — e.g. a reintroduced live integration point — still fails.
//
// Approach: static source analysis, no Supabase/Anthropic mocking — mirrors
// _shared/cors-audit.test.ts and _shared/sanitizer-coverage.test.ts.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

// Explicit file list — deliberately NOT a directory walk, so this guard's coverage
// is auditable and intentional rather than accidentally scanning everything.
// Paths are relative to supabase/ (the parent of functions/, where config.toml lives).
const SUPABASE_RELATIVE_FILES = [
  'config.toml',
  'functions/deno.json',
  'functions/_shared/auth.ts',
] as const;

// Paths are relative to the repo root.
const REPO_ROOT_FILES = [
  'scripts/deploy.ps1',
  'src/integrations/supabase/types.ts',
  'docs/ENVIRONMENT.md',
  '.env.example',
  'CLAUDE.md',
  'AGENTS.md',
] as const;

// Lines allowed to contain "paddle" per file — each is a substring match against
// the lowercased line content, not a full-line regex, so exact wording changes
// (e.g. reflowing a paragraph) don't spuriously fail this guard.
const ALLOWED_LINE_SUBSTRINGS: Record<string, string[]> = {
  'functions/deno.json': ['no-paddle-live-surface.test.ts'],
  'docs/ENVIRONMENT.md': [
    'paddle has been fully retired',
    'paddle-webhook` function, its config, and all paddle-only schema were removed',
  ],
  '.env.example': [
    'pro is retired, paddle has been fully',
    'paddle has been fully retired (phase 8); there is no live secret to document here',
  ],
  'CLAUDE.md': [
    'migrates payment processing from paddle to stripe',
    'paddle has been fully retired (phase 8)',
    'there is no `paddle_webhook_secret` or `paddle-webhook` function',
  ],
  'AGENTS.md': [
    'migrates payment processing from paddle to stripe',
    'paddle has been fully',
    'retired (phase 8)',
    'there is no `paddle_webhook_secret` or `paddle-webhook` function',
  ],
};

function toWindowsSafePath(url: URL): string {
  // On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
  const raw = url.pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

function readSupabaseRelativeFile(relative: string): string {
  // This file lives at supabase/functions/_shared/, so supabase/ is two levels up.
  const url = new URL(`../../${relative}`, import.meta.url);
  return Deno.readTextFileSync(toWindowsSafePath(url));
}

function readRepoRootFile(relative: string): string {
  // supabase/functions/_shared/ -> repo root is three levels up.
  const url = new URL(`../../../${relative}`, import.meta.url);
  return Deno.readTextFileSync(toWindowsSafePath(url));
}

function assertNoLivePaddleReference(label: string, source: string): void {
  const allowed = ALLOWED_LINE_SUBSTRINGS[label] ?? [];
  const offendingLines: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const lower = line.toLowerCase();
    if (!lower.includes('paddle')) continue;
    const isAllowed = allowed.some((substring) => lower.includes(substring));
    if (!isAllowed) offendingLines.push(line);
  }
  assertEquals(
    offendingLines,
    [],
    `Found live Paddle reference(s) in ${label}:\n${offendingLines.join('\n')}`,
  );
}

// Length guards — if a new live file is added to either list, this must be updated
// deliberately rather than silently expanding coverage.
Deno.test('no-paddle-live-surface covers exactly 3 supabase-relative files', () => {
  assertEquals(SUPABASE_RELATIVE_FILES.length, 3);
});

Deno.test('no-paddle-live-surface covers exactly 6 repo-root files', () => {
  assertEquals(REPO_ROOT_FILES.length, 6);
});

for (const relative of SUPABASE_RELATIVE_FILES) {
  Deno.test(`no-paddle-live-surface [${relative}] contains no live "paddle" reference`, () => {
    assertNoLivePaddleReference(relative, readSupabaseRelativeFile(relative));
  });
}

for (const relative of REPO_ROOT_FILES) {
  Deno.test(`no-paddle-live-surface [${relative}] contains no live "paddle" reference`, () => {
    assertNoLivePaddleReference(relative, readRepoRootFile(relative));
  });
}
