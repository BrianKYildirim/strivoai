/**
 * CapabilityGate.tsx — UI-SPEC Surface B, pieces B1–B4 (XDEV-01, D-07, D-08b).
 *
 * The honest version of "this browser can't do that". Three rules shape every line
 * below, and each one exists because its opposite is a real, observed failure:
 *
 *  1. DEGRADED IS NEVER A FULL-PAGE TAKEOVER. The user keeps navigation, keeps their
 *     results, keeps their plan. Only the money paths — starting an AI run, and
 *     checkout — are blocked, and each is blocked IN CONTEXT with an explanation.
 *  2. THE BLOCKED CTA IS `aria-disabled`, NEVER `disabled`. A `disabled` button
 *     leaves the tab order and announces nothing, so a keyboard or screen-reader
 *     user is handed a dead control with no explanation. `aria-disabled` keeps it
 *     focusable and announced, and `aria-describedby` points at the reason.
 *  3. NO USER-FACING STRING LIVES IN THIS FILE. Every one comes from the frozen
 *     `CAPABILITY_COPY` / area tables in `@/lib/platform/capability-copy`, which is
 *     what makes the XRUN-06 leak guard a property rather than a hope.
 *
 * This is the SECOND layer. The ES5 pre-bundle guard in `index.html` (Surface A,
 * plan 03-07) owns `unbootable` in its entirety; nothing here duplicates it, and
 * nothing here can produce that tier.
 *
 * Semantic tokens only — no hardcoded color, no new shadcn block.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Info, MonitorX, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CAPABILITY_COPY,
  SUPPORTED_BROWSERS_HREF,
} from '@/lib/platform/capability-copy';
import {
  getBlockedAreas,
  resolveCapabilityTier,
  type BlockedArea,
} from '@/lib/platform/capabilities';

// ── Session state ────────────────────────────────────────────────────────────

/**
 * B1 dismissal persists for the SESSION only (UI-SPEC B1). Module scope rather than
 * `sessionStorage`: this must keep working in exactly the restricted-storage browsers
 * the gate exists for, and a banner that reappears on every route change would be a
 * worse defect than one that reappears in a new tab.
 */
let bannerDismissed = false;

// ── B4 — capability detail dialog ────────────────────────────────────────────

interface CapabilityDetailDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Include checkout even when only the async payment-provider signal failed. */
  checkoutBlocked?: boolean;
}

/**
 * B4. Plain-language areas only: no API name, no probe name, no version string.
 * Radix defaults (focus trap, Escape, focus return to the trigger) are preserved.
 */
