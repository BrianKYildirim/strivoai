import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePlanningPhaseDir } from '../planningPhasePath';

// SEC-11 / SEC-12 / SEC-14 (D-05) doc guard — the FIRST automated Phase-2 security
// invariant that is asserted, not merely claimed. Modeled on the static-source
// precedent of `src/pages/__tests__/pricing-token-guard.test.ts` (node:fs, read
// relative to process.cwd(), auto-discovered by vitest via `src/**/*.test.ts` — no
// deno.json edit). It proves three things about the committed Phase-2 audit docs:
//   (1) the SEC-01..10 disposition table is complete (10 rows, none blank),
//   (2) all 17 audit domains are covered in the coverage index,
//   (3) NO secret VALUE leaks into any Phase-2 audit doc (T-02-07).
// Fail-closed: a missing required doc throws rather than silently passing.

const PHASE_DIR = resolvePlanningPhaseDir(
  '02-security-audit-remediation',
  'security-audit-docs',
);
const AUDIT_DOC = join(PHASE_DIR, 'SECURITY-AUDIT.md');

function readRequired(path: string): string {
  if (!existsSync(path)) {
    throw new Error(
      `[security-audit-docs] required audit doc missing (fail-closed): ${path}`,
    );
  }
  return readFileSync(path, 'utf8');
}

// Recursively collect every `.md` under the phase dir — including the future
// `audit/` subdir and the SEC-15 SECURITY-RECORD.md when they land, so a NEW
// audit doc is automatically enrolled in the no-secret-leak sweep.
function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

// The canonical 17 audit domains (SEC-12). This array is the length-guarded source
// of truth — a dropped domain (array or doc) fails the coverage assertion.
const DOMAINS_17 = [
  'auth/session',
  'authz/access control',
  'RLS enforcement',
  'user+resource ownership',
  'cross-origin handling',
  'input validation/output encoding',
  'file-upload/document-processing safety',
  'secret+env handling',
  'sensitive-data exposure',
  'logging/error-message safety',
  'rate limiting/abuse',
  'Merit+billing integrity',
  'webhook auth+replay',
  'AI prompt/provider-response exposure',
  'DB function permissions',
  'dependency/supply-chain',
  'prod-vs-staging isolation',
] as const;

// Secret-VALUE patterns (from `.planning/audit/ENV-SEPARATION.md`) — tuned to match
// real VALUES (key bodies / JWTs / connection strings), NOT the pattern *names* that
// planning docs legitimately describe. Project-refs are identifiers and are stripped
// (allowlisted) before matching so they never trip the guard.
const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'Stripe live secret key', re: /sk_live_[A-Za-z0-9]{20}/ },
  { label: 'Stripe test secret key', re: /sk_test_[A-Za-z0-9]{20}/ },
  { label: 'Stripe live publishable key', re: /pk_live_[A-Za-z0-9]{20}/ },
  { label: 'service-role JWT', re: /service_role[^a-zA-Z0-9]{0,40}eyJ/ },
  { label: 'JWT (eyJ...)', re: /eyJ[A-Za-z0-9_-]{30,}/ },
  { label: 'Stripe price ID', re: /price_[A-Za-z0-9]{20,}/ },
  { label: 'Stripe webhook secret', re: /whsec_[A-Za-z0-9]{20,}/ },
  { label: 'PEM private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'Postgres connection string', re: /postgres(?:ql)?:\/\/[A-Za-z0-9]/ },
];

// Allowlisted project IDENTIFIERS (not secrets) — prod + preview/test refs.
const ALLOWLISTED_REFS = ['zjpjapgraoxdukdvpjes', 'cimjltzovkahkqecpwgi'];

describe('SEC-11 disposition completeness', () => {
  it('SECURITY-AUDIT.md exists and cites SEC-01..SEC-10', () => {
    const src = readRequired(AUDIT_DOC);
    expect(src).toContain('SEC-01');
    expect(src).toContain('SEC-10');
  });

  it('has exactly 10 SEC-0x disposition rows', () => {
    const src = readRequired(AUDIT_DOC);
    const rows = src.match(/^\|\s*(?:SEC-0[1-9]|SEC-10)\s*\|/gm) ?? [];
    expect(
      rows.length,
      `expected 10 SEC-0x disposition rows, found ${rows.length}`,
    ).toBe(10);
  });

  it('no SEC-0x disposition row has an empty cell (disposition + evidence populated)', () => {
    const src = readRequired(AUDIT_DOC);
    const rowLines = src
      .split(/\r?\n/)
      .filter((l) => /^\|\s*(?:SEC-0[1-9]|SEC-10)\s*\|/.test(l));
    const offenders: string[] = [];
    for (const line of rowLines) {
      // Drop the leading/trailing empty cell produced by the outer pipes.
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.some((c) => c.length === 0)) offenders.push(line);
    }
    expect(
      offenders,
      `SEC-0x rows with a blank cell:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('SEC-12 17-domain coverage', () => {
  it('the domain list is exactly 17 (length guard)', () => {
    expect(DOMAINS_17.length).toBe(17);
  });

  it('SECURITY-AUDIT.md covers every one of the 17 domains', () => {
    const src = readRequired(AUDIT_DOC);
    const missing = DOMAINS_17.filter((d) => !src.includes(d));
    expect(
      missing,
      `SECURITY-AUDIT.md is missing these audit domains: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});

describe('No secret VALUE leaks in Phase-2 audit docs', () => {
  const docs = walkMarkdown(PHASE_DIR);

  it('discovers the Phase-2 audit docs (length guard so a new doc is auto-included)', () => {
    // At minimum SECURITY-AUDIT.md + 02-SECURITY.md must be present; the glob
    // auto-includes any future audit/ finding docs + the SEC-15 record.
    expect(docs.length).toBeGreaterThanOrEqual(2);
    expect(docs.some((p) => p.endsWith('SECURITY-AUDIT.md'))).toBe(true);
    expect(docs.some((p) => p.endsWith('02-SECURITY.md'))).toBe(true);
  });

  for (const { label, re } of SECRET_PATTERNS) {
    it(`no Phase-2 audit doc leaks a ${label}`, () => {
      const offenders: string[] = [];
      for (const path of docs) {
        let content = readFileSync(path, 'utf8');
        for (const ref of ALLOWLISTED_REFS) {
          content = content.split(ref).join('');
        }
        if (re.test(content)) offenders.push(path);
      }
      expect(
        offenders,
        `${label} VALUE pattern found in: ${offenders.join(', ')}`,
      ).toEqual([]);
    });
  }
});
