import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Navbar } from '@/components/Navbar';
import Footer from '@/components/Footer';
import { StripeCheckoutWrapper } from '@/components/StripeCheckoutWrapper';
import { RenewEliteDialog } from '@/components/billing/RenewEliteDialog';
import {
  SubscriptionStatusPanel,
  type SubscriptionStatusPanelState,
} from '@/components/billing/SubscriptionStatusPanel';
import { TierCardV2 } from '@/components/pricing/TierCardV2';
import { BillingIntervalToggleV2 } from '@/components/pricing/BillingIntervalToggleV2';
import { PackSectionV2 } from '@/components/pricing/PackSectionV2';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabaseClient';
import { useTierAccess } from '@/hooks/useTierAccess';
import { useInvalidateMerits } from '@/hooks/useMerits';
import { useSubscriptionState } from '@/hooks/useSubscriptionState';
import { ACTIVE_TIERS, type ActiveTier } from '@/config/pricing-config';
import { normalizeSubscriptionPeriodEnd } from '@/lib/subscription-downgrade';
import { BlockedCheckoutEntryPoint } from '@/components/platform/CapabilityGate';
import { useCheckoutCapability } from '@/hooks/useCheckoutCapability';

const TIERS: readonly ActiveTier[] = ACTIVE_TIERS;

