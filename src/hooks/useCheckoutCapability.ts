/**
 * useCheckoutCapability — the ASYNCHRONOUS half of UI-SPEC B3's verdict.
 *
 * Payment embedding is the one capability in this phase that is NOT synchronously
 * feature-detectable: whether a third-party payment form can mount depends on whether
 * the provider's script loads at all, which a blocker extension, a corporate proxy or
 * a restrictive CSP can prevent on an otherwise perfectly modern browser. The ES5
 * pre-bundle guard is forbidden from making network requests, and `capabilities.ts`
 * keeps the same posture, so the signal is taken here instead.
 *
 * `loadStripe()` resolves to `null` when the script fails to load, rather than
 * throwing; some versions reject instead. Both are treated the same way.
 *
 * ── FAIL DIRECTION: OPEN ────────────────────────────────────────────────────
 * While the probe is PENDING, checkout is NOT blocked. A user who clicks Upgrade in
 * the first few hundred milliseconds of a page load must reach checkout — briefly
 * blocking a paying customer because a script had not resolved yet would be a worse
 * defect than the one this guard prevents. Only a settled negative result blocks.
 *
 * ── NO NEW NETWORK REQUEST ──────────────────────────────────────────────────
 * `TopUpProvider` is mounted app-wide in `App.tsx` and already pulls in
 * `StripePaymentElementModal`, which calls `loadStripe` at module scope. The provider
 * script is therefore already loading on every page. `loadStripe` de-duplicates its
 * script injection internally, so calling it again here costs nothing.
 */
import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';

import { isCheckoutBlocked } from '@/lib/platform/capabilities';

// Build-time inlined by Vite, exactly as in `StripeCheckoutWrapper`.
const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

/** `undefined` while pending — deliberately distinct from a settled `false`. */
let cachedProviderAvailable: boolean | undefined;
let probeStarted = false;

function startProbe(onSettled: (available: boolean) => void): void {
  if (cachedProviderAvailable !== undefined) {
    onSettled(cachedProviderAvailable);
    return;
  }
  if (!PUBLISHABLE_KEY) {
    // A missing key is a DEPLOYMENT fault, not a browser capability. Reporting it as
    // "your browser can't check out" would send the user chasing a browser upgrade
    // for a problem on our side, so the capability verdict stays open and the
    // existing `checkout-unavailable` surface owns this case.
    cachedProviderAvailable = true;
    onSettled(true);
    return;
  }
  if (probeStarted) return;
  probeStarted = true;

  loadStripe(PUBLISHABLE_KEY).then(
    (stripe) => {
      cachedProviderAvailable = stripe !== null;
      onSettled(cachedProviderAvailable);
    },
    () => {
      cachedProviderAvailable = false;
      onSettled(false);
    },
  );
}

export interface CheckoutCapability {
  /** `true` ⇒ render B3 and issue no session-creating request. */
  blocked: boolean;
  /** `false` while the provider probe is still pending. */
  resolved: boolean;
}

export function useCheckoutCapability(): CheckoutCapability {
  // The synchronous verdict is available on the first render, so an insecure context
  // blocks immediately rather than after a round trip.
  const synchronouslyBlocked = isCheckoutBlocked();
  const [providerAvailable, setProviderAvailable] = useState<boolean | undefined>(
    cachedProviderAvailable,
  );

  useEffect(() => {
    if (synchronouslyBlocked) return;
    let active = true;
    startProbe((available) => {
      if (active) setProviderAvailable(available);
    });
    return () => {
      active = false;
    };
  }, [synchronouslyBlocked]);

  if (synchronouslyBlocked) return { blocked: true, resolved: true };
  return {
    blocked: providerAvailable === false,
    resolved: providerAvailable !== undefined,
  };
}

/** Test-only: clears the memoized provider verdict and the once-per-session latch. */
export function resetCheckoutCapabilityForTests(): void {
  cachedProviderAvailable = undefined;
  probeStarted = false;
}
