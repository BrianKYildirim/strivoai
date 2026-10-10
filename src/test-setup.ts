import '@testing-library/jest-dom/vitest';

// Belt-and-suspenders (D-07): surface — do NOT suppress — escaped promise
// rejections. If a future async effect throws outside a guard, re-throwing here
// makes it fail its OWN test loudly instead of silently crashing a neighboring
// vitest worker (the TEST-02 cross-worker non-determinism root cause).
// Note: this re-throws — it is the opposite of `dangerouslyIgnoreUnhandledErrors`,
// which would weaken the blocking gate.
process.on('unhandledRejection', (reason) => {
  throw reason instanceof Error ? reason : new Error(String(reason));
});