const Pricing = () => {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');
  const navigate = useNavigate();
  const { tier: currentTier } = useTierAccess();
  const invalidateMerits = useInvalidateMerits();
  const subscriptionState = useSubscriptionState();

  // Embedded checkout modal state (copied verbatim from PricingTable.tsx:102-105).
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTitle, setCheckoutTitle] = useState('');

  // Downgrade (cancel-at-period-end) confirmation state.
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const [downgrading, setDowngrading] = useState(false);
  const downgradeInFlightRef = useRef(false);
  // De-dup guard for the paid-tier CTA: create-checkout-session takes seconds
  // (auth + Stripe session creation + possible cold start), and every click in
  // that window used to create a NEW Stripe session. Exactly one session per
  // click now.
  const checkoutInFlightRef = useRef(false);
  const checkoutRequestIdRef = useRef(0);
  const [downgradeUserId, setDowngradeUserId] = useState<string | null>(null);
  const [localBillingUserId, setLocalBillingUserId] = useState<string | null>(null);
  const [provisionalPending, setProvisionalPending] = useState(false);
  const [provisionalPeriodEnd, setProvisionalPeriodEnd] = useState<Date | null>(null);
  const [renewalDialogOpen, setRenewalDialogOpen] = useState(false);
  const [stripeConfirmedPeriodEnd, setStripeConfirmedPeriodEnd] = useState<Date | null>(null);
  const [renewalConfirmed, setRenewalConfirmed] = useState(false);

  const hasCurrentLocalBillingState =
    localBillingUserId !== null &&
    subscriptionState.userId === localBillingUserId;
  const hasLocalStripeConfirmation = hasCurrentLocalBillingState && !!stripeConfirmedPeriodEnd;
  const isDowngradePending =
    !hasLocalStripeConfirmation &&
    (subscriptionState.isPendingDowngrade || (hasCurrentLocalBillingState && provisionalPending));
  const pendingPeriodEnd =
    (hasCurrentLocalBillingState ? provisionalPeriodEnd : null) ??
    subscriptionState.currentPeriodEnd;
  const panelPeriodEnd =
    pendingPeriodEnd ??
    (hasCurrentLocalBillingState ? stripeConfirmedPeriodEnd : null);
  const panelState: SubscriptionStatusPanelState | null = hasCurrentLocalBillingState && renewalConfirmed
    ? 'confirmed'
    : hasLocalStripeConfirmation
      ? 'syncing'
      : isDowngradePending
        ? 'pending'
        : null;

  // CR-01 (T-01): retire the local provisional pending state once the
  // authoritative subscription query confirms the pending downgrade for the
  // current billing user. After retirement provisional is no longer ORed into
  // isDowngradePending, so a subsequent authoritative cleared / inactive /
  // expired / changed-period truth wins on the same mount. This runs in an
  // effect (after render) so it never fires on the synchronous render that
  // seeds provisional after a cancel — only after the authoritative query
  // subsequently reports pending. It is suppressed while a local Stripe
  // confirmation (syncing/confirmed) is active so it cannot suppress that panel.
  useEffect(() => {
    if (
      subscriptionState.isPendingDowngrade &&
      hasCurrentLocalBillingState &&
      provisionalPending &&
      !hasLocalStripeConfirmation
    ) {
      setProvisionalPending(false);
      setProvisionalPeriodEnd(null);
    }
  }, [
    subscriptionState.isPendingDowngrade,
    hasCurrentLocalBillingState,
    hasLocalStripeConfirmation,
    provisionalPending,
  ]);

  // WR-01 (T-02): a downgrade confirmation dialog opened under one authenticated
  // user must not remain actionable after the session changes. When the current
  // subscription user no longer matches the identity the dialog was opened for,
  // close and reset the dialog so a session swap cannot leave a stale financial
  // confirmation mounted.
  useEffect(() => {
    // A null subscription userId means "not yet loaded", not "different user";
    // only close on a known authenticated identity that differs from the one the
    // dialog was opened for (an actual session swap). A fully signed-out session
    // is caught instead by the pre-invoke getUser guard in handleConfirmDowngrade.
    if (
      downgradeOpen &&
      downgradeUserId !== null &&
      subscriptionState.userId !== null &&
      subscriptionState.userId !== downgradeUserId
    ) {
      setDowngradeOpen(false);
      setDowngradeUserId(null);
    }
  }, [downgradeOpen, downgradeUserId, subscriptionState.userId]);

  // UI-SPEC B3 / XRUN-01. `blocked` is only ever true on a settled negative verdict —
  // it fails OPEN while the payment-provider probe is pending, because briefly
  // blocking a paying customer would be worse than the defect this guard prevents.
  const { blocked: checkoutBlocked } = useCheckoutCapability();

  const handleCheckoutOpenChange = (next: boolean) => {
    setCheckoutOpen(next);
    if (!next) {
      checkoutRequestIdRef.current += 1;
      checkoutInFlightRef.current = false;
      setCheckoutSecret(null);
    }
  };

  const handleTierCta = async (tier: ActiveTier, chosenInterval: 'monthly' | 'annual') => {
    // HARD RULE (UI-SPEC B3): in `degraded` tier no Stripe session, no PaymentIntent
    // and no checkout dialog may be created. This returns BEFORE any network call.
    // Downgrade-to-free is deliberately still reachable below: cancelling a plan is
    // not checkout, and taking it away would strand the user on a paid plan.
    if (checkoutBlocked && tier !== 'free') return;

    if (tier === 'free') {
      if (isDowngradePending) return;

      // Anonymous visitor → sign-up. Logged-in subscriber → downgrade flow.
      // Previously this always ran navigate('/auth'), which for an authenticated
      // user bounces to '/' — the reported "clicking Start free just goes home"
      // bug (quick task 260718-jbd).
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      setDowngradeUserId(user.id);
      setDowngradeOpen(true);
      return;
    }

    // Exactly one Stripe session per click: a second click while the first
    // request is still in flight is dropped, not queued.
    if (checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    const requestId = ++checkoutRequestIdRef.current;

    // UI-SPEC G1 / checkout-source-guard: open on THIS tick, before anything async.
    // StripeCheckoutWrapper
    // renders "Preparing secure checkout…" while clientSecret is null, so the
    // several-second edge round trip below is no longer dead time. The secret is
    // cleared first so reopening for a different tier cannot flash the previous
    // session's embedded checkout. Every non-embedded outcome below MUST then
    // close the dialog, or it would sit stuck in the preparing state forever.
    setCheckoutSecret(null);
    setCheckoutTitle(`Subscribe to ${tier}`);
    setCheckoutOpen(true);

    try {
      // Invoke create-checkout-session DIRECTLY (not via useStripeCheckout,
      // which discards the { mode } discriminator — useStripeCheckout.ts:42).
      // The raw response is one of:
      //   { clientSecret, id }      net-new subscriber  → open embedded modal
      //   { mode:'swap', tier }     existing subscriber → Dashboard reconcile path
      //   { mode:'portal_required' } no saved card      → customer portal redirect
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { mode: 'subscription', tier, interval: chosenInterval, ui_mode: 'embedded' },
      });
      if (requestId !== checkoutRequestIdRef.current) return;

      if (error) {
        setCheckoutOpen(false);
        toast.error('Could not start checkout. Please try again.');
        console.error('[Pricing] create-checkout-session error', error);
        return;
      }

      if (data?.clientSecret) {
        // Net-new subscriber → the already-open modal swaps its pending body for
        // the embedded checkout (open + title were set on the click tick).
        setCheckoutSecret(data.clientSecret);
        return;
      }

      if (data?.mode === 'swap') {
        // Existing subscriber: the server swapped the subscription item in place;
        // route to the Dashboard reconciliation path (no second checkout).
        setCheckoutOpen(false);
        navigate('/dashboard?checkout=complete');
        return;
      }

      if (data?.mode === 'portal_required') {
        // No usable saved card — send the customer to the Stripe portal to add one.
        setCheckoutOpen(false);
        const { data: portal, error: portalError } = await supabase.functions.invoke('create-stripe-portal');
        if (portalError || !portal?.url) {
          toast.error('Could not open the billing portal. Please try again.');
          console.error('[Pricing] create-stripe-portal error', portalError ?? portal);
          return;
        }
        window.location.href = portal.url;
        return;
      }

      // Unexpected shape — fail loud but graceful.
      setCheckoutOpen(false);
      toast.error('Could not start checkout. Please try again.');
      console.error('[Pricing] unexpected create-checkout-session response', data);
    } catch (err) {
      setCheckoutOpen(false);
      toast.error('Could not start checkout. Please try again.');
      console.error('[Pricing] checkout exception', err);
    } finally {
      if (requestId === checkoutRequestIdRef.current) {
        checkoutInFlightRef.current = false;
      }
    }
  };

  const handleConfirmDowngrade = async () => {
    if (downgradeInFlightRef.current || downgrading || isDowngradePending) {
      setDowngradeOpen(false);
      return;
    }

    // WR-01 (T-02): re-read the current authenticated user immediately before
    // the financial mutation and compare it to the identity the dialog was
    // opened for. If the user is absent or has changed (session swap), abort
    // without invoking cancel-subscription so we can never cancel the wrong
    // account. The in-flight flags are still unset here, so no cleanup is owed.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== downgradeUserId) {
      setDowngradeOpen(false);
      setDowngradeUserId(null);
      toast.error('Your session changed, so no changes were made. Please try again.');
      return;
    }

    downgradeInFlightRef.current = true;
    setDowngrading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription');

      // A `no_subscription` result means the account is already effectively Free
      // (no active Stripe subscription) — treat it as a benign success, not an error.
      const errorCode =
        (data as { error?: string } | null)?.error ??
        ((error as { context?: { error?: string } } | null)?.context?.error);

      if (errorCode === 'no_subscription') {
        toast.success("You're already on the Free plan.");
        setDowngradeOpen(false);
        invalidateMerits();
        return;
      }

      if (error || !(data as { ok?: boolean } | null)?.ok) {
        toast.error('Could not cancel your subscription. Please try again.');
        console.error('[Pricing] cancel-subscription error', error ?? data);
        return;
      }

      const periodEnd = (data as { current_period_end?: number | null }).current_period_end;
      const normalizedPeriodEnd = normalizeSubscriptionPeriodEnd(periodEnd);
      const whenLabel =
        normalizedPeriodEnd
          ? ` until ${format(normalizedPeriodEnd, 'MMM d, yyyy')}`
          : ' until the end of your current billing period';
      toast.success(`Elite stays active${whenLabel}, then your account moves to Free.`);
      setProvisionalPending(true);
      setProvisionalPeriodEnd(normalizedPeriodEnd);
      setLocalBillingUserId(downgradeUserId ?? subscriptionState.userId);
      setStripeConfirmedPeriodEnd(null);
      setRenewalConfirmed(false);
      setDowngradeOpen(false);
      // Tier does not change immediately (period-end downgrade); refresh so any
      // merit/status-derived UI re-reads authoritative state.
      invalidateMerits();
      void subscriptionState.refresh();
    } catch (err) {
      toast.error('Could not cancel your subscription. Please try again.');
      console.error('[Pricing] cancel-subscription exception', err);
    } finally {
      downgradeInFlightRef.current = false;
      setDowngrading(false);
    }
  };

  const handlePackBuy = (packId: string) => {
    // Deliberately NOT short-circuited here. `TopUpProvider` is the last point before
    // `create-payment-intent`, and it blocks there — so the pack button stays alive
    // and the user gets the B3 explanation instead of a dead control. The guarantee
    // that matters (no PaymentIntent in `degraded` tier) is enforced at the provider.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('topup:open', { detail: { packId } }),
      );
    }
  };

  return (
    <>
      <Helmet>
        <title>Strivo AI — Pricing</title>
        <meta
          name="description"
              content="Choose your Strivo plan. Free and Elite tiers with AI resume analysis, career coaching, and job matching — plus one-time merit top-up packs."
        />
      </Helmet>
      <div className="min-h-viewport bg-background text-foreground">
        <Navbar />
        <main className="pt-24 pb-24">
          <section className="max-w-6xl mx-auto px-4 text-center">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">
              Pricing built for job seekers.
            </h1>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              Pick a plan. Top up merits whenever you want. Cancel anytime.
            </p>
            <div className="mb-12 flex justify-center">
              <BillingIntervalToggleV2 value={interval} onChange={setInterval} />
            </div>
          </section>

          {panelState ? (
            <SubscriptionStatusPanel
              state={panelState}
              periodEnd={panelPeriodEnd}
              action={(
                <RenewEliteDialog
                  open={renewalDialogOpen}
                  onOpenChange={setRenewalDialogOpen}
                  periodEnd={panelPeriodEnd}
                  onStripeConfirmed={(confirmedPeriodEnd) => {
                    setLocalBillingUserId(subscriptionState.userId);
                    setStripeConfirmedPeriodEnd(confirmedPeriodEnd);
                    setProvisionalPending(false);
                  }}
                  reconcilePendingDowngrade={subscriptionState.reconcilePendingDowngrade}
                  onProfileReconciled={() => setRenewalConfirmed(true)}
                  disabled={panelState !== 'pending'}
                  triggerClassName={panelState === 'pending' ? 'w-full sm:w-auto' : 'hidden'}
                />
              )}
            />
          ) : null}

          {checkoutBlocked ? (
            <section
              aria-label="Checkout availability"
              className="max-w-4xl mx-auto px-4 mb-6 text-left"
            >
              <BlockedCheckoutEntryPoint label="Upgrade to Elite" className="w-full sm:w-auto" />
            </section>
          ) : null}

          <section
            aria-label="Subscription tiers"
            className="max-w-4xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {TIERS.map((tier) => (
              <TierCardV2
                key={tier}
                tier={tier}
                interval={interval}
                status={
                  isDowngradePending
                    ? tier === 'elite' ? 'current' : 'scheduled'
                    : currentTier === tier ? 'current' : 'available'
                }
                onCta={handleTierCta}
              />
            ))}
          </section>

          <PackSectionV2 onBuy={handlePackBuy} />
        </main>
        <Footer />
      </div>

      {/* Embedded Stripe checkout (net-new subscribers) */}
      <StripeCheckoutWrapper
        open={checkoutOpen}
        onOpenChange={handleCheckoutOpenChange}
        clientSecret={checkoutSecret}
        title={checkoutTitle}
      />

      {/* Downgrade confirmation — cancel at period end */}
      <AlertDialog open={downgradeOpen} onOpenChange={setDowngradeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade to Free?</AlertDialogTitle>
            <AlertDialogDescription>
              Your Elite plan and merits stay active until the end of your current
              billing period. After that, your account automatically moves to the
              Free tier. You won&apos;t be charged again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={downgrading}>Keep Elite</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog mounted while the async request runs; close on success.
                e.preventDefault();
                handleConfirmDowngrade();
              }}
              disabled={downgrading}
            >
              {downgrading ? 'Cancelling…' : 'Downgrade to Free'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Pricing;
