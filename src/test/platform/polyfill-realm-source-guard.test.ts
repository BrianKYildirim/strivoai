import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// XDEV-03 polyfill-realm source guard (Phase 03 Plan 09). Modeled on
// `src/test/security/xss-sink-guard.test.ts`, the repo's canonical static-source guard.
//
// THE BUG THIS GUARD MAKES UNREPEATABLE
// -------------------------------------
// The `getOrInsertComputed` production incident (2026-07-26) was a polyfill installed in
// the window realm while pdf.js kept throwing inside its worker. pdf.js spawns its worker
// with `{ type: "module" }` and that worker is a FRESH GLOBAL SCOPE which does NOT inherit
// the main thread's polyfills. Every realm must install for itself.
//
// Two properties have to hold, and NEITHER is checkable at runtime by the test suite —
// vitest runs in a single jsdom realm and can never observe a worker realm's globals.
// So they are asserted STATICALLY, against the source text:
//
//   1. Every realm entry imports the `polyfills/` barrel, so a polyfill added to the
//      barrel lands in all three realms by editing ONE file.
//   2. That import is FIRST. These are side-effect imports and ES modules evaluate in
//      import order, so an import placed below another one silently re-opens the gap
//      for whatever evaluates before it.
//
// Deliberately NOT a realm entry: `src/lib/pdf-worker.ts` also imports
// `./polyfills/map-get-or-insert` directly. It is a window-realm module imported BY
// `main.tsx` (which installs the barrel first), so it is already covered; its direct
// import is redundant belt-and-braces, not a realm install site. It is therefore
// excluded from the direct-import prohibition below rather than silently passing it.

const REPO = process.cwd();

/**
 * The three realm entries. Each is a distinct JS global scope at runtime:
 * the window, the pdf.js worker, and the extractor worker.
 */
const REALM_ENTRIES: readonly string[] = [
  'src/main.tsx',
  'src/lib/pdfjs.worker.ts',
  'src/lib/pdf-extractor.worker.ts',
];

const BARREL = 'src/lib/polyfills/index.ts';

/** Polyfill modules the barrel must install, as repo-relative paths. */
const POLYFILL_MODULES: readonly string[] = [
  './map-get-or-insert',
  './crypto-random-uuid',
];

function read(relPath: string): string {
  return readFileSync(join(REPO, relPath), 'utf8');
}

interface ImportRecord {
  specifier: string;
  index: number;
}

/**
 * Extract every VALUE import specifier in source order. `import type { … }` is
 * erased at compile time and installs nothing, so it cannot satisfy or violate an
 * ordering rule about side effects — it is excluded.
 */
function valueImports(source: string): ImportRecord[] {
  const out: ImportRecord[] = [];
  // Two explicit alternatives, side-effect form FIRST. They must stay separate: a
  // single pattern with an optional `… from` group matches greedily and scans PAST a
  // bare `import "./polyfills";` to the next `from` clause several lines below —
  // which silently drops exactly the side-effect imports this guard exists to check.
  //   1. `import "x";`            — side-effect only (no bindings, no `from`)
  //   2. `import … from "x";`     — any binding form, possibly spanning lines
  const pattern =
    /^[ \t]*import\s*['"]([^'"]+)['"]|^[ \t]*import\s[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (/^[ \t]*import\s+type\s/.test(match[0])) continue;
    out.push({ specifier: match[1] ?? match[2], index: match.index });
  }
  return out;
}

/** True when a specifier resolves to the polyfills barrel (relative or aliased). */
function isBarrelSpecifier(specifier: string): boolean {
  return /(^|\/)polyfills(\/index(\.ts)?)?$/.test(specifier);
}

/** True when a specifier reaches INTO the polyfills directory, bypassing the barrel. */
function isDirectPolyfillSpecifier(specifier: string): boolean {
  return /(^|\/)polyfills\/(?!index(\.ts)?$)/.test(specifier);
}

