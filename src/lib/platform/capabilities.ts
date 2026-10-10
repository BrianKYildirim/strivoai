/**
 * capabilities.ts — UI-SPEC Surface B's decision layer (XDEV-01, D-06, D-07).
 *
 * The ES5 guard in `index.html` (Surface A, plan 03-07) can only honestly cover what
 * an ES5 classic script can reach: it may not make a network request and it runs
 * before the bundle. The fine-grained questions — can this engine spawn the MODULE
 * worker the PDF pipeline is hardcoded to spawn? can it read a streamed response?
 * does it have a CSPRNG for a money-path nonce? — need the bundle. This module is
 * that second layer, and it decides ONE thing: `supported` or `degraded`.
 *
 * ── D-06: FEATURE DETECTION, NEVER UA VERSION PARSING ───────────────────────
 * The evidence is local, not theoretical: the `Map.prototype.getOrInsertComputed`
 * bug fixed on 2026-07-26 shipped in browsers that were otherwise CURRENT. A version
 * check would have called those browsers supported and shipped a white screen. There
 * is deliberately no `navigator.userAgent` read anywhere in this file.
 *
 * ── WHAT IS PROBED, AND WHY EXACTLY THIS SET ────────────────────────────────
 * Every probe below corresponds to a capability HEAD ACTUALLY USES. Verified against
 * the tree at the time of writing (plan 03-11):
 *
 *   module worker      `src/lib/extract-pdf-text.ts:30-33` spawns the extractor with
 *                      `{ type: 'module' }`, and `pdfjs-dist/build/pdf.mjs:15641`
 *                      hardcodes the same option with no configuration reaching it.
 *                      This is THE floor-setting probe (see 03-WORKER-FLOOR-FINDING).
 *   ReadableStream     `src/hooks/useResumeStream.ts:255` — `response.body.getReader()`.
 *   TextDecoder        `src/hooks/useResumeStream.ts:256` and
 *                      `src/lib/document-extraction.ts:485,499`.
 *   AbortController    `src/hooks/useAnalysisGuard.ts`, `src/hooks/useIdempotencyKey.ts`.
 *   crypto CSPRNG      six money-path `crypto.randomUUID()` call sites (XD-16), now
 *                      polyfilled over `crypto.getRandomValues` by plan 03-09.
 *   localStorage       session persistence, via plan 03-08's `probeLocalStorage()`.
 *
 * And, just as important, what is NOT probed:
 *
 *   structuredClone    `rg` reports ZERO occurrences in `src/`, `e2e/`, `supabase/`
 *                      and `index.html`. Probing it would report a capability the app
 *                      does not use and produce a false `degraded` verdict — a paying
 *                      user locked out of a product that would have worked. Recorded
 *                      as the verdict of 03-WORKER-FLOOR-FINDING.md (residual R-23).
 *   TextDecoderStream  zero occurrences. `useResumeStream` decodes chunks itself.
 *   EventSource        zero occurrences. The stream is a `fetch` body, not SSE.
 *   WebSocket          present as an INFORMATIONAL probe only. Realtime failure is
 *                      network-shaped and already degrades to polling (XRUN-04), so
 *                      blocking on it would be a lie.
 *
 * ── FAIL DIRECTION (money-path posture) ─────────────────────────────────────
 * A false `degraded` is more expensive than the defect it prevents: it locks a paying
 * user out of the thing they bought. So every probe FAILS OPEN on ambiguity — if a
 * probe itself throws, the capability is treated as PRESENT. A probe only reports
 * absence when it positively observed absence. `supportsModuleWorker()` is the one
 * probe whose verdict is definitive in both directions, and the reason is spelled out
 * at its definition.
 *
 * ── TIERS ───────────────────────────────────────────────────────────────────
 * `unbootable` is NOT produced here and never can be: if the app is unbootable this
 * module never evaluates. Surface A owns that tier in its entirety (UI-SPEC § Surface
 * B tier table). This module returns only `supported | degraded`, which is exactly the
 * `capability_tier` vocabulary of `client_error_diagnostics`.
 */

