/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/_shared/__tests__/*.test.ts'],
    // Deno-only tests (use https://deno.land imports) must run with `deno test`, not Vitest.
    exclude: [
      '**/node_modules/**',
      'supabase/functions/_shared/__tests__/archive-reader.test.ts',
      'supabase/functions/_shared/__tests__/interview-prep-prompts.contract.test.ts',
      'supabase/functions/_shared/__tests__/interview-prep-validation.test.ts',
      'supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts',
      // 260724-4cc — Deno guard for the refund_merits business-error classifier; runs in `test:edge`.
      'supabase/functions/_shared/__tests__/merit-gateway-refund-business-errors.test.ts',
      'supabase/functions/_shared/__tests__/tier-prompts.interview-prepend.test.ts',
      // 09-06 (VER-02 / S-01c + S-09) — Deno guards; they run in `test:edge`.
      'supabase/functions/_shared/__tests__/consecutive-runs.test.ts',
      'supabase/functions/_shared/__tests__/replacement-upload.test.ts',
      // 260723-2b0 — remote-DB Deno lane (`test:edge:remote`), not Vitest.
      'supabase/functions/_shared/__tests__/merit-idempotency.remote.test.ts',
      'supabase/functions/_shared/__tests__/merit-refund-replay.remote.test.ts',
      'supabase/functions/_shared/__tests__/resumes-grant.remote.test.ts',
    ],
  },
});
