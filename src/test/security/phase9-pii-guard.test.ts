import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolvePlanningPhaseDir } from '../planningPhasePath';

// D-15 PII guard (VER-04) — "PII protection is enforced, not intended."
//
// Plan 09-11 writes REAL production evidence into the Phase 9 directory: analysis run
// ids, merit-ledger deltas, edge-log excerpts, screenshots. A real user's email or auth
// uid could ride along inside any of that. This guard must therefore exist BEFORE the
// evidence lands, and it must be impossible to skip.
//
// Modeled 1:1 on `src/test/security/security-audit-docs.test.ts` (Phase 2, SEC-11/12/14):
// vitest + `node:fs` from `process.cwd()`, auto-discovered by the `src/**/*.test.ts` glob
// — there is NO registration step and therefore no allowlist anyone can quietly drop it
// from. It runs inside `verify:baseline`, so PII in Phase 9 evidence is a RED gate rather
// than a code-review hope.
//
// Threats (09-02-PLAN):
//   T-09-02-A  real-user PII in a git-tracked evidence artifact  -> email + uuid sweep
//   T-09-02-B  a real person's profile shipped as a "fixture"    -> fixture enrollment
//   T-09-02-C  secret leakage into evidence                      -> SECRET_PATTERNS sweep
//   T-09-02-D  the guard false-positives itself into uselessness -> VALUE-tuned patterns
//              + explicit allowlists stripped BEFORE scanning (the Phase-2 precedent)

const PHASE_DIR = resolvePlanningPhaseDir(
  '09-final-verification-milestone-report',
  'phase9-pii-guard',
);
const FIXTURE_DIR = join(process.cwd(), 'scripts', 'test-resumes');
const PROVENANCE_DOC = join(PHASE_DIR, '09-FIXTURE-PROVENANCE.md');

// ── Allowlists ────────────────────────────────────────────────────────────────
// Everything here is stripped from the text BEFORE the patterns run — the same
// escape-valve `security-audit-docs.test.ts` uses for project refs. Anything NOT
// listed here is a finding.

/** Project IDENTIFIERS (prod + preview/test). Not secrets. */
const ALLOWLISTED_REFS = ['zjpjapgraoxdukdvpjes', 'cimjltzovkahkqecpwgi'];

/**
 * The two purpose-created PRODUCTION test-account addresses (Free + Elite) for the
 * VER-04 real-account pass.
 *
 * INTENTIONALLY EMPTY. Plan **09-11** is the ONLY plan permitted to append to this
 * array, and it may append ONLY those two addresses — nothing else, ever. Keeping it
 * empty today forces 09-11's additions to be explicit, reviewable, and diffable.
 */
const ALLOWED_TEST_ACCOUNT_EMAILS: string[] = [];

/**
 * The `analysis_jobs.id` run ids cited as evidence by the VER-04 / activation-soak runs.
 *
 * Every UUID appearing anywhere in the phase directory is either a deliberately-declared
 * run id below, or it is RED. That is what makes "a production user's auth uid cannot ride
 * along in a log excerpt" ENFORCEABLE rather than aspirational.
 *
 * The four below are **STAGING** run ids from plan 09-10's lifecycle activation smoke,
 * cited in `09-STAGING-ACTIVATION.md` §4.1. They are `analysis_jobs.id` values on the
 * PREVIEW project (`cimjltzovkahkqecpwgi`), produced by the seeded synthetic E2E account
 * against `scripts/test-resumes/` fixtures. They are not production rows and they identify
 * no real person. Plan **09-11** appends the PRODUCTION run ids it cites.
 */