// The barrel is imported for its side effects so the probes below run AFTER install
// (D-09). `crypto.randomUUID` and `Map.prototype.getOrInsertComputed` are therefore
// TRIPWIRES — "did the polyfill land?" — not gates on the native API. Importing the
// barrel here rather than relying on `main.tsx` having done it first means the probe
// order holds for every caller, including a unit test and a future realm entry.
import '../polyfills';

import { reportDiagnostic } from '../diagnostics/client-diagnostics';
import { probeLocalStorage } from './storage-probe';
import {
  AI_CAPABILITY_AREA_IDS,
  CAPABILITY_AREA_LABELS,
  CAPABILITY_REASON_COPY,
  type CapabilityAreaId,
} from './capability-copy';

// ── Types ────────────────────────────────────────────────────────────────────

/** The two tiers this module can produce. `unbootable` belongs to Surface A. */
export type CapabilityTier = 'supported' | 'degraded';

/** What a failing group takes away. An empty list means "informational only". */
export type BlockedSurface = 'ai' | 'checkout';

export type CapabilityGroupId =
  | 'documentExtraction'
  | 'streaming'
  | 'idempotency'
  | 'paymentEmbedding'
  | 'persistentSession'
  | 'realtime';

export interface CapabilityGroupSpec {
  /** Which money paths this group gates. `[]` ⇒ recorded, never blocking. */
  readonly blocks: readonly BlockedSurface[];
  /** The B4 sentence used when this group is the reason an area is unavailable. */
  readonly reason: string;
  /** Positive-presence probe. `true` ⇒ capability present. Never throws. */
  readonly probe: () => boolean;
}

/** One entry of the plain-language list B4 renders. */
export interface BlockedArea {
  readonly id: CapabilityAreaId;
  readonly label: string;
  readonly reason: string;
}

// ── Probe helpers ────────────────────────────────────────────────────────────

/**
 * Run a probe and FAIL OPEN. An exception inside a probe means "we could not tell",
 * and "we could not tell" must never become "your browser is blocked".
 */
function safeProbe(probe: () => boolean): boolean {
  try {
    return probe() === true;
  } catch {
    return true;
  }
}

function isFn(value: unknown): boolean {
  return typeof value === 'function';
}

let cachedModuleWorker: boolean | undefined;

/**
 * Does this engine understand `new Worker(url, { type: 'module' })`?
 *
 * THE TECHNIQUE: `WorkerOptions` is a WebIDL dictionary, and WebIDL converts the
 * argument list BEFORE the constructor's own steps run. An engine whose
 * `WorkerOptions` declares a `type` member therefore READS our getter; an engine
 * predating module workers never declares the member and never reads it. So the
 * getter firing IS the answer, and it is available even when construction then throws
 * — which it does on engines that refuse `data:` worker URLs, and under a strict
 * `worker-src` CSP. That is why the verdict is read off the recorded flag and not off
 * whether the constructor succeeded.
 *
 * This is the only probe here that is definitive in the negative direction, and that
 * is deliberate: it is the constraint that actually binds the published floor
 * (Firefox 114 — see `03-WORKER-FLOOR-FINDING.md`, residual R-23).
 *
 * Side effects are bounded: at most one worker per page session, terminated
 * immediately, memoized so a render loop cannot spawn a second one.
 */
export function supportsModuleWorker(): boolean {
  if (cachedModuleWorker !== undefined) return cachedModuleWorker;

  if (typeof Worker !== 'function') {
    cachedModuleWorker = false;
    return cachedModuleWorker;
  }

  let typeWasRead = false;
  let spawned: Worker | undefined;

  try {
    const options = {
      get type(): 'module' {
        typeWasRead = true;
        return 'module';
      },
    } as WorkerOptions;
    spawned = new Worker('data:,', options);
  } catch {
    // Expected on engines that reject `data:` worker URLs and under a strict CSP.
    // `typeWasRead` has already been decided by then — see the note above.
  } finally {
    try {
      spawned?.terminate();
    } catch {
      /* a probe must not leave an exception behind */
    }
  }

  cachedModuleWorker = typeWasRead;
  return cachedModuleWorker;
}

// ── The group map ────────────────────────────────────────────────────────────

