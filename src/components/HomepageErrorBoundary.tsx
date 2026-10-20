import { Component, type ErrorInfo, type ReactNode } from "react";
import { isExtensionError, classifyScriptOrigin } from "@/lib/analysis-error-log";
import { reportDiagnostic } from "@/lib/diagnostics/client-diagnostics";
import {
  getClientErrorCopy,
  isClientSurfaceSuppressed,
  type ClientErrorCode,
} from "@/lib/client-error-taxonomy";
import { isStaleReloading } from "@/lib/platform/stale-bundle";

interface Props {
  children: ReactNode;
  /**
   * Which frozen-table code to render (UI-SPEC Surface C). A CODE, never a
   * string — see the note on `AnalysisErrorBoundary`.
   */
  code?: ClientErrorCode;
  /** Rule 3 — one error surface at a time; server terminal state wins. */
  serverTerminalStateShown?: boolean;
}

interface State {
  hasError: boolean;
  /** Whether the error currently held came from an injected extension script. */
  fromExtension: boolean;
}

/**
 * Error boundary around the marketing surface (`src/pages/Index.tsx`).
 *
 * Same two guarantees as `AnalysisErrorBoundary`, on the surface a first-time
 * visitor sees:
 *  - XRUN-06. The copy comes from `client-error-taxonomy.ts`. Nothing here
 *    renders `error.message`, `String(err)` or a stack. The previous inline
 *    strings were also a UI-SPEC § Forbidden copy violation — a bare
 *    "Something went wrong" heading with no statement of what the user can do.
 *  - XDEV-08. An extension-injected throw is CLASSIFIED and reported to the
 *    shared diagnostics seam with `is_extension` true, so it can be told apart
 *    from a real first-party defect in the `client_error_diagnostics` table
 *    instead of being counted as a Strivo homepage crash. It is never blamed on
 *    Strivo in the copy either: `CLIENT_UNEXPECTED` is origin neutral.
 *
 * There is no auto-recovery here, deliberately. The analysis boundary remounts
 * once because abandoning an in-flight analysis is expensive; the landing page
 * has nothing in flight, and a silent remount loop on a surface that renders an
 * intro animation would be worse than a controlled message.
 */
class HomepageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, fromExtension: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, fromExtension: isExtensionError(error) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const fromExtension = isExtensionError(error);
    // Local console record only — richer than what is emitted, and it never
    // leaves the device.
    console.error("[HomepageErrorBoundary] Caught error:", error, errorInfo);

    // The durable half. The seam is fire-and-forget and never throws; the
    // classification crosses, the message and stack do not.
    reportDiagnostic({
      surface: "app-shell",
      stage: "render",
      category: "render_failed",
      error,
      scriptOrigin: classifyScriptOrigin(
        error?.stack,
        typeof window !== "undefined" && window.location ? window.location.origin : "",
      ),
      isExtension: fromExtension,
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  /** Fail closed — always a member of the closed set, never raw text. */
  private resolveCode(): ClientErrorCode {
    return this.props.code ?? "CLIENT_UNEXPECTED";
  }

  render() {
    if (this.state.hasError) {
      // UI-SPEC E1 — DO NOT "SIMPLIFY" THIS AWAY. See the identical note in
      // `AnalysisErrorBoundary`: `preventDefault()` on `vite:preloadError` makes
      // `React.lazy` throw a SECOND, different error a microtask later, which
      // would paint one frame of this fallback during a silent reload.
      if (isStaleReloading()) return null;

      if (isClientSurfaceSuppressed({ serverTerminalStateShown: this.props.serverTerminalStateShown })) {
        return null;
      }

      const copy = getClientErrorCopy(this.resolveCode());
      const primary = copy.affordance.primary;

      return (
        <div className="min-h-viewport bg-background flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-foreground mb-2">{copy.heading}</h2>
            <p className="text-sm text-muted-foreground mb-6">{copy.body}</p>
            {primary && (
              <button
                onClick={this.handleReload}
                className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {primary.label}
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default HomepageErrorBoundary;
