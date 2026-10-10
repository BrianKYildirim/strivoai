/**
 * TopUpProvider — Phase 24 Plan 06 (D-24: global 'topup:open' entry point).
 *
 * Single place in the app that:
 *   1. Listens for `window.dispatchEvent(new CustomEvent('topup:open', {
 *        detail: { packId: PackId } }))`
 *      (Plan 05's PackCardV2 "Buy X Merits" button is the primary source; the
 *      OutOfMeritsModalV2 "Top up" CTA and the HeaderTopUpTrigger '+' icon
 *      also dispatch through this same event.)
 *   2. Calls useCreatePaymentIntent → create(packId) to request a clientSecret.
 *   3. Mounts StripePaymentElementModal with the resulting clientSecret.
 *
 * Guards:
 * - isPackId rejects malformed CustomEvent.detail (defence-in-depth).
 *   IN-03: invalid-detail events are dropped silently — the handler console
 *   .warns and returns WITHOUT touching setPackId/setOpen/setClientSecret
 *   and WITHOUT incrementing requestIdRef. This is deliberate: if a valid
 *   topup:open is in flight when a malformed event fires (e.g. from a future
 *   broken dispatcher), bumping requestIdRef here would invalidate the good
 *   request's result. Dropping the bad event instead leaves the in-flight
 *   valid request unaffected; the user sees no disruption.
 * - Same-pack de-dup (quick 260727-0s6): create-payment-intent takes seconds, and
 *   every repeat click on the SAME pack in that window used to create another
 *   PaymentIntent. inFlightPackRef drops those repeats so one pack click ⇒ one
 *   PaymentIntent. It intentionally does NOT block a DIFFERENT pack — WR-01's
 *   supersede behaviour must still work — and it is released when this request's
 *   result is applied, or when the dialog closes.
 * - If create() returns null (auth/invoke failure), close the modal so the
 *   Sonner toast fired by the hook is the only user-visible feedback.
 * - onOpenChange(false) clears packId + clientSecret so re-opening the modal
 *   always requests a fresh PaymentIntent (a Stripe clientSecret is
 *   single-confirmation; reusing it is a common PaymentElement bug).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PACKS_BY_ID, type PackId } from '@/config/pricing-config';
import { useCreatePaymentIntent } from '@/hooks/useCreatePaymentIntent';
import { StripePaymentElementModal } from '@/components/topup/StripePaymentElementModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BlockedCheckoutNotice } from '@/components/platform/CapabilityGate';
import { CAPABILITY_COPY } from '@/lib/platform/capability-copy';
import { useCheckoutCapability } from '@/hooks/useCheckoutCapability';

function isPackId(v: unknown): v is PackId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PACKS_BY_ID, v);
}

export function TopUpProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [packId, setPackId] = useState<PackId | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const { create } = useCreatePaymentIntent();
  // WR-01: Track the latest topup:open request so that if the user clicks
  // two pack buttons in rapid succession, only the most recent create() result
  // is applied. Without this guard, a stale clientSecret could overwrite a
  // fresh one and Stripe would confirm against the wrong amount.
  const requestIdRef = useRef(0);
  // The modal is opened by a global event rather than a Radix DialogTrigger, so
  // Radix cannot infer which pack button owns focus restoration.
  const triggerRef = useRef<HTMLElement | null>(null);
  const lastPointerTriggerRef = useRef<HTMLElement | null>(null);
  // Pack currently awaiting a create() result. See the same-pack de-dup note in
  // the header block.
  const inFlightPackRef = useRef<PackId | null>(null);
  // UI-SPEC B3 / XRUN-01. The top-up trigger is a global event rather than a button
  // the gate can replace, so the block lands here — the LAST point before
  // `create-payment-intent` is called — and stands in for the payment dialog with the
  // same explanation. `blocked` fails OPEN while the provider probe is pending.
  const { blocked: checkoutBlocked } = useCheckoutCapability();
  const [blockedNoticeOpen, setBlockedNoticeOpen] = useState(false);

  const handleOpenTopUp = useCallback(
    async (event: Event) => {
      const detail = (event as CustomEvent<{ packId: unknown }>).detail;
      if (!detail || !isPackId(detail.packId)) {
        // IN-03: do NOT increment requestIdRef here, and do NOT touch
        // inFlightPackRef. See header block above — dropping a malformed event
        // must leave any concurrent valid request in flight untouched.
        console.warn('[TopUpProvider] invalid packId in topup:open event', detail);
        return;
      }
      // The capability block comes BEFORE the in-flight guards and before any state
      // that would open the payment dialog, so no PaymentIntent is ever requested.
      // The in-flight refs are deliberately left untouched (plan 03-18 owns them).
      if (checkoutBlocked) {
        setBlockedNoticeOpen(true);
        return;
      }
      // Repeat click on the pack we are already creating an intent for → drop.
      // A different pack falls through and supersedes via requestIdRef (WR-01).
      if (inFlightPackRef.current === detail.packId) return;
      inFlightPackRef.current = detail.packId;
      const active = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      triggerRef.current = active && active !== document.body
        ? active
        : lastPointerTriggerRef.current;
      const thisReqId = ++requestIdRef.current;
      setPackId(detail.packId);
      setClientSecret(null);
      setOpen(true);
      const result = await create(detail.packId);
      // Discard result if a newer topup:open event has superseded this one.
      if (thisReqId !== requestIdRef.current) return;
      // Only the CURRENT request releases the guard — a superseded stale
      // response must never clear a newer request's in-flight marker.
      inFlightPackRef.current = null;
      if (!result) {
        setOpen(false);
        setPackId(null);
        return;
      }
      setClientSecret(result.clientSecret);
    },
    [create, checkoutBlocked],
  );

  useEffect(() => {
    const rememberPointerTrigger = (event: PointerEvent) => {
      lastPointerTriggerRef.current = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button, [role="button"]')
        : null;
    };
    document.addEventListener('pointerdown', rememberPointerTrigger, true);
    window.addEventListener('topup:open', handleOpenTopUp);
    return () => {
      document.removeEventListener('pointerdown', rememberPointerTrigger, true);
      window.removeEventListener('topup:open', handleOpenTopUp);
    };
  }, [handleOpenTopUp]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setPackId(null);
      setClientSecret(null);
      // Closing always allows a fresh attempt at the same pack.
      inFlightPackRef.current = null;
      const trigger = triggerRef.current;
      triggerRef.current = null;
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus();
      });
    }
  }, []);

  return (
    <>
      {children}
      <StripePaymentElementModal
        open={open}
        onOpenChange={handleOpenChange}
        packId={packId}
        clientSecret={clientSecret}
      />
      <Dialog open={blockedNoticeOpen} onOpenChange={setBlockedNoticeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>{CAPABILITY_COPY.checkoutHeading}</DialogTitle>
          </DialogHeader>
          <BlockedCheckoutNotice />
        </DialogContent>
      </Dialog>
    </>
  );
}
