/**
 * useIdempotencyKey — Phase 29 Plan 07 (MER-04 frontend half).
 *
 * Returns a stable UUID per user-initiated submit. Retries of the SAME logical
 * submit (network retry, double-click, AbortController re-fire) reuse the SAME
 * UUID by NOT calling `regenerate()`. A new user click MUST call `regenerate()`
 * first to roll a fresh UUID (D-09).
 *
 * The UUID is transmitted in the request body as `idempotency_key` (D-10); the
 * partial UNIQUE index on `merit_transactions` enforces dedup server-side
 * (Plan 29-04). Per-feature wiring lands in Phase 31 (Optimistic UI) — Phase 29
 * ships the helper primitive only.
 *
 * Contract:
 *   - Initial render: `key` is a fresh `crypto.randomUUID()` (RFC 4122 v4).
 *   - Re-render without `regenerate()`: same `key` returned (retry reuse).
 *   - `regenerate()`: rolls a new UUID, updates state, returns it synchronously.
 */
import { useCallback, useState } from 'react';

export function useIdempotencyKey(): {
  key: string;
  regenerate: () => string;
} {
  const [key, setKey] = useState<string>(() => crypto.randomUUID());

  const regenerate = useCallback(() => {
    const next = crypto.randomUUID();
    setKey(next);
    return next;
  }, []);

  return { key, regenerate };
}