const ALLOWED_RUN_IDS: string[] = [
  // 09-10 staging activation smoke (preview cimjltzovkahkqecpwgi, 2026-07-14)
  'bc1284c2-0d89-4b77-8e4c-52c78401ad4b', // recruiting_lens — the Step-C positive confirmation
  'c45a14e1-97c8-4d51-8b57-49700e493d09', // onboarding
  '2873d745-259b-4364-b07c-ed9b21f0d55d', // resume (streaming SSE)
  '4ec0fd15-7df4-438c-8f53-0e8109ab2bdb', // career_compass (async worker)
  // 09-10 post-migration re-smoke: flip #2 proven end-to-end (preview, 2026-07-14)
  '5059547b-352f-427a-bd7c-9b99576d198e', // linkedin — the first linkedin_grading run to ever complete
  // 09-11 PRODUCTION staged activation (zjpjapgraoxdukdvpjes, 2026-07-15). Synthetic
  // scripts/test-resumes/ fixtures on the purpose-created Free/Elite test accounts; no real person.
  '941bb986-f390-4251-b524-7eef0b9f8575', // Flip 1 recruiting_lens (Elite) — positive lifecycle confirmation
  'fb4d2801-12ae-4963-8499-10c0fd404489', // Flip 2 linkedin (Elite)
  '41bd6bf8-3eca-4c02-9be0-85fd2860152e', // Flip 2 linkedin (Free)
  // 09-11 Flip 3 (onboarding) VER-04 pass (zjpjapgraoxdukdvpjes, 2026-07-17). Same synthetic
  // scripts/test-resumes/ fixtures on purpose-created test accounts; no real person. Only runs whose
  // owning account still EXISTS are cited as evidence, so each remains re-verifiable against the
  // ledger (D9-13: deleting an account cascades merit_transactions away but orphans the run row).
  'dda6fa21-01d9-4d30-b83c-f3f64eb3e049', // Flip 3 onboarding (Free)  — the durable Free-tier row
  '162eb183-5b05-445e-a2bd-ca6ebfffd384', // Flip 3 onboarding (Elite)
  '7597ab74-82f1-46e2-a9d4-898f5000847f', // Flip 3 re-pass linkedin (Elite)
  '072c79d5-40aa-4b9e-a844-afa5f4506f30', // Flip 3 re-pass linkedin (Free)
  // 09-11 Flip 4 (resume, streaming SSE) VER-04 pass (zjpjapgraoxdukdvpjes, 2026-07-17). No accounts
  // deleted this pass, so every row below still joins to its debit and stays re-verifiable.
  'c3b2ba20-55e4-4770-880d-4c8b28a76c6a', // Flip 4 resume (Free, resume-only) — the 2.1 confirmation
  'fba82663-2746-47c7-ad44-49fc33a3875a', // Flip 4 resume (Free, resume+LinkedIn)
  'ac371df2-dd34-4108-a6ec-a9fb23ca143e', // Flip 4 linkedin leg (Free, resume+LinkedIn)
  '462c3fae-2f71-4ce5-8094-4e034ebe711b', // Flip 4 resume (Elite, resume-only)
  'a1133436-76e9-45f4-bd41-e3984377d424', // Flip 4 linkedin leg (Elite, resume+LinkedIn)
];

/**
 * Email addresses belonging to the SYNTHETIC fixture personas in `scripts/test-resumes/`.
 * Each is enrolled with a SYNTHETIC verdict in `09-FIXTURE-PROVENANCE.md`. None is
 * routable to a real person. A fixture email that is NOT on this list turns the guard
 * RED — which is exactly how the real LinkedIn export (finding T-09-02-B) would have
 * been caught on the day it was committed.
 */
const ALLOWED_FIXTURE_EMAILS = [
  'alexchen@university.edu', // short.txt  — fabricated persona
  'priyasharma@uci.edu', // medium.txt — fabricated persona
  'jordanm@stanford.edu', // long.txt   — fabricated persona
];

/**
 * Addresses at RFC 2606 / RFC 6761 RESERVED domains are non-PII BY CONSTRUCTION — those
 * names are permanently reserved and can never resolve to a real person's mailbox. They
 * are stripped before the email sweep, which is why the planning docs may keep using
 * `someone@example.com` as a placeholder and why the synthetic `Profile.pdf` persona uses
 * `example.com`.
 *
 * This is a T-09-02-D tune, NOT a weakening: it removes ZERO detection power against the
 * actual threat (a real user's routable address — `@gmail.com`, `@outlook.com`, a real
 * corporate domain), and it is what keeps the guard from red-flagging its own
 * documentation and getting neutered by the next person who trips over it.
 *
 * Consequence: the RED-before-GREEN demonstration must inject a ROUTABLE-domain address
 * (which is a stricter demo — it simulates the real threat rather than a placeholder).
 */
const RESERVED_EMAIL_DOMAINS =
  /[\w.+-]+@(?:[\w-]+\.)*(?:example\.(?:com|org|net)|example|test|invalid|localhost)\b/gi;

// ── Patterns ──────────────────────────────────────────────────────────────────

const PII_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'email address', re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/ },
  {
    label: 'UUID (production user id / un-declared run id)',
    re: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  },
];

