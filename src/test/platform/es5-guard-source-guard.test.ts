import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// XDEV-01 ES5 pre-bundle guard source guard (Phase 03 Plan 07). Modeled on
// `src/test/security/xss-sink-guard.test.ts`, the repo's canonical static-source guard.
//
// THE FAILURE THIS GUARD MAKES UNREPEATABLE
// -----------------------------------------
// The inline block in `index.html` exists to speak when the module bundle cannot — a
// browser too old to PARSE modern syntax never reaches one line inside `src/`. If that
// block itself ever contains `const`, an arrow function, a template literal or optional
// chaining, it throws a SyntaxError in the exact browser it was written to serve, and
// the user gets the identical white screen with extra steps. The guard becomes the
// outage.
//
// That property is unobservable at runtime here: vitest runs in a modern jsdom realm
// that parses every one of those constructs happily, and no available engine is old
// enough to reject them. So it is asserted STATICALLY, against the source text — the
// same reason the polyfill-realm guard next door is static.
//
// Four things are locked down:
//   1. ES5-only syntax (D-08a) — machine-enforced, not reviewer discipline.
//   2. No network request, no storage read, no cookie (D-08 rule 4) — a pre-bundle
//      script is the perfect place to accidentally beacon device data before any
//      consent or auth exists.
//   3. The A1/A2 testids and headings, so UI-SPEC copy cannot silently drift and the
//      Playwright proof cannot silently start matching nothing.
//   4. The `main.tsx` boot handshake, IN FILE ORDER — if it ever stops being set, the
//      A2 watchdog fires on every successful load 8 seconds in (OT-19 rides along on
//      the viewport-meta assertion).

const REPO = process.cwd();

const INDEX_HTML = 'index.html';
const MAIN_TSX = 'src/main.tsx';
const STATIC_PAGE = 'public/supported-browsers.html';

/**
 * Syntax that would throw at PARSE time in a browser below the support floor. The
 * whole block is rejected before a single statement runs, so one of these is fatal
 * in a way a runtime feature check never is.
 */
const FORBIDDEN_SYNTAX: readonly string[] = [
  'const ',
  'let ',
  '=>',
  '`',
  '?.',
  '??',
  'class ',
  '...',
  ' of ',
  'import ',
  'async ',
  'await ',
  'Object.entries',
  'Object.fromEntries',
  'Array.prototype.at',
];

/**
 * Capabilities D-08 rule 4 forbids the pre-bundle guard from touching. `new Function`
 * is included separately from the syntax list: it parses everywhere, but a future CSP
 * without `unsafe-eval` would turn it into a throw inside the failure path itself.
 */
const FORBIDDEN_CAPABILITIES: readonly string[] = [
  'fetch(',
  'XMLHttpRequest',
  'sendBeacon',
  'localStorage',
  'sessionStorage',
  'document.cookie',
  'new Function',
];

/** UI-SPEC § Surface A — the frozen copy. Drift here is a contract violation. */
const REQUIRED_STRINGS: readonly string[] = [
  'browser-gate-unsupported',
  'browser-gate-boot-timeout',
  "Strivo can't run in this browser",
  "Strivo didn't finish loading",
];

function read(relPath: string): string {
  return readFileSync(join(REPO, relPath), 'utf8');
}

/**
 * Extract the inline CLASSIC `<script>` block that renders the gate.
 *
 * The negative lookahead on `type=` is what makes this correct: `index.html` also
 * carries `<script type="module" src="/src/main.tsx">`, which is the bundle entry and
 * is deliberately NOT subject to any of the rules below. Matching it instead would
 * make every assertion here vacuous.
 */
export function extractGuardBlock(html: string): string | null {
  const pattern = /<script(?![^>]*\btype\s*=)[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    if (match[1].includes('browser-gate')) return match[1];
  }
  return null;
}

