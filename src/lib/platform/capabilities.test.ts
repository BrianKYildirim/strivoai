/**
 * capabilities.test.ts — the guard on UI-SPEC Surface B's decision layer.
 *
 * THE TWO FAILURES THIS FILE EXISTS TO PREVENT, in order of cost:
 *
 *   1. A FALSE `degraded`. An over-eager probe locks a paying user out of the
 *      product they bought. So the exhaustive group table is asserted (a new probe
 *      cannot be smuggled in), every probe is asserted to FAIL OPEN when it throws,
 *      and the informational groups are asserted to be incapable of changing the
 *      tier no matter how they fail.
 *   2. A FALSE `supported`. The user pays Merits, the run starts, extraction dies in
 *      the worker, and the ledger holds a charge with no result. So the module-worker
 *      probe is exercised as a real BEHAVIOURAL probe against a stubbed `Worker`
 *      constructor rather than assumed, in all four of its shapes.
 *
 * Plus the disclosure guard: nothing the user can read may name an API, a probe or a
 * version, because a capability report that enumerates exact API availability is a
 * fingerprinting vector.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  CAPABILITY_GROUPS,
  CAPABILITY_GROUP_IDS,
  getBlockedAreas,
  getFailingCapabilityGroups,
  isAiBlocked,
  isCheckoutBlocked,
  resetCapabilitiesForTests,
  resolveCapabilityTier,
  supportsModuleWorker,
  type CapabilityGroupId,
} from './capabilities';
import {
  CAPABILITY_AREA_LABELS,
  CAPABILITY_COPY,
  CAPABILITY_REASON_COPY,
} from './capability-copy';
import { reportDiagnostic } from '../diagnostics/client-diagnostics';
import { resetStorageProbeForTests } from './storage-probe';

vi.mock('../diagnostics/client-diagnostics', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../diagnostics/client-diagnostics')>();
  return { ...actual, reportDiagnostic: vi.fn() };
});

const reportDiagnosticMock = reportDiagnostic as unknown as Mock;

// ── Global stubbing helpers ──────────────────────────────────────────────────

type Restore = () => void;
const restores: Restore[] = [];

/**
 * Replace a global for the duration of one test. `configurable: true` on the way in
 * and an exact descriptor restore on the way out, so nothing leaks into the next
 * file — a leaked missing `ReadableStream` would turn an unrelated suite red for a
 * reason nobody could find.
 */
function stubGlobal(name: string, value: unknown): void {
  const target = globalThis as unknown as Record<string, unknown>;
  const original = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value,
  });
  restores.push(() => {
    if (original) Object.defineProperty(target, name, original);
    else delete target[name];
  });
}

/**
 * Force `window.isSecureContext`. jsdom does not define it at all, which is itself
 * worth knowing: the probe reads `!== false`, so an ABSENT flag is treated as secure —
 * the fail-open direction. Only an explicit `false` blocks.
 */
function stubSecureContext(value: boolean): void {
  const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    get: () => value,
  });
  restores.push(() => {
    if (original) Object.defineProperty(window, 'isSecureContext', original);
    else delete (window as unknown as Record<string, unknown>).isSecureContext;
  });
}

/** Remove a global entirely (the `delete window.X` case the E2E spec also uses). */
function removeGlobal(name: string): void {
  stubGlobal(name, undefined);
  const target = globalThis as unknown as Record<string, unknown>;
  delete target[name];
}

/**
 * A `Worker` constructor stub.
 *
 * @param readsType  whether the engine being simulated declares `type` in its
 *                   `WorkerOptions` dictionary (i.e. understands module workers)
 * @param throws     whether construction then throws (a `data:` refusal or a CSP)
 */
function stubWorker(readsType: boolean, throws = false): { terminated: () => number } {
  let terminated = 0;
  class FakeWorker {
    constructor(_url: string, options?: WorkerOptions) {
      // Reading the option is what a module-worker-aware engine does; not reading it
      // is what every engine predating module workers does.
      if (readsType) void options?.type;
      if (throws) throw new DOMException('refused', 'SecurityError');
    }
    terminate(): void {
      terminated += 1;
    }
  }
  stubGlobal('Worker', FakeWorker);
  return { terminated: () => terminated };
}

beforeEach(() => {
  resetCapabilitiesForTests();
  resetStorageProbeForTests();
  reportDiagnosticMock.mockClear();
});