// Secret-VALUE patterns, copied from `security-audit-docs.test.ts` (T-09-02-C). Tuned to
// match real VALUES (full key bodies / JWTs / connection strings), NOT the pattern *names*
// that planning prose legitimately describes — otherwise the guard trips on its own
// documentation (T-09-02-D).
const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'Stripe live secret key', re: /sk_live_[A-Za-z0-9]{20}/ },
  { label: 'Stripe test secret key', re: /sk_test_[A-Za-z0-9]{20}/ },
  { label: 'Stripe live publishable key', re: /pk_live_[A-Za-z0-9]{20}/ },
  // Requires an actual key BODY after `eyJ`. The Phase-2 original stopped at `eyJ`, which
  // false-positives on prose that merely *names* the pattern (e.g. this plan's own threat
  // model writes `service_role.*eyJ`) — T-09-02-D. A real service-role JWT always carries
  // a body, and the standalone `JWT (eyJ...)` rule below catches it regardless, so this
  // costs no detection power.
  { label: 'service-role JWT', re: /service_role[^a-zA-Z0-9]{0,40}eyJ[A-Za-z0-9_-]{10,}/ },
  { label: 'JWT (eyJ...)', re: /eyJ[A-Za-z0-9_-]{30,}/ },
  { label: 'Stripe price ID', re: /price_[A-Za-z0-9]{20,}/ },
  { label: 'Stripe webhook secret', re: /whsec_[A-Za-z0-9]{20,}/ },
  { label: 'PEM private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'Postgres connection string', re: /postgres(?:ql)?:\/\/[A-Za-z0-9]/ },
];

// ── Scanning ──────────────────────────────────────────────────────────────────