/** The `content` attribute of the viewport meta tag, or null if there is none. */
export function extractViewportContent(html: string): string | null {
  const match = /<meta\s+name=["']viewport["'][^>]*\bcontent=["']([^"']*)["']/i.exec(html);
  return match ? match[1] : null;
}

describe('XDEV-01 ES5 pre-bundle guard source guard', () => {
  const html = read(INDEX_HTML);
  const block = extractGuardBlock(html);

  it('locates a non-empty inline classic guard block in index.html (fail-closed)', () => {
    // THE non-empty-walk assertion. A guard that silently matched nothing would pass
    // every assertion below while proving absolutely nothing — the exact rot the repo
    // recorded when a lane went green over zero collected tests.
    expect(
      block,
      `No inline classic <script> containing "browser-gate" was found in ${INDEX_HTML}. If the `
        + `guard was moved into a module or an external file it is no longer PRE-BUNDLE and no `
        + `longer serves a browser that cannot parse the bundle. Do not "fix" this by relaxing `
        + `the extractor.`,
    ).not.toBeNull();
    expect((block ?? '').trim().length).toBeGreaterThan(200);
  });

  it('the extractor ignores the module entry script (non-vacuity of the extractor itself)', () => {
    // If the negative lookahead broke, the extractor would happily return the module
    // bundle's script tag and every syntax assertion would be checked against the
    // wrong thing.
    const synthetic =
      '<script type="module" src="/src/main.tsx"></script>'
      + '<script>var browserGate = 1; /* browser-gate */</script>';
    expect(extractGuardBlock(synthetic)).toContain('var browserGate');
    expect(extractGuardBlock('<script type="module">/* browser-gate */</script>')).toBeNull();
    // And it must be able to report absence rather than inventing a match.
    expect(extractGuardBlock('<script>var x = 1;</script>')).toBeNull();
  });

  it('the guard block uses ES5-only syntax', () => {
    const found = FORBIDDEN_SYNTAX.filter((token) => (block ?? '').includes(token));
    expect(
      found,
      `The pre-bundle guard in ${INDEX_HTML} contains post-ES5 syntax: ${found.join(', ')}. This `
        + `block runs BEFORE the module bundle precisely so an old browser gets a readable message `
        + `instead of a white screen — modern syntax here throws a SyntaxError in that browser and `
        + `turns the guard into the outage it exists to prevent. Rewrite with var/function, and `
        + `keep comments clear of these substrings too.`,
    ).toEqual([]);
  });

  it('the guard block makes no network request, reads no storage and sets no cookie', () => {
    const found = FORBIDDEN_CAPABILITIES.filter((token) => (block ?? '').includes(token));
    expect(
      found,
      `The pre-bundle guard in ${INDEX_HTML} touches a forbidden capability: ${found.join(', ')}. `
        + `D-08 rule 4 — this script runs before any consent, any auth and any error handling, so `
        + `it must not beacon, must not read storage and must not set a cookie.`,
    ).toEqual([]);
  });

  it('the guard block never assigns markup as a string', () => {
    // The one surface in the app with no framework escaping. All copy is static
    // literal text, set through a property that cannot interpret markup.
    expect(block).not.toContain('innerHTML');
    expect(block).not.toContain('outerHTML');
    expect(block).not.toContain('document.write');
    // And it must never build a message out of the URL — that would make the gate an
    // XSS sink in the one place nothing else is watching.
    expect(block).not.toContain('location.');
    expect(block).toContain('createTextNode');
  });

  it('the guard block carries both testids and both UI-SPEC headings verbatim', () => {
    const missing = REQUIRED_STRINGS.filter((needle) => !(block ?? '').includes(needle));
    expect(
      missing,
      `The pre-bundle guard is missing frozen UI-SPEC Surface A content: ${missing.join(' | ')}. `
        + `A1 (capability) and A2 (boot watchdog) are DIFFERENT diagnoses with different copy — `
        + `telling somebody on a slow connection that their browser is unsupported is a contract `
        + `violation. The testids are also what the Playwright proof selects on.`,
    ).toEqual([]);
  });

  it('the guard renders role="alert" and does not also set aria-live', () => {
    // UI-SPEC Surface A rule 5 — `aria-live` on top of `role="alert"` is redundant and
    // double-announces on some screen readers.
    expect(block).toContain("'role', 'alert'");
    expect(block).not.toContain('aria-live');
  });

  it('the guard arms its watchdog at the UI-SPEC 8000ms threshold', () => {
    expect(block).toContain('8000');
    expect(block).toContain('__strivoBooted');
  });

  it('index.html declares #browser-gate as a SIBLING of #root, before the module entry', () => {
    const rootAt = html.indexOf('id="root"');
    const gateAt = html.indexOf('id="browser-gate"');
    const guardAt = html.indexOf('browser-gate-unsupported');
    const moduleAt = html.indexOf('type="module"');
    expect(rootAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(-1);
    expect(moduleAt).toBeGreaterThan(-1);
    // Sibling, not child: React owns #root and would clear anything inside it.
    expect(gateAt).toBeGreaterThan(rootAt);
    // The classic guard must be authored BEFORE the module entry in source order.
    expect(guardAt).toBeLessThan(moduleAt);
  });

  it('OT-19: the viewport meta opts into safe areas and never disables pinch-zoom', () => {
    const content = extractViewportContent(html);
    expect(content, `No viewport meta content attribute found in ${INDEX_HTML}`).not.toBeNull();
    expect(content).toContain('viewport-fit=cover');
    // WCAG 1.4.4. Asserted against the META CONTENT only, so an explanatory comment
    // elsewhere in the file cannot fail it and, more importantly, cannot mask it.
    expect(content).not.toContain('user-scalable');
    expect(content).not.toContain('maximum-scale');
    expect(content).not.toContain('minimum-scale');
  });
});

describe('XDEV-01 boot handshake in main.tsx', () => {
  const main = read(MAIN_TSX);

  it('main.tsx sets __strivoBooted and removes #browser-gate, both AFTER createRoot', () => {
    const createRootAt = main.indexOf('createRoot(');
    const bootedAt = main.indexOf('window.__strivoBooted = true');
    const gateAt = main.indexOf('browser-gate');
    expect(createRootAt, 'createRoot call not found in src/main.tsx').toBeGreaterThan(-1);
    expect(
      bootedAt,
      'src/main.tsx must set `window.__strivoBooted = true` — without it the pre-bundle guard\'s '
        + '8000ms watchdog renders "Strivo didn\'t finish loading" on EVERY successful load.',
    ).toBeGreaterThan(-1);
    expect(
      gateAt,
      'src/main.tsx must remove the #browser-gate element after render — a guard that is never '
        + 'removed becomes a permanent overlay above a perfectly healthy app.',
    ).toBeGreaterThan(-1);
    // File order matters: signalling the boot before React has actually rendered would
    // suppress the watchdog for a render that then throws.
    expect(bootedAt).toBeGreaterThan(createRootAt);
    expect(gateAt).toBeGreaterThan(createRootAt);
  });

  it('the removal is wrapped so a DOM failure cannot break the boot', () => {
    const tail = main.slice(main.indexOf('window.__strivoBooted = true'));
    expect(tail).toContain('try {');
    expect(tail).toContain('removeChild');
  });

  it('__strivoBooted is declared on Window so type-check stays green', () => {
    const ambient = read('src/vite-env.d.ts');
    expect(ambient).toContain('__strivoBooted');
  });
});

describe('XDEV-01 static supported-browsers page', () => {
  it('exists in public/ and depends on nothing the bundle provides', () => {
    // UI-SPEC Surface A rule 1. `vercel.json`'s catch-all rewrite would otherwise serve
    // the SPA shell here — a bundle-dependent page for a bundle failure.
    expect(
      existsSync(join(REPO, STATIC_PAGE)),
      `${STATIC_PAGE} must exist as a STATIC file. It is reached exactly when the bundle could `
        + `not run, so it must never become an SPA route.`,
    ).toBe(true);
    const page = read(STATIC_PAGE);
    expect(page).not.toContain('type="module"');
    expect(page).not.toContain('/assets/');
    expect(page).not.toContain('/src/main.tsx');
    // Positive assertion so the file cannot silently become a stub.
    expect(page).toContain('Supported browsers');
    // Agrees with the 03-09 worker-floor finding (R-23): the published Firefox floor
    // stays at 114. If that verdict is ever revisited, this fails and forces the
    // published matrix and the finding to be changed together.
    expect(page).toContain('114');
  });
});