afterEach(() => {
  while (restores.length) restores.pop()?.();
  resetCapabilitiesForTests();
  resetStorageProbeForTests();
});

// ── supportsModuleWorker ─────────────────────────────────────────────────────

describe('supportsModuleWorker', () => {
  it('is TRUE when the constructor reads the `type` option', () => {
    stubWorker(true);
    expect(supportsModuleWorker()).toBe(true);
  });

  it('is FALSE when the constructor never reads the `type` option', () => {
    stubWorker(false);
    expect(supportsModuleWorker()).toBe(false);
  });

  it('is FALSE when `Worker` is absent entirely', () => {
    removeGlobal('Worker');
    expect(supportsModuleWorker()).toBe(false);
  });

  it('does not throw when the constructor throws, and still answers from the flag', () => {
    // The `data:` refusal / strict-CSP case. WebIDL converts the argument list before
    // the constructor body runs, so the getter has already fired by the time it throws.
    stubWorker(true, true);
    expect(() => supportsModuleWorker()).not.toThrow();
    expect(supportsModuleWorker()).toBe(true);
  });

  it('reports FALSE when the constructor throws WITHOUT having read `type`', () => {
    stubWorker(false, true);
    expect(supportsModuleWorker()).toBe(false);
  });

  it('terminates the probe worker and memoizes, so a render loop cannot spawn more', () => {
    const worker = stubWorker(true);
    expect(supportsModuleWorker()).toBe(true);
    expect(supportsModuleWorker()).toBe(true);
    expect(supportsModuleWorker()).toBe(true);
    expect(worker.terminated()).toBe(1);
  });
});

// ── The exhaustive group table ───────────────────────────────────────────────