export function CapabilityDetailDialog({
  open,
  onOpenChange,
  checkoutBlocked = false,
}: CapabilityDetailDialogProps): JSX.Element {
  const areas: readonly BlockedArea[] = useMemo(
    () => getBlockedAreas(checkoutBlocked),
    [checkoutBlocked],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="capability-detail-dialog" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{CAPABILITY_COPY.detailTitle}</DialogTitle>
          <DialogDescription>{CAPABILITY_COPY.detailIntro}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {areas.map((area) => (
            <li key={area.id} className="text-sm leading-relaxed text-foreground">
              <span className="font-semibold">{area.label}</span>
              {' — '}
              <span className="text-muted-foreground">{area.reason}</span>
            </li>
          ))}
        </ul>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {CAPABILITY_COPY.detailFooter}
        </p>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="min-h-11">
              {CAPABILITY_COPY.detailClose}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── B1 — session banner ──────────────────────────────────────────────────────

/**
 * B1. Rendered inside the authenticated app shell directly under the navbar, in
 * NORMAL DOCUMENT FLOW — never `position: fixed`, which would eat mobile viewport —
 * and never a toast, which would auto-dismiss before it could be read.
 *
 * `role="status"` (polite). Never `destructive`: a limitation is not a failure.
 */
export function CapabilityBanner(): JSX.Element | null {
  const [dismissed, setDismissed] = useState(bannerDismissed);
  const [detailOpen, setDetailOpen] = useState(false);
  const degraded = resolveCapabilityTier() === 'degraded';

  const dismiss = useCallback(() => {
    bannerDismissed = true;
    setDismissed(true);
  }, []);

  if (!degraded || dismissed) return null;

  return (
    <>
      <div
        role="status"
        data-testid="capability-degraded-banner"
        className="flex items-start gap-3 border-b border-border bg-secondary p-4"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="flex-1 text-sm leading-[1.4] text-foreground">
          {CAPABILITY_COPY.bannerBody}{' '}
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="underline underline-offset-2 text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {CAPABILITY_COPY.bannerLink}
          </button>
        </p>
        <button
          type="button"
          aria-label={CAPABILITY_COPY.bannerDismissLabel}
          onClick={dismiss}
          className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <CapabilityDetailDialog open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}

// ── The shared explanation card (B2 / B3 body) ───────────────────────────────

interface BlockedCardProps {
  headingId: string;
  heading: string;
  body: string;
  testId: string;
  headingRef?: React.RefObject<HTMLHeadingElement>;
}

/**
 * The `role="note"` explanation. `bg-card border-border`, 24px padding, `MonitorX` at
 * 20px in `text-muted-foreground`. Deliberately NOT `destructive` and deliberately NOT
 * `role="alert"` — an unsupported browser is a limitation, not a failure (UI-SPEC
 * § Color).
 */
function BlockedCard({
  headingId,
  heading,
  body,
  testId,
  headingRef,
}: BlockedCardProps): JSX.Element {
  return (
    <Card role="note" data-testid={testId} className="mt-4 border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <MonitorX className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold leading-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {heading}
          </h3>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">{body}</p>
          <Button asChild variant="outline" className="mt-4 min-h-11">
            <a href={SUPPORTED_BROWSERS_HREF}>{CAPABILITY_COPY.supportedBrowsersAction}</a>
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── B2 / B3 — the blocked entry points ───────────────────────────────────────

interface BlockedEntryPointProps {
  /**
   * The host page's EXISTING CTA label. Five pages reuse this control with five
   * different labels, and the control must keep its label, size and position.
   */
  label: ReactNode;
  /** The host page's existing CTA className, so size and position are preserved. */
  className?: string;
  /** Forwarded to the button, so a host page's layout wrapper still applies. */
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

function useBlockedEntryPoint(): {
  headingId: string;
  headingRef: React.RefObject<HTMLHeadingElement>;
  activate: (event: { preventDefault: () => void }) => void;
} {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  /**
   * THE MONEY-PATH GUARANTEE (XRUN-01). This returns before anything else can run:
   * no run is created, no Merit is reserved, no Stripe session or PaymentIntent is
   * requested, and no request of any kind is issued. The host page never wires its
   * own handler onto this control at all — the blocked control is a DIFFERENT
   * element from the live CTA, so there is no handler left to fire.
   */
  const activate = useCallback((event: { preventDefault: () => void }) => {
    event.preventDefault();
    headingRef.current?.focus();
  }, []);

  return { headingId, headingRef, activate };
}

/** Shared render for B2 and B3 — identical mechanics, different copy and testid. */
function BlockedEntryPoint({
  label,
  className,
  size,
  heading,
  body,
  testId,
}: BlockedEntryPointProps & {
  heading: string;
  body: string;
  testId: string;
}): JSX.Element {
  const { headingId, headingRef, activate } = useBlockedEntryPoint();

  return (
    <div>
      <Button
        type="button"
        size={size}
        // The host page's own classes are preserved so the control keeps its size and
        // position; `opacity-60` + `cursor-not-allowed` are what say "inert".
        className={[className, 'opacity-60 cursor-not-allowed'].filter(Boolean).join(' ')}
        // NOT `disabled` — see rule 2 in the file header.
        aria-disabled="true"
        aria-describedby={headingId}
        onClick={activate}
        onKeyDown={(event) => {
          // `aria-disabled` keeps the control focusable, so Enter and Space still
          // reach it and must be intercepted here too.
          if (event.key === 'Enter' || event.key === ' ') activate(event);
        }}
        data-capability-blocked="true"
      >
        {label}
      </Button>
      <BlockedCard
        headingId={headingId}
        heading={heading}
        body={body}
        testId={testId}
        headingRef={headingRef}
      />
    </div>
  );
}

/** B2 — the blocked AI start CTA. Used by all five AI features. */
export function BlockedAiEntryPoint(props: BlockedEntryPointProps): JSX.Element {
  return (
    <BlockedEntryPoint
      {...props}
      heading={CAPABILITY_COPY.analysisHeading}
      body={CAPABILITY_COPY.analysisBody}
      testId="capability-blocked-analysis"
    />
  );
}

/** B3 — the blocked checkout CTA. Used by Pricing and the top-up trigger. */
export function BlockedCheckoutEntryPoint(props: BlockedEntryPointProps): JSX.Element {
  return (
    <BlockedEntryPoint
      {...props}
      heading={CAPABILITY_COPY.checkoutHeading}
      body={CAPABILITY_COPY.checkoutBody}
      testId="capability-blocked-checkout"
    />
  );
}

/**
 * The B3 explanation with no CTA of its own, for surfaces whose trigger is a global
 * event rather than a button the gate can replace (the top-up flow). It stands in for
 * the payment dialog that would otherwise have opened, so the user gets the same
 * explanation without a session ever being created.
 */
export function BlockedCheckoutNotice(): JSX.Element {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <BlockedCard
      headingId={headingId}
      heading={CAPABILITY_COPY.checkoutHeading}
      body={CAPABILITY_COPY.checkoutBody}
      testId="capability-blocked-checkout"
      headingRef={headingRef}
    />
  );
}

// Host pages decide WHETHER to render these by calling `isAiBlocked()` /
// `useCheckoutCapability()` directly — no re-export lives here, so this file stays a
// components-only module.
