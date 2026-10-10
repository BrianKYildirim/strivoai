// Install ALL polyfills FIRST — before any pdf.js, Stripe or React code is
// evaluated. This is the window realm's install site; the barrel is the single
// place a polyfill is added so it lands in every realm. See the barrel header for
// the full rationale and the source guard that enforces this import stays first.
import "./lib/polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Configure PDF.js worker globally before any component mounts
import "./lib/pdf-worker";
import App from "./App.tsx";
import "./index.css";
import { installGlobalDiagnosticHandlers } from "./lib/diagnostics/install-global-handlers";
import { installStaleBundleRecovery } from "./lib/platform/stale-bundle";
import StaleBundleFallback from "./components/platform/StaleBundleFallback";

// XLOG-01 / XDEV-08 — capture uncaught errors and rejections before the first
// render, and after the polyfill side-effect imports so a polyfill failure is
// itself capturable. Never throws; a diagnostics problem cannot stop the boot.
installGlobalDiagnosticHandlers();

const root = createRoot(document.getElementById("root")!);

// XDEV-07 / UI-SPEC Surface E (D-18, D-19) — armed BEFORE the first render, so a
// chunk that fails during the very first route resolution is already covered.
// The normal outcome is invisible: one silent reload and nothing on screen. This
// callback runs ONLY when recovery provably cannot work (the loop guard already
// spent this tab's one reload on this build, or the device is offline), and it
// renders through the SAME root so `#root` is never left empty (XD-03) and
// exactly one surface can be on screen. Statically imported on purpose: a
// fallback for broken chunks must not itself be a chunk.
installStaleBundleRecovery((reason) => {
  root.render(<StaleBundleFallback reason={reason} />);
});

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// XDEV-01 / UI-SPEC Surface A rule 2 — the boot handshake for the pre-bundle ES5
// guard in index.html. That guard arms an 8000ms watchdog and renders
// "Strivo didn't finish loading" unless the bundle proves it evaluated; this is
// the proof. Delete either line and the A2 fallback fires on EVERY successful
// load 8 seconds in. Removal is wrapped so a DOM problem cannot break the boot —
// the guard is advisory, the app is not.
window.__strivoBooted = true;
try {
  const gate = document.getElementById("browser-gate");
  if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
} catch {
  /* advisory only: a failed removal must never take the app down with it */
}
