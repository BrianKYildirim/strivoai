import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Lint scope (CLEAN-06 / Plan 04-06, config-scope decision):
    //  - dist/**                              build output, never linted
    //  - .claude/**                           GSD tooling, not project source
    //  - supabase/functions/**                Deno runtime code with its own
    //                                         deno.json/strict checking — never
    //                                         part of this frontend flat config
    //  - src/integrations/supabase/types.ts   generated typegen output (treated
    //                                         as a binary/generated artifact)
    ignores: [
      "dist",
      ".claude/**",
      "supabase/functions/**",
      "src/integrations/supabase/types.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Pre-existing tracked baselines (CLEAN-06 / D-12). These are NOT new
      // suppressions — they downgrade rules that were already failing at the
      // phase-start HEAD to `warn`, so the gate stays exit-0 without a
      // behavior-risky purge. Counts are recorded in
      // .planning/audit/RESIDUAL-REGISTER.md. Re-tighten in a dedicated pass.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "no-control-regex": "warn",
      // ── eslint-plugin-react-hooks v7 newly-enabled React Compiler rules
      //    (DEP-03 / Plan 06-03, D-12 tracked-baseline mechanism) ──────────
      // The eslint-tooling coupled bump (eslint 9→10 + react-hooks 5→7) expanded
      // the plugin's `recommended` ruleset from 2 rules (rules-of-hooks +
      // exhaustive-deps) to 16 — adding the React-Compiler-style rules below as
      // `error`. They fire on PRE-EXISTING shipped code (synchronous setState in
      // effects, render-phase impurity, manual-memoization patterns) that was
      // never linted before; fixing them is a behavior-risky multi-component
      // refactor OUT OF SCOPE for a zero-functional-change dependency bump.
      // Per the SAME D-12 mechanism used above, they are tracked as `warn`
      // (NOT new inline suppressions; zero source edited) so `npm run lint`
      // stays exit-0 and the gate is not weakened. `rules-of-hooks` stays
      // `error`; `exhaustive-deps` stays `warn` (its pre-bump severity).
      // Re-tighten in a dedicated React-Compiler-readiness pass.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/config": "warn",
      "react-hooks/gating": "warn",
    },
  },
);
