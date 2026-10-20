/**
 * useIdempotencyKey — hook contract tests (Phase 29 Plan 07, MER-04 frontend + TEST-01).
 *
 * Behavior verified (per 29-07-PLAN.md <behavior>):
 *   T1  First render returns an RFC 4122 v4 UUID string.
 *   T2  rerender() WITHOUT calling regenerate() preserves the same key (D-09 — retries reuse).
 *   T3  act(() => regenerate()) produces a NEW UUID that still matches the v4 shape.
 *   T4  regenerate() returns the new key synchronously and that value equals the post-update state.
 *   T5  Two independent renderHook invocations produce two different keys (no global state).
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useIdempotencyKey } from './useIdempotencyKey';

// RFC 4122 v4 UUID — 36 chars, version nibble = 4, variant nibble ∈ {8,9,a,b}.
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('useIdempotencyKey', () => {
  it('T1: first render returns a key matching the v4 UUID shape', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    expect(result.current.key).toMatch(UUID_V4_REGEX);
  });

  it('T2: re-renders without regenerate() preserve the same key (D-09 retry reuse)', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const initialKey = result.current.key;
    rerender();
    expect(result.current.key).toBe(initialKey);
    rerender();
    expect(result.current.key).toBe(initialKey);
  });

  it('T3: regenerate() rolls a new UUID that still matches v4 shape', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const before = result.current.key;
    act(() => {
      result.current.regenerate();
    });
    const after = result.current.key;
    expect(after).not.toBe(before);
    expect(after).toMatch(UUID_V4_REGEX);
  });

  it('T4: regenerate() returns the new key synchronously and matches post-update state', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    let returned = '';
    act(() => {
      returned = result.current.regenerate();
    });
    expect(returned).toMatch(UUID_V4_REGEX);
    expect(returned).toBe(result.current.key);
  });

  it('T5: two independent hook instances produce two different keys', () => {
    const { result: r1 } = renderHook(() => useIdempotencyKey());
    const { result: r2 } = renderHook(() => useIdempotencyKey());
    expect(r1.current.key).not.toBe(r2.current.key);
    expect(r1.current.key).toMatch(UUID_V4_REGEX);
    expect(r2.current.key).toMatch(UUID_V4_REGEX);
  });
});
