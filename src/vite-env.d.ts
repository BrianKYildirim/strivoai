/// <reference types="vite/client" />

/**
 * Phase 03 (XDEV-07 / XLOG-01, D-18) — build identity stamped by
 * `vite.config.ts` via `define`. Read it through `getBuildId()` in
 * `src/lib/platform/build-id.ts`, never directly: the accessor guards the
 * `typeof` check for contexts (vitest, SSR-like) where the define is absent.
 */
declare const __STRIVO_BUILD_ID__: string;

/**
 * Phase 03 (XDEV-01, UI-SPEC Surface A rule 2) — the boot handshake between the
 * pre-bundle ES5 guard in `index.html` and `src/main.tsx`. The guard reads it to
 * decide whether its 8000ms watchdog fallback should render; `main.tsx` sets it
 * immediately after `createRoot(...).render(...)`. Optional because it is
 * genuinely absent until the bundle evaluates — which is the whole point.
 */
interface Window {
  __strivoBooted?: boolean;
}
