import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "node:child_process";

/**
 * Phase 03 (XDEV-07 / XLOG-01, D-18) — resolve THE build identity, once, at
 * config-evaluation time.
 *
 * One value feeds three consumers: the runtime stale-bundle version check
 * (plan 03-13), the diagnostics `app_version` field (plan 03-06), and Surface
 * E2's cache-busting `/?_v={buildId}` CTA.
 *
 * Precedence, and why each step exists:
 *   1. VITE_BUILD_ID          — explicit operator/CI override, always wins.
 *   2. VERCEL_GIT_COMMIT_SHA  — truncated to 12 chars; the full SHA is
 *                               unnecessary detail in every diagnostics row.
 *   3. `git rev-parse --short HEAD` — local/hand-built frontends. Wrapped in
 *      try/catch with stderr discarded so a container without git, a detached
 *      HEAD, or an empty repo cannot fail or pollute the build.
 *   4. String(Date.now())     — NOT optional. The Vercel Git link is
 *      disconnected, so Preview frontends are built by hand and step 2 is
 *      unavailable there. This guarantees the ID is never empty on ANY build
 *      surface; an empty ID would silently disable stale-bundle recovery.
 */
function resolveBuildId(): string {
  if (process.env.VITE_BUILD_ID) return process.env.VITE_BUILD_ID;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (sha) return sha;
  } catch {
    // git unavailable / not a repo / no commits — fall through to the timestamp.
  }
  return String(Date.now());
}

const BUILD_ID = resolveBuildId();

/**
 * Emits `dist/version.json` (`{"buildId": "..."}`) alongside the bundle so a
 * long-idle tab can compare the ID it was built with against the ID currently
 * deployed. `vercel.json` serves this file `no-store` — a CDN-cached manifest
 * would report the old build forever and quietly defeat the mechanism.
 */
function versionManifestPlugin(): Plugin {
  return {
    name: "strivo-version-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId: BUILD_ID }),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [versionManifestPlugin()],
  // Phase 03 (D-18): the build identity, inlined into the bundle at build time
  // and read through `getBuildId()` in src/lib/platform/build-id.ts.
  define: {
    __STRIVO_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    cors: {
      origin: "*",
      credentials: true,
    },
  },
  // `vite preview` defaults to port 4173; pin it to 8080 so the Playwright
  // baseURL (http://localhost:8080) matches the production-build preview the
  // E2E gate drives (D-03). Reads no secrets — secrets are env-sourced at build.
  preview: {
    port: 8080,
    host: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "./node_modules/react/jsx-runtime"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: ["react-pdf"],
  },
  build: {
    rollupOptions: {
      output: {
        // Split large, stable vendor libs into their own long-cached chunks so an
        // app-code change doesn't bust them, and the entry chunk stays small.
        // (rolldown requires the function form.)
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@tanstack/react-query")) return "vendor-query";
          if (id.includes("/react-router") || id.includes("/react-dom/") || id.includes("/scheduler/") || /node_modules\/react\//.test(id)) return "vendor-react";
        },
      },
    },
  },
}));
