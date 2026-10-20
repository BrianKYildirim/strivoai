import { useEffect, useRef } from "react";
import { RefreshCcw } from "lucide-react";
import { getClientErrorCopy, type ClientErrorCode } from "@/lib/client-error-taxonomy";
import { getBuildId } from "@/lib/platform/build-id";
import {
  STALE_BUNDLE_URL_MARKER,
  type StaleBundleUnrecoverableReason,
} from "@/lib/platform/stale-bundle";
import { ANALYSIS_RUN_STORAGE_KEY } from "@/hooks/useAnalysisRun";

/**
 * UI-SPEC Surface E2 — the ONE visible state of stale-bundle recovery
 * (XDEV-07, D-19), plus the offline arm of XD-03.
 *
 * E1 is defined by absence: a stale chunk normally produces a single silent
 * reload and nothing on screen at all. This component renders only when
 * `src/lib/platform/stale-bundle.ts` proves recovery CANNOT work — the loop
 * guard already spent this tab's one reload on this build id, or the device is
 * offline and reloading would replace the app with the browser's own error page.
 *
 * ── IT IS RENDERED INTO `#root`, NOT BESIDE IT ──────────────────────────────
 * `src/main.tsx` renders this through the SAME React root as `<App />`. That is
 * deliberate and load-bearing twice over:
 *   1. XD-03's symptom is `#root` with ZERO children — a white screen. Rendering
 *      a sibling node would leave that symptom in place.
 *   2. Replacing the root element means React reconciles the new element from the
 *      top on its next pass, so the half-resolved `React.lazy` fiber is deleted
 *      rather than re-rendered. It is what makes "exactly one surface" true by
 *      construction instead of by timing.
 *
 * It also cannot co-appear with the pre-bundle ES5 guard (03-07, Surface A):
 * that guard's `#browser-gate` node is removed synchronously in `main.tsx`
 * immediately after `root.render()`, and a `vite:preloadError` can only come from
 * a dynamic import started during a LATER task. The gate is always already gone.
 *
 * ── COPY ────────────────────────────────────────────────────────────────────
 * Every user-facing string is read from a frozen table — the 03-12 taxonomy for
 * the heading, the offline body and the control labels, and the local `E2_COPY`
 * table below for the two sentences UI-SPEC E2 owns and the taxonomy does not.
 * There is no user-facing literal inline in the JSX, no `error.message`, and no
 * branch that can render caller-supplied text (XRUN-06).
 *
 * Semantic tokens only. React HAS rendered by the time this mounts, so tokens
 * resolve — this is NOT the ES5 guard and must not borrow its hardcoded palette.
 */

/**
 * The UI-SPEC § Surface E2 rows that have no taxonomy home, transcribed
 * character for character from
 * `.planning/phases/03-cross-device-reliability-and-compatibility/03-UI-SPEC.md`.
 *
 * NOTE on `body`: E2 states a LONGER sentence pair than the taxonomy's
 * `CLIENT_CHUNK_LOAD_FAILED` body ("Reload once more, or close this tab and open
 * strivoai.net again."). E2 adds the leading "a new version was released"
 * explanation and says "close the tab" rather than "close this tab". The spec is
 * the contract for THIS surface, so E2's wording is used verbatim here; the
 * taxonomy row remains the copy for the compact treatments elsewhere.
 */
const E2_COPY = Object.freeze({
  body:
    "A new version was released while this tab was open, and this tab couldn't load it. Reload once more, or close the tab and open strivoai.net again.",
  activeRun: "Your analysis is still running and will be here when you get back.",
  footer:
    "If this keeps happening, clear your browser cache for strivoai.net and sign in again.",
});

interface Props {
  /** Why recovery was abandoned. Selects the frozen code, never the copy itself. */
  reason?: StaleBundleUnrecoverableReason;
}

/** Which frozen code speaks. Both are existing members of the closed set of 9. */
function codeFor(reason: StaleBundleUnrecoverableReason): ClientErrorCode {
  return reason === "offline" ? "CLIENT_OFFLINE" : "CLIENT_CHUNK_LOAD_FAILED";
}

/**
 * Is a Merit-charged run still in flight? Read from the SAME key
 * `useAnalysisRun` persists (`strivio.analysis.run_id`) so the two cannot drift.
 *
 * try/catch'd because this surface is reached in exactly the browsers where a
 * bare `localStorage` read throws — a restricted-storage profile must not turn
 * the last remaining screen into a second crash.
 */
function hasActiveRun(): boolean {
  try {
    return !!window.localStorage.getItem(ANALYSIS_RUN_STORAGE_KEY);
  } catch {
    return false;
  }
}

/**
 * The cache-busting target: a HARDCODED same-origin path plus the compiled build
 * id. Neither half is read from `location`, from a query parameter or from
 * storage, so this control cannot be turned into an open redirect or a
 * `javascript:` injection by anything an attacker can influence.
 */
function cacheBustingTarget(): string {
  const params = new URLSearchParams({ [STALE_BUNDLE_URL_MARKER]: getBuildId() });
  return `/?${params.toString()}`;
}

export default function StaleBundleFallback({ reason = "loop-guard" }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = getClientErrorCopy(codeFor(reason));
  const isOffline = reason === "offline";

  useEffect(() => {
    // The document has just been replaced under the user's feet; focus must land
    // on what changed, not stay on whatever link they clicked.
    headingRef.current?.focus();
  }, []);

  const body = isOffline ? copy.body : E2_COPY.body;
  const retryLabel = copy.affordance.secondary?.label ?? "";
  const reloadLabel = copy.affordance.primary?.label ?? "";

  return (
    <div
      role="alert"
      data-testid="stale-bundle-fallback"
      className="min-h-screen min-h-[100dvh] bg-background flex items-center justify-center p-8 md:py-16"
    >
      <div className="w-full max-w-xl text-center">
        <RefreshCcw
          aria-hidden="true"
          className="mx-auto mb-6 h-6 w-6 text-destructive"
          strokeWidth={2}
        />

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-[28px] font-semibold leading-[1.2] text-foreground outline-none"
        >
          {copy.heading}
        </h1>

        <p className="mt-4 text-[16px] font-normal leading-[1.65] text-foreground">{body}</p>

        {hasActiveRun() && (
          <p className="mt-3 text-[16px] font-normal leading-[1.65] text-muted-foreground">
            {E2_COPY.activeRun}
          </p>
        )}

        <div className="mt-8 flex items-center justify-center">
          {isOffline ? (
            <button
              type="button"
              // The AUTOMATIC path never reloads while offline. This one is the
              // user explicitly asking for it, which is the same thing their
              // browser's own reload button does.
              onClick={() => window.location.reload()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 [touch-action:manipulation]"
            >
              {retryLabel}
            </button>
          ) : (
            <a
              href={cacheBustingTarget()}
              data-testid="stale-bundle-reload"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 [touch-action:manipulation]"
            >
              {reloadLabel}
            </a>
          )}
        </div>

        {!isOffline && (
          <p className="mt-6 text-sm text-muted-foreground">{E2_COPY.footer}</p>
        )}
      </div>
    </div>
  );
}
