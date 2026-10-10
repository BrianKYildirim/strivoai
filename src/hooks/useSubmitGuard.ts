import { useCallback, useEffect, useRef, useState } from 'react';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';

const DEFAULT_LEASE_MS = 15 * 60 * 1000;

interface SubmitLock {
  tokenId: string;
  expiresAt: number;
}

const submitLocks = new Map<string, SubmitLock>();

export interface SubmitToken {
  readonly attemptNonce: string;
  readonly lockKey: string;
  readonly tokenId: string;
}

interface SubmitGuardOptions {
  feature: string;
  inputIdentity: string;
  leaseMs?: number;
  terminalState?: string | null;
}

interface EndSubmitOptions {
  resetAttempt?: boolean;
}

export function useSubmitGuard({
  feature,
  inputIdentity,
  leaseMs = DEFAULT_LEASE_MS,
  terminalState = null,
}: SubmitGuardOptions): {
  attemptNonce: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  beginSubmit: () => SubmitToken | null;
  beginRerun: (inputIdentityOverride?: string) => SubmitToken | null;
  endSubmit: (token: SubmitToken, options?: EndSubmitOptions) => void;
  ariaProps: {
    cta: { 'aria-disabled': boolean };
    form: { 'aria-busy': boolean };
  };
} {
  const { key, regenerate } = useIdempotencyKey();
  const attemptNonceRef = useRef(key);
  const activeTokenRef = useRef<SubmitToken | null>(null);
  const leaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lockKey = `${feature}:${inputIdentity}`;

  const clearLeaseTimer = useCallback(() => {
    if (leaseTimerRef.current !== null) {
      clearTimeout(leaseTimerRef.current);
      leaseTimerRef.current = null;
    }
  }, []);

  const release = useCallback((token: SubmitToken, resetAttempt: boolean) => {
    const held = submitLocks.get(token.lockKey);
    if (held?.tokenId === token.tokenId) {
      submitLocks.delete(token.lockKey);
    }
    if (activeTokenRef.current?.tokenId !== token.tokenId) return;

    activeTokenRef.current = null;
    clearLeaseTimer();
    setIsSubmitting(false);
    if (resetAttempt) {
      attemptNonceRef.current = regenerate();
    }
  }, [clearLeaseTimer, regenerate]);

  const acquire = useCallback((
    rerun: boolean,
    inputIdentityOverride?: string,
  ): SubmitToken | null => {
    const requestedLockKey = inputIdentityOverride
      ? `${feature}:${inputIdentityOverride}`
      : lockKey;
    const now = Date.now();
    const held = submitLocks.get(requestedLockKey);
    if (held && held.expiresAt > now) return null;
    if (held) submitLocks.delete(requestedLockKey);

    if (rerun) {
      attemptNonceRef.current = regenerate();
    }

    const token: SubmitToken = {
      attemptNonce: attemptNonceRef.current,
      lockKey: requestedLockKey,
      tokenId: crypto.randomUUID(),
    };
    submitLocks.set(requestedLockKey, {
      tokenId: token.tokenId,
      expiresAt: now + leaseMs,
    });
    activeTokenRef.current = token;
    setIsSubmitting(true);
    clearLeaseTimer();
    leaseTimerRef.current = setTimeout(() => {
      release(token, false);
    }, leaseMs);
    return token;
  }, [clearLeaseTimer, feature, leaseMs, lockKey, regenerate, release]);

  const beginSubmit = useCallback(() => acquire(false), [acquire]);
  const beginRerun = useCallback(
    (inputIdentityOverride?: string) => acquire(true, inputIdentityOverride),
    [acquire],
  );
  const endSubmit = useCallback((
    token: SubmitToken,
    options: EndSubmitOptions = {},
  ) => {
    release(token, options.resetAttempt === true);
  }, [release]);

  useEffect(() => {
    if (!terminalState) return;
    const token = activeTokenRef.current;
    if (token) release(token, true);
  }, [release, terminalState]);

  useEffect(() => () => {
    const token = activeTokenRef.current;
    if (token) {
      const held = submitLocks.get(token.lockKey);
      if (held?.tokenId === token.tokenId) submitLocks.delete(token.lockKey);
    }
    clearLeaseTimer();
  }, [clearLeaseTimer]);

  return {
    attemptNonce: attemptNonceRef.current,
    isSubmitting,
    canSubmit: !isSubmitting,
    beginSubmit,
    beginRerun,
    endSubmit,
    ariaProps: {
      cta: { 'aria-disabled': isSubmitting },
      form: { 'aria-busy': isSubmitting },
    },
  };
}
