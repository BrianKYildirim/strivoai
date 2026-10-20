/**
 * capability-copy.ts — the SINGLE frozen copy table for UI-SPEC Surface B.
 *
 * WHY A SEPARATE MODULE: UI-SPEC § Downstream Obligations requires that no
 * user-facing string literal lives inside a Phase-3 component body. `CapabilityGate.tsx`
 * therefore renders only values read from here, and `capabilities.ts` composes the
 * B4 area list from here rather than inventing prose at the probe site.
 *
 * ── WHAT MAY NEVER APPEAR IN THIS FILE (XRUN-06 + UI-SPEC B4) ────────────────
 * No API name (`Worker`, `ReadableStream`, `randomUUID`, `localStorage`, …), no
 * probe name, no version string and no browser-version number. A capability report
 * that enumerates exact API availability is a fingerprinting vector and leaks
 * implementation detail into user-facing copy; `capabilities.test.ts` asserts the
 * absence of a forbidden list against every string produced from this table.
 *
 * Every string below is transcribed CHARACTER FOR CHARACTER from
 * `.planning/phases/03-cross-device-reliability-and-compatibility/03-UI-SPEC.md`
 * § Surface B. Do not "improve" the wording here — the spec is the contract.
 */

/** The areas B4 can list. Ids only — the prose lives in the tables below. */
export const CAPABILITY_AREA_IDS = Object.freeze([
  'resume-analysis',
  'linkedin-grader',
  'career-compass',
  'recruiting-lens',
  'interview-prep',
  'checkout',
  'saved-sign-in',
] as const);

export type CapabilityAreaId = (typeof CAPABILITY_AREA_IDS)[number];

/** The five AI areas, in the order B4 lists them. */
export const AI_CAPABILITY_AREA_IDS = Object.freeze([
  'resume-analysis',
  'linkedin-grader',
  'career-compass',
  'recruiting-lens',
  'interview-prep',
] as const);

/** `{Area}` in UI-SPEC B4's `{Area} — {one plain sentence}` shape. */
export const CAPABILITY_AREA_LABELS: Readonly<Record<CapabilityAreaId, string>> =
  Object.freeze({
    'resume-analysis': 'Resume Analysis',
    'linkedin-grader': 'LinkedIn Grader',
    'career-compass': 'Career Compass',
    'recruiting-lens': 'Recruiting Lens',
    'interview-prep': 'Interview Prep',
    checkout: 'Checkout',
    'saved-sign-in': 'Staying signed in',
  });

/**
 * `{one plain sentence}` in UI-SPEC B4's shape, keyed by the capability group that
 * failed rather than by area — the same missing capability produces the same honest
 * sentence on every feature that depends on it.
 */
export const CAPABILITY_REASON_COPY = Object.freeze({
  documentExtraction: "this browser can't read documents the way Strivo needs.",
  streaming: "this browser can't receive your results as they're written.",
  idempotency: "this browser can't safely start a new analysis.",
  paymentEmbedding: "this browser can't show a secure payment form.",
  persistentSession: "this browser can't remember you after you close this tab.",
  // Never rendered today: the realtime group is informational and therefore never
  // reaches B4. Present so the group map has no reason-less member, which would make
  // "add a group, forget its copy" a silent `undefined` in the dialog.
  realtime: "this browser can't receive live updates, so Strivo checks for you instead.",
} as const);

/** The B1–B4 strings, verbatim from UI-SPEC § Surface B. */
export const CAPABILITY_COPY = Object.freeze({
  /** B1 — session banner. */
  bannerBody: 'Some Strivo features are turned off in this browser.',
  bannerLink: "See what's affected",
  bannerDismissLabel: 'Dismiss',

  /** B2 — blocked AI entry point. */
  analysisHeading: "Analysis isn't available in this browser",
  analysisBody:
    'This browser is missing features Strivo needs to run an analysis. Update your browser, or open Strivo in the current Chrome, Safari, Firefox or Edge. Your saved results are still available here.',

  /** B3 — blocked checkout entry point. */
  checkoutHeading: "Checkout isn't available in this browser",
  checkoutBody:
    'This browser is missing features our payment provider requires. Update your browser, or open Strivo in the current Chrome, Safari, Firefox or Edge to change your plan. Your current plan is unchanged.',

  /** Shared secondary action (UI-SPEC § Copywriting Contract). */
  supportedBrowsersAction: 'See supported browsers',

  /** B4 — capability detail dialog. */
  detailTitle: "What's affected in this browser",
  detailIntro:
    'Strivo checked what this browser supports. These areas need a newer browser:',
  detailFooter:
    'Everything else, including your account, your saved results and your billing, works normally.',
  detailClose: 'Close',
} as const);

/** The static file Surface A also links to. Never an SPA route. */
export const SUPPORTED_BROWSERS_HREF = '/supported-browsers.html';