/**
 * The frozen capability-group map. EXHAUSTIVELY table-tested in
 * `capabilities.test.ts`, in the shape of `ANALYSIS_ERROR_CODES`, so a group cannot
 * be added, removed or re-pointed without the test being updated deliberately.
 */
export const CAPABILITY_GROUPS: Readonly<Record<CapabilityGroupId, CapabilityGroupSpec>> =
  Object.freeze({
    /** Reading the user's resume / LinkedIn PDF. Blocks every AI flow. */
    documentExtraction: Object.freeze({
      blocks: Object.freeze(['ai'] as const),
      reason: CAPABILITY_REASON_COPY.documentExtraction,
      probe: (): boolean =>
        // `typeof` and not a bare reference: `delete window.Worker` leaves the
        // global BINDING absent, and a bare `Worker` would then throw ReferenceError.
        typeof Worker === 'function' &&
        supportsModuleWorker() &&
        // Post-polyfill tripwire, NOT a native-API gate (D-09).
        isFn((Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed),
    }),

    /** Receiving the analysis as it is written. Blocks every AI flow. */
    streaming: Object.freeze({
      blocks: Object.freeze(['ai'] as const),
      reason: CAPABILITY_REASON_COPY.streaming,
      probe: (): boolean =>
        typeof ReadableStream === 'function' &&
        isFn(ReadableStream.prototype?.getReader) &&
        typeof TextDecoder === 'function' &&
        typeof AbortController === 'function',
    }),

    /** One click ⇒ one run ⇒ one charge. Blocks AI flows AND checkout (XRUN-01). */
    idempotency: Object.freeze({
      blocks: Object.freeze(['ai', 'checkout'] as const),
      reason: CAPABILITY_REASON_COPY.idempotency,
      probe: (): boolean => {
        const c = globalThis.crypto as Crypto | undefined;
        // getRandomValues is what 03-09's polyfill builds the UUID from, so it is the
        // real requirement; randomUUID is then a tripwire on the polyfill landing.
        return !!c && isFn(c.getRandomValues) && isFn(c.randomUUID);
      },
    }),

    /**
     * Embedding a payment form. Blocks CHECKOUT ONLY — never an AI flow.
     * A non-secure context is the one honest synchronous signal available: our
     * payment provider will not mount a payment form on an insecure origin. The
     * asynchronous half of this capability (does the provider script actually
     * resolve?) is measured at the call site, because the ES5 guard is forbidden
     * from making network requests and this module keeps the same posture.
     */
    paymentEmbedding: Object.freeze({
      blocks: Object.freeze(['checkout'] as const),
      reason: CAPABILITY_REASON_COPY.paymentEmbedding,
      probe: (): boolean =>
        typeof window === 'undefined' || window.isSecureContext !== false,
    }),

    /**
     * Session persistence. INFORMATIONAL — blocks NOTHING.
     * Plan 03-08 removed the Supabase auth `storage:` override precisely so that
     * `@supabase/auth-js` runs its own restricted-storage fallback; restricted
     * storage is a "you will be signed out when you close this tab" warning, not a
     * reason to take a paying user's analysis away.
     */
    persistentSession: Object.freeze({
      blocks: Object.freeze([] as const),
      reason: CAPABILITY_REASON_COPY.persistentSession,
      probe: (): boolean => probeLocalStorage('app-shell') === 'available',
    }),

    /**
     * Live updates. INFORMATIONAL — blocks NOTHING.
     * Realtime failure is network-shaped and `useAnalysisRun` already degrades to
     * polling (XRUN-04, `CLIENT_REALTIME_DEGRADED`). Blocking here would turn a
     * recovered condition into a wall.
     */
    realtime: Object.freeze({
      blocks: Object.freeze([] as const),
      reason: CAPABILITY_REASON_COPY.realtime,
      probe: (): boolean => typeof WebSocket === 'function',
    }),
  });

/** Stable evaluation order — also the order B4 picks a reason in. */
export const CAPABILITY_GROUP_IDS = Object.freeze(
  Object.keys(CAPABILITY_GROUPS) as CapabilityGroupId[],
);

// ── Resolution (memoized per page session) ───────────────────────────────────

let cachedFailures: readonly CapabilityGroupId[] | undefined;
let hasReported = false;

/** The group ids whose probe reported absence. Memoized for the page session. */
export function getFailingCapabilityGroups(): readonly CapabilityGroupId[] {
  if (cachedFailures !== undefined) return cachedFailures;

  const failures: CapabilityGroupId[] = [];
  for (const id of CAPABILITY_GROUP_IDS) {
    if (!safeProbe(CAPABILITY_GROUPS[id].probe)) failures.push(id);
  }
  cachedFailures = Object.freeze(failures);
  return cachedFailures;
}

function blockingFailures(surface: BlockedSurface): readonly CapabilityGroupId[] {
  return getFailingCapabilityGroups().filter((id) =>
    CAPABILITY_GROUPS[id].blocks.includes(surface),
  );
}

/**
 * The tier. `degraded` when ANY group that gates a money path failed; `supported`
 * otherwise. An informational group failing can never change this value.
 *
 * Reports `capability_blocked` through plan 03-06's fire-and-forget seam ONCE per
 * page session, carrying group names only — never probe internals, never an API name.
 */
export function resolveCapabilityTier(): CapabilityTier {
  const blocking = getFailingCapabilityGroups().filter(
    (id) => CAPABILITY_GROUPS[id].blocks.length > 0,
  );
  const tier: CapabilityTier = blocking.length > 0 ? 'degraded' : 'supported';

  if (tier === 'degraded' && !hasReported) {
    hasReported = true;
    try {
      reportDiagnostic({
        surface: 'app-shell',
        stage: 'capability-gate',
        category: 'capability_blocked',
        capabilityTier: tier,
      });
    } catch {
      /* a diagnostics failure must never become the user's failure */
    }
  }

  return tier;
}

/** True when starting a new AI analysis must be blocked before any network call. */
export function isAiBlocked(): boolean {
  return blockingFailures('ai').length > 0;
}

/**
 * True when checkout must be blocked before any session or PaymentIntent is created.
 * The synchronous half only — the payment-provider script signal is folded in by
 * `useCheckoutCapability()`.
 */
export function isCheckoutBlocked(): boolean {
  return blockingFailures('checkout').length > 0;
}

/**
 * The plain-language list B4 renders. Contains NO API name, NO probe name and NO
 * version string — see the header note in `capability-copy.ts` and the forbidden-list
 * assertion in `capabilities.test.ts`.
 *
 * @param checkoutBlocked pass `true` to include checkout when the ASYNCHRONOUS
 *        payment-provider signal failed even though the synchronous probes passed.
 */
export function getBlockedAreas(checkoutBlocked = false): readonly BlockedArea[] {
  const failures = getFailingCapabilityGroups();
  const areas: BlockedArea[] = [];

  const firstReason = (surface: BlockedSurface): string | undefined => {
    const id = failures.find((groupId) =>
      CAPABILITY_GROUPS[groupId].blocks.includes(surface),
    );
    return id ? CAPABILITY_GROUPS[id].reason : undefined;
  };

  const aiReason = firstReason('ai');
  if (aiReason) {
    for (const id of AI_CAPABILITY_AREA_IDS) {
      areas.push({ id, label: CAPABILITY_AREA_LABELS[id], reason: aiReason });
    }
  }

  const checkoutReason =
    firstReason('checkout') ??
    (checkoutBlocked ? CAPABILITY_GROUPS.paymentEmbedding.reason : undefined);
  if (checkoutReason) {
    areas.push({
      id: 'checkout',
      label: CAPABILITY_AREA_LABELS.checkout,
      reason: checkoutReason,
    });
  }

  if (failures.includes('persistentSession')) {
    areas.push({
      id: 'saved-sign-in',
      label: CAPABILITY_AREA_LABELS['saved-sign-in'],
      reason: CAPABILITY_GROUPS.persistentSession.reason,
    });
  }

  return Object.freeze(areas);
}

/** Test-only: clears every memo and the once-per-session report latch. */
export function resetCapabilitiesForTests(): void {
  cachedModuleWorker = undefined;
  cachedFailures = undefined;
  hasReported = false;
}