describe('XDEV-03 polyfill realm source guard', () => {
  it('the realm entry list is non-empty (fail-closed against an empty walk)', () => {
    // If this list is ever emptied — or the constant renamed and left unused — every
    // other assertion in this file would vacuously pass over zero files.
    expect(REALM_ENTRIES.length).toBeGreaterThan(0);
    expect(REALM_ENTRIES.length).toBe(3);
  });

  it('all three named realm entries still exist (a rename cannot silently empty the guard)', () => {
    const missing = REALM_ENTRIES.filter((rel) => !existsSync(join(REPO, rel)));
    expect(
      missing,
      `Realm entry file(s) missing: ${missing.join(', ')}. If a realm entry was renamed or `
        + `removed, update REALM_ENTRIES deliberately — do not let this guard shrink by accident.`,
    ).toEqual([]);
  });

  it('the polyfills barrel exists and installs every polyfill module', () => {
    expect(existsSync(join(REPO, BARREL))).toBe(true);
    const source = read(BARREL);
    const specifiers = valueImports(source).map((i) => i.specifier);
    for (const mod of POLYFILL_MODULES) {
      expect(
        specifiers,
        `${BARREL} must import ${mod} for its side effects so it installs in every realm.`,
      ).toContain(mod);
    }
  });

  it('every realm entry imports the polyfills barrel', () => {
    const offenders: string[] = [];
    for (const rel of REALM_ENTRIES) {
      const imports = valueImports(read(rel));
      if (!imports.some((i) => isBarrelSpecifier(i.specifier))) offenders.push(rel);
    }
    expect(
      offenders,
      `Realm entr(y/ies) missing the polyfills barrel import: ${offenders.join(', ')}. Each realm `
        + `is a separate global scope and does NOT inherit another realm's polyfills.`,
    ).toEqual([]);
  });

  it('the barrel import is the FIRST value import in every realm entry', () => {
    const offenders: string[] = [];
    for (const rel of REALM_ENTRIES) {
      const imports = valueImports(read(rel));
      const first = imports[0];
      if (!first || !isBarrelSpecifier(first.specifier)) {
        offenders.push(`${rel} (first import is "${first?.specifier ?? '<none>'}")`);
      }
    }
    expect(
      offenders,
      `The polyfills barrel must be the FIRST value import in each realm entry — polyfills install `
        + `as an import side effect and ES modules evaluate in import order, so anything imported `
        + `above the barrel runs UNPOLYFILLED. Offenders: ${offenders.join('; ')}`,
    ).toEqual([]);
  });

  it('no realm entry reaches past the barrel into an individual polyfill module', () => {
    const offenders: string[] = [];
    for (const rel of REALM_ENTRIES) {
      for (const imp of valueImports(read(rel))) {
        if (isDirectPolyfillSpecifier(imp.specifier)) offenders.push(`${rel} -> ${imp.specifier}`);
      }
    }
    expect(
      offenders,
      `Realm entries must install polyfills through the barrel ONLY. A direct import means the next `
        + `polyfill added to the barrel will silently skip this realm — exactly the getOrInsertComputed `
        + `failure mode. Offenders: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('the guard can actually see imports (parser sanity — non-vacuous extraction)', () => {
    // If `valueImports` silently returned [] for every file (a broken regex), the
    // "no direct import" assertion above would pass while proving nothing at all.
    for (const rel of REALM_ENTRIES) {
      expect(valueImports(read(rel)).length, `${rel} parsed to zero imports`).toBeGreaterThan(0);
    }
    // And it must correctly reject a barrel import that is NOT first.
    const shuffled = 'import "react";\nimport "./lib/polyfills";\n';
    expect(isBarrelSpecifier(valueImports(shuffled)[0].specifier)).toBe(false);
    // And correctly classify a direct polyfill import as a violation.
    expect(isDirectPolyfillSpecifier('./polyfills/crypto-random-uuid')).toBe(true);
    expect(isDirectPolyfillSpecifier('./polyfills')).toBe(false);
    expect(isDirectPolyfillSpecifier('./polyfills/index')).toBe(false);
  });
});