describe('CAPABILITY_GROUPS', () => {
  /**
   * The EXHAUSTIVE table, in the shape of `ANALYSIS_ERROR_CODES`. A new group cannot
   * be added — and an existing group cannot be re-pointed at a different money path —
   * without this literal being edited deliberately.
   */
  const EXPECTED: Record<CapabilityGroupId, readonly string[]> = {
    documentExtraction: ['ai'],
    streaming: ['ai'],
    idempotency: ['ai', 'checkout'],
    paymentEmbedding: ['checkout'],
    persistentSession: [],
    realtime: [],
  };

  it('contains exactly the expected groups — no more, no fewer', () => {
    expect([...CAPABILITY_GROUP_IDS].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.keys(EXPECTED) as CapabilityGroupId[])(
    '%s blocks exactly the expected areas',
    (id) => {
      expect([...CAPABILITY_GROUPS[id].blocks]).toEqual(EXPECTED[id]);
    },
  );

  it('gives every group a non-empty B4 reason sentence', () => {
    for (const id of CAPABILITY_GROUP_IDS) {
      expect(CAPABILITY_GROUPS[id].reason.length).toBeGreaterThan(0);
    }
  });

  it('is frozen, so a call site cannot re-point a probe at runtime', () => {
    expect(Object.isFrozen(CAPABILITY_GROUPS)).toBe(true);
  });
});

// ── D-06: feature detection, never UA parsing ────────────────────────────────

describe('D-06 — no user-agent parsing anywhere in the decision layer', () => {
  it('never reads navigator.userAgent while resolving a tier', () => {
    const spy = vi.spyOn(navigator, 'userAgent', 'get');
    stubWorker(true);
    resolveCapabilityTier();
    getBlockedAreas();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Tier resolution ──────────────────────────────────────────────────────────

describe('resolveCapabilityTier', () => {
  it('is `supported` when every probe passes', () => {
    stubWorker(true);
    expect(getFailingCapabilityGroups()).toEqual([]);
    expect(resolveCapabilityTier()).toBe('supported');
    expect(isAiBlocked()).toBe(false);
    expect(isCheckoutBlocked()).toBe(false);
  });

  it('is `degraded` when the module-worker probe fails in isolation', () => {
    stubWorker(false);
    expect(resolveCapabilityTier()).toBe('degraded');
    expect(isAiBlocked()).toBe(true);
    // documentExtraction gates AI only — checkout must stay open.
    expect(isCheckoutBlocked()).toBe(false);
  });

  it('is `degraded` when `Worker` is absent in isolation', () => {
    removeGlobal('Worker');
    expect(resolveCapabilityTier()).toBe('degraded');
    expect(isAiBlocked()).toBe(true);
  });

  it('is `degraded` when the streaming probe fails in isolation', () => {
    stubWorker(true);
    removeGlobal('ReadableStream');
    expect(resolveCapabilityTier()).toBe('degraded');
    expect(isAiBlocked()).toBe(true);
    expect(isCheckoutBlocked()).toBe(false);
  });

  it('is `degraded` when the idempotency probe fails in isolation, blocking BOTH paths', () => {
    stubWorker(true);
    stubGlobal('crypto', { getRandomValues: undefined, randomUUID: undefined });
    expect(resolveCapabilityTier()).toBe('degraded');
    expect(isAiBlocked()).toBe(true);
    expect(isCheckoutBlocked()).toBe(true);
  });

  it('is `degraded` for an insecure context, blocking CHECKOUT ONLY', () => {
    stubWorker(true);
    stubSecureContext(false);
    expect(resolveCapabilityTier()).toBe('degraded');
    expect(isCheckoutBlocked()).toBe(true);
    // The money-path caution: a plain http origin must not take AI away too.
    expect(isAiBlocked()).toBe(false);
  });

  it('treats an ABSENT isSecureContext as secure (fail open)', () => {
    stubWorker(true);
    expect(
      Object.getOwnPropertyDescriptor(window, 'isSecureContext'),
    ).toBeUndefined();
    expect(isCheckoutBlocked()).toBe(false);
    expect(resolveCapabilityTier()).toBe('supported');
  });

  it('memoizes the probe result for the page session', () => {
    const worker = stubWorker(true);
    expect(resolveCapabilityTier()).toBe('supported');
    // Break the world AFTER the first resolution; the memo must hold.
    removeGlobal('Worker');
    expect(resolveCapabilityTier()).toBe('supported');
    expect(worker.terminated()).toBe(1);
  });

  it('reports `capability_blocked` exactly once, with the tier and no probe internals', () => {
    stubWorker(false);
    resolveCapabilityTier();
    resolveCapabilityTier();
    resolveCapabilityTier();
    expect(reportDiagnosticMock).toHaveBeenCalledTimes(1);
    expect(reportDiagnosticMock).toHaveBeenCalledWith({
      surface: 'app-shell',
      stage: 'capability-gate',
      category: 'capability_blocked',
      capabilityTier: 'degraded',
    });
  });

  it('reports nothing at all on a supported browser (D-13 — failures only)', () => {
    stubWorker(true);
    expect(resolveCapabilityTier()).toBe('supported');
    expect(reportDiagnosticMock).not.toHaveBeenCalled();
  });
});

// ── The informational groups can never block ─────────────────────────────────

describe('informational groups never change the tier', () => {
  it('a failing realtime probe does NOT degrade the tier', () => {
    stubWorker(true);
    removeGlobal('WebSocket');
    expect(getFailingCapabilityGroups()).toContain('realtime');
    expect(resolveCapabilityTier()).toBe('supported');
    expect(isAiBlocked()).toBe(false);
    expect(isCheckoutBlocked()).toBe(false);
  });

  it('blocked storage does NOT degrade the tier (03-08 — auth-js has its own fallback)', () => {
    stubWorker(true);
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    try {
      expect(getFailingCapabilityGroups()).toContain('persistentSession');
      expect(resolveCapabilityTier()).toBe('supported');
      expect(isAiBlocked()).toBe(false);
      expect(isCheckoutBlocked()).toBe(false);
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});

// ── Fail-open posture ────────────────────────────────────────────────────────

describe('a probe that throws FAILS OPEN', () => {
  it('treats an exploding probe as "capability present", never as a block', () => {
    stubWorker(true);
    // A hostile extension that booby-traps a global is the realistic shape here: the
    // object is present, and only explodes when the probe reaches into it.
    stubGlobal('crypto', {
      get getRandomValues(): never {
        throw new Error('hostile');
      },
    });
    expect(getFailingCapabilityGroups()).not.toContain('idempotency');
    expect(resolveCapabilityTier()).toBe('supported');
    expect(isAiBlocked()).toBe(false);
    expect(isCheckoutBlocked()).toBe(false);
  });
});

// ── B4 disclosure guard ──────────────────────────────────────────────────────

describe('getBlockedAreas', () => {
  /** Nothing a user can read may contain any of these (UI-SPEC B4). */
  const FORBIDDEN = [
    'Worker',
    'structuredClone',
    'ReadableStream',
    'randomUUID',
    'localStorage',
    'TextDecoder',
    'AbortController',
    'WebSocket',
    'isSecureContext',
    'getOrInsertComputed',
    'documentExtraction',
    'idempotency',
    'paymentEmbedding',
    'persistentSession',
  ];
  const VERSION_LIKE = /\b\d+(\.\d+)*\b/;

  function allUserFacingStrings(): string[] {
    return [
      ...getBlockedAreas(true).flatMap((area) => [area.label, area.reason]),
      ...Object.values(CAPABILITY_COPY),
      ...Object.values(CAPABILITY_AREA_LABELS),
      ...Object.values(CAPABILITY_REASON_COPY),
    ];
  }

  it('lists every AI area plus checkout when everything is blocked', () => {
    stubWorker(false);
    stubGlobal('crypto', { getRandomValues: undefined, randomUUID: undefined });
    const ids = getBlockedAreas().map((a) => a.id);
    expect(ids).toEqual([
      'resume-analysis',
      'linkedin-grader',
      'career-compass',
      'recruiting-lens',
      'interview-prep',
      'checkout',
    ]);
  });

  it('lists nothing when every probe passes', () => {
    stubWorker(true);
    expect(getBlockedAreas()).toEqual([]);
  });

  it('lists checkout alone for an insecure context — the AI areas stay off the list', () => {
    stubWorker(true);
    stubSecureContext(false);
    expect(getBlockedAreas().map((a) => a.id)).toEqual(['checkout']);
  });

  it('adds checkout when only the ASYNCHRONOUS payment-provider signal failed', () => {
    stubWorker(true);
    expect(getBlockedAreas(true).map((a) => a.id)).toEqual(['checkout']);
  });

  it('names no API, no probe and no version in anything the user can read', () => {
    stubWorker(false);
    stubGlobal('crypto', { getRandomValues: undefined, randomUUID: undefined });
    const strings = allUserFacingStrings();
    expect(strings.length).toBeGreaterThan(0);

    for (const text of strings) {
      for (const banned of FORBIDDEN) {
        expect(
          text.includes(banned),
          `user-facing copy leaks the implementation detail "${banned}"`,
        ).toBe(false);
      }
      expect(
        VERSION_LIKE.test(text),
        `user-facing copy contains a version-like number: "${text}"`,
      ).toBe(false);
    }
  });
});

// ── The copy table matches UI-SPEC § Surface B character for character ───────

describe('CAPABILITY_COPY is the UI-SPEC contract', () => {
  it('carries the B1–B4 strings verbatim', () => {
    expect(CAPABILITY_COPY.bannerBody).toBe(
      'Some Strivo features are turned off in this browser.',
    );
    expect(CAPABILITY_COPY.bannerLink).toBe("See what's affected");
    expect(CAPABILITY_COPY.analysisHeading).toBe(
      "Analysis isn't available in this browser",
    );
    expect(CAPABILITY_COPY.analysisBody).toBe(
      'This browser is missing features Strivo needs to run an analysis. Update your browser, or open Strivo in the current Chrome, Safari, Firefox or Edge. Your saved results are still available here.',
    );
    expect(CAPABILITY_COPY.checkoutHeading).toBe(
      "Checkout isn't available in this browser",
    );
    expect(CAPABILITY_COPY.checkoutBody).toBe(
      'This browser is missing features our payment provider requires. Update your browser, or open Strivo in the current Chrome, Safari, Firefox or Edge to change your plan. Your current plan is unchanged.',
    );
    expect(CAPABILITY_COPY.supportedBrowsersAction).toBe('See supported browsers');
    expect(CAPABILITY_COPY.detailTitle).toBe("What's affected in this browser");
    expect(CAPABILITY_COPY.detailIntro).toBe(
      'Strivo checked what this browser supports. These areas need a newer browser:',
    );
    expect(CAPABILITY_COPY.detailFooter).toBe(
      'Everything else, including your account, your saved results and your billing, works normally.',
    );
    expect(CAPABILITY_COPY.detailClose).toBe('Close');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(CAPABILITY_COPY)).toBe(true);
  });
});
