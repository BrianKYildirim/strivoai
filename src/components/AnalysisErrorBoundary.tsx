import { Component, type ErrorInfo, type ReactNode } from "react";
import { logAnalysisError, isExtensionError, type AnalysisLifecycleStage } from "@/lib/analysis-error-log";
import {
  getClientErrorCopy,
  isClientSurfaceSuppressed,
  type ClientErrorCode,
} from "@/lib/client-error-taxonomy";
import { isStaleReloading } from "@/lib/platform/stale-bundle";

interface Props {
  children: ReactNode;
  /** Lifecycle stage tag for structured logs. Defaults to "render". */
  stage?: AnalysisLifecycleStage;
  runId?: string | null;
  resumeId?: string | null;
  /**
   * Which frozen-table code to render (UI-SPEC Surface C).
   *
   * DELIBERATELY a CODE and not a string. The previous `title` / `description`
   * props let a caller inject arbitrary user-facing text, which is the exact
   * hole XRUN-06 closes: a caller holding an `error` could pass `error.message`
   * straight through the boundary and out to the user. No caller used them.
   */
  code?: ClientErrorCode;
  /**
   * Rule 3 — one error surface at a time. When the host surface is already
   * showing a SERVER terminal state (the frozen 13-code taxonomy), the client
   * boundary must not stack a second, contradictory instruction on top of it.
   */
  serverTerminalStateShown?: boolean;
}

interface State {
  hasError: boolean;
  /** Bump to remount children after a recoverable (extension) error. */
  resetKey: number;
  /** Whether we already attempted an automatic extension recovery. */
  recoveryAttempted: boolean;
  /**
   * Whether the error currently held came from an injected extension script.
   * Set in `getDerivedStateFromError` rather than `componentDidCatch` so the
   * FIRST paint already knows, and an extension failure is never attributed to
   * Strivo's own code for even one frame.
   */
  fromExtension: boolean;
}

/**
 * Error boundary around the resume-analysis UI (Upload / Results).
 *
 * Goals:
 *  - A render-time throw anywhere in the analysis subtree — including one an
 *    injected browser-extension script triggers — must NOT black-screen the app
 *    or leak a raw stack to the user.
 *  - Extension-originated errors are ISOLATED (XDEV-08): they are reported to
 *    diagnostics with `is_extension` true and the subtree is automatically
 *    remounted once, so an unrelated extension error cannot break, block or
 *    contaminate the analysis flow. Only a genuine, repeating first-party crash
 *    surfaces the controlled fallback.
 *  - When an extension error DOES repeat past the one auto-recovery, the user
 *    still gets a controlled message — but `CLIENT_UNEXPECTED`, which is origin
 *    neutral, rather than `CLIENT_RENDER_FAILED`, which would blame Strivo's own
 *    rendering for someone else's injected script.
 *
 * ── XRUN-06 ────────────────────────────────────────────────────────────────
 * Every user-facing string here comes from `client-error-taxonomy.ts`. There is
 * no branch that renders `error.message`, `String(err)` or `error.stack`; the
 * raw text goes to structured logs and stops there. The rendered copy for
 * `CLIENT_RENDER_FAILED` is byte-identical to what shipped — only its SOURCE
 * moved into the frozen table.
 */
class AnalysisErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, resetKey: 0, recoveryAttempted: false, fromExtension: false };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { hasError: true, fromExtension: isExtensionError(error) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const fromExtension = isExtensionError(error);

    // `logAnalysisError` delegates to the shared diagnostics seam (03-06), which
    // emits `is_extension` and `script_origin` on the durable record. Only the
    // CLASSIFICATION crosses the wire; the message and stack stay on the device.
    logAnalysisError(error, {
      stage: this.props.stage ?? "render",
      runId: this.props.runId,
      resumeId: this.props.resumeId,
      tags: {
        boundary: "AnalysisErrorBoundary",
        isExtension: fromExtension,
        componentStack: (errorInfo.componentStack ?? "").split("\n").slice(0, 4).join(" | "),
      },
    });

    // Isolate extension noise: an error injected by an extension is not our
    // defect. Recover once by remounting the subtree so analysis continues.
    if (fromExtension && !this.state.recoveryAttempted) {
      this.setState((s) => ({
        hasError: false,
        recoveryAttempted: true,
        resetKey: s.resetKey + 1,
      }));
    }
  }

  private handleRetry = (): void => {
    this.setState((s) => ({ hasError: false, resetKey: s.resetKey + 1 }));
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  /**
   * Fail closed. An unrecognised situation resolves to a member of the closed
   * set, never to raw text.
   */
  private resolveCode(): ClientErrorCode {
    if (this.props.code) return this.props.code;
    return this.state.fromExtension ? "CLIENT_UNEXPECTED" : "CLIENT_RENDER_FAILED";
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // UI-SPEC E1 — DO NOT "SIMPLIFY" THIS AWAY. `stale-bundle.ts` calls
      // `preventDefault()` on `vite:preloadError`, which makes `__vitePreload`
      // resolve `undefined`; `React.lazy` then reads `undefined.default` and
      // throws a DIFFERENT error on the NEXT microtask — one that would land
      // here and paint a frame of this fallback before the reload navigation
      // commits. E1 forbids that frame, and racing the navigation is not a
      // construction, it is a hope. `isStaleReloading()` makes it deterministic.
      if (isStaleReloading()) return null;

      // Rule 3. Rendering nothing is correct here too: the surface with the
      // stronger claim (a SERVER terminal state) is already up.
      if (isClientSurfaceSuppressed({ serverTerminalStateShown: this.props.serverTerminalStateShown })) {
        return null;
      }

      const copy = getClientErrorCopy(this.resolveCode());
      const primary = copy.retryable ? copy.affordance.primary : null;
      const secondary = copy.affordance.secondary;

      return (
        <div className="min-h-[50vh] flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-foreground mb-2">{copy.heading}</h2>
            <p className="text-sm text-muted-foreground mb-6">{copy.body}</p>
            <div className="flex items-center justify-center gap-3">
              {primary && (
                <button
                  onClick={primary.kind === "reload" ? this.handleReload : this.handleRetry}
                  className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  {primary.label}
                </button>
              )}
              {secondary && (
                <button
                  onClick={secondary.kind === "retry" ? this.handleRetry : this.handleReload}
                  className="px-6 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
                >
                  {secondary.label}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // `key` forces a clean remount of the subtree after a recovery/retry.
    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }
}

export default AnalysisErrorBoundary;