/** Every file under `dir`, recursively — including any evidence/ subdir 09-11 creates. */
function walkAll(dir: string): string[] {
  if (!existsSync(dir)) {
    throw new Error(`[phase9-pii-guard] required scan root missing (fail-closed): ${dir}`);
  }
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkAll(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Read any file — text or binary — as a scannable string.
 *
 * `latin1` never throws on arbitrary bytes and preserves ASCII byte-for-byte, so a PDF's
 * literal text runs surface as plain text. This is why the synthetic `Profile.pdf` is
 * emitted with UNCOMPRESSED content streams (see
 * `scripts/test-resumes/generate-synthetic-linkedin-pdf.mjs`): a Flate-compressed profile
 * would hide an email from this sweep, so the fixture is deliberately kept greppable.
 */
function readScannable(path: string): string {
  return readFileSync(path).toString('latin1');
}

/** Strip every allowlisted value, then scan what remains. */
function redactAllowlisted(content: string): string {
  let out = content;
  for (const allowed of [
    ...ALLOWLISTED_REFS,
    ...ALLOWED_TEST_ACCOUNT_EMAILS,
    ...ALLOWED_RUN_IDS,
    ...ALLOWED_FIXTURE_EMAILS,
  ]) {
    out = out.split(allowed).join('');
  }
  // Reserved-domain addresses cannot belong to a real person (see above).
  out = out.replace(RESERVED_EMAIL_DOMAINS, '');
  return out;
}

const SCAN_ROOTS = [PHASE_DIR, FIXTURE_DIR];
const SCANNED_FILES = SCAN_ROOTS.flatMap(walkAll);

/** The guard's own source is NOT in scan scope (it is under `src/`), so its allowlist
 *  literals cannot false-positive it — but the provenance doc IS, which is why that doc
 *  quotes zero real PII. */
function offendersFor(re: RegExp): string[] {
  const offenders: string[] = [];
  for (const path of SCANNED_FILES) {
    const content = redactAllowlisted(readScannable(path));
    const hit = content.match(re);
    if (hit) {
      // Report the LOCATION and the pattern, never the matched value — echoing a leaked
      // secret or a real user's email into CI output would defeat the point of the guard.
      offenders.push(relative(process.cwd(), path));
    }
  }
  return offenders;
}

describe('Phase 9 PII guard — scan roots', () => {
  it('discovers both scan roots (length guard, so a new artifact is auto-enrolled)', () => {
    // Fail-closed: if the phase dir were ever empty/renamed, the sweeps below would
    // vacuously pass. This assertion makes that impossible.
    expect(SCANNED_FILES.length).toBeGreaterThanOrEqual(5);
    expect(SCANNED_FILES.some((p) => p.startsWith(PHASE_DIR))).toBe(true);
    expect(SCANNED_FILES.some((p) => p.startsWith(FIXTURE_DIR))).toBe(true);
  });
});

describe('T-09-02-A — no real-user PII in Phase 9 evidence or fixtures', () => {
  for (const { label, re } of PII_PATTERNS) {
    it(`no ${label} appears outside the declared allowlists`, () => {
      const offenders = offendersFor(re);
      expect(
        offenders,
        `Un-allowlisted ${label} found in:\n  ${offenders.join('\n  ')}\n\n` +
          `If this is a purpose-created test account, add it to ALLOWED_TEST_ACCOUNT_EMAILS.\n` +
          `If this is an analysis run id you are citing as evidence, add it to ALLOWED_RUN_IDS.\n` +
          `If it is neither, it is real user data and MUST NOT be committed.`,
      ).toEqual([]);
    });
  }
});

describe('T-09-02-C — no secret-shaped value in Phase 9 evidence or fixtures', () => {
  for (const { label, re } of SECRET_PATTERNS) {
    it(`no Phase 9 artifact leaks a ${label}`, () => {
      const offenders = offendersFor(re);
      expect(
        offenders,
        `${label} VALUE pattern found in:\n  ${offenders.join('\n  ')}`,
      ).toEqual([]);
    });
  }
});

describe('T-09-02-B — binary fixtures stay byte-transparent to the sweep', () => {
  // WHY THIS EXISTS — a hole found while building this guard, and closed here.
  //
  // The byte sweep above reads a PDF as latin1 and greps it. That only works if the PDF's
  // text is stored as literal bytes. The REAL `Profile.pdf` (finding T-09-02-B, commit
  // 21925c88) stored its text in `/Filter /FlateDecode` compressed streams — so the byte
  // sweep ALONE would NOT have caught its real email. A compressed binary is a blind spot:
  // the guard cannot certify what it cannot read.
  //
  // So compressibility itself is the thing to forbid. A binary fixture must be readable by
  // the sweep that is supposed to vet it. `generate-synthetic-linkedin-pdf.mjs` emits
  // uncompressed content streams precisely to satisfy this; a PDF dropped in from LinkedIn
  // (or any real-world exporter) is compressed, fails HERE, and cannot reach the gate
  // un-vetted. That makes "we scanned the binary" a true statement instead of a hopeful one.
  const pdfFixtures = readdirSync(FIXTURE_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
    .map((e) => e.name);

  it('there is at least one PDF fixture to vet', () => {
    expect(pdfFixtures).toContain('Profile.pdf');
  });

  for (const name of pdfFixtures) {
    it(`${name} stores its text as readable bytes (no compressed streams to hide PII in)`, () => {
      const bytes = readScannable(join(FIXTURE_DIR, name));
      expect(
        /FlateDecode|LZWDecode/.test(bytes),
        `${name} uses compressed streams, so the PII sweep cannot read its text and cannot ` +
          `certify it clean. Regenerate it uncompressed: ` +
          `node scripts/test-resumes/generate-synthetic-linkedin-pdf.mjs`,
      ).toBe(false);
    });

    it(`${name} exposes its text layer to the sweep (positive control)`, () => {
      // Proves the sweep genuinely sees this file's CONTENT — not just its structure.
      // Without this, an empty/opaque PDF would pass the PII sweep vacuously.
      const bytes = readScannable(join(FIXTURE_DIR, name));
      expect(bytes).toContain('linkedin.com/in/');
    });
  }
});

describe('T-09-02-B — every fixture is enrolled in the provenance record', () => {
  it('09-FIXTURE-PROVENANCE.md exists (fail-closed)', () => {
    expect(
      existsSync(PROVENANCE_DOC),
      '09-FIXTURE-PROVENANCE.md is missing — D-15 requires every VER-04 input be proven synthetic on the record',
    ).toBe(true);
  });

  it('every scripts/test-resumes fixture is enrolled with an explicit verdict', () => {
    const provenance = readFileSync(PROVENANCE_DOC, 'utf8');

    // Every fixture must be named in the doc. A NEW fixture cannot be added without a
    // provenance entry — this is the assertion that would have caught T-09-02-B on day one.
    const fixtures = readdirSync(FIXTURE_DIR, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      // The generator script is the PDF's provenance, not itself an analysis input.
      .filter((name) => name !== 'generate-synthetic-linkedin-pdf.mjs');

    expect(fixtures.length, 'expected the four D-15 fixtures').toBe(4);

    const unenrolled = fixtures.filter((name) => !provenance.includes(name));
    expect(
      unenrolled,
      `fixtures with no entry in 09-FIXTURE-PROVENANCE.md: ${unenrolled.join(', ')}`,
    ).toEqual([]);
  });

  it('the provenance record carries an explicit verdict line for every fixture', () => {
    const provenance = readFileSync(PROVENANCE_DOC, 'utf8');
    const verdicts = provenance.match(/Verdict[^:]*:\s*\**(SYNTHETIC|SUSPECT|REAL)/g) ?? [];
    // 4 fixtures; Profile.pdf carries two (the REAL finding + its remediated verdict).
    expect(
      verdicts.length,
      `expected an explicit Verdict: line per fixture, found ${verdicts.length}`,
    ).toBeGreaterThanOrEqual(4);
  });
});
