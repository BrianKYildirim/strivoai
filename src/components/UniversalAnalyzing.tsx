import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAnalysisLock } from '@/contexts/AnalysisLockContext';
import type { LifecycleState } from '@/hooks/useAnalysisRun';
import {
  type AnalysisFeature,
  LIFECYCLE_STAGE_COPY,
  WAITING_SURFACE_COPY,
  resolveStageCopy,
} from '@/lib/analysis-stage-copy';
import { getClientErrorCopy } from '@/lib/client-error-taxonomy';

/**
 * VISUAL RESTORATION — 2026-08-03, quick 260803-hwm.
 *
 * The motion language below is the pre-July-29 loader (commit `0e5de83d`),
 * restored by explicit operator decision: drifting ambient blobs, a pulsing halo
 * and rotating conic border behind the header icon, orbiting particles,
 * staggered stage-row entrances, a spinning ring + pulsing centre on the active
 * step, a spring-scale tick on completed steps, and a glow layer behind the
 * progress bar.
 *
 * Three things from the intervening rewrites are deliberately NOT restored with
 * it, because they were the honest half of that change:
 *
 *   1. the asymptotic exponential progress curve and the fabricated percentage
 *      it rendered — a number that tracked elapsed time, not work done;
 *   2. the fabricated duration claim in the old default subtitle;
 *   3. the index-signature escape hatch on the props interface and the `steps`
 *      prop it hid (quick 260803-fxz); the ladder renders from `stageLabels`.
 *
 * `src/test/platform/universal-analyzing-source-guard.test.ts` holds all three,
 * by banning the exact tokens — so they must not reappear even in a comment.
 *
 * REDUCED MOTION is a hard constraint the original did not have. Every infinite
 * loop here sits behind its own `!prefersReducedMotion &&` and renders a STATIC
 * counterpart in the same position under `prefersReducedMotion`, so `reduce`
 * degrades the surface to a still image rather than collapsing it. Conditional
 * RENDERING is required, not `animate={cond ? … : undefined}`:
 * `e2e/cross-device/waiting-surface.spec.ts` counts live infinite animations in
 * the dialog subtree, and the source guard walks each occurrence for its gate.
 */

interface UniversalAnalyzingProps {
  isAnalyzing: boolean;
  title: string;
  icon?: React.ReactNode;
  feature?: AnalysisFeature;
  lifecycleState?: LifecycleState | null;
  streamStageLabel?: string | null;
  realtimeDegraded?: boolean;
  offline?: boolean;
  onRetryOffline?: () => void;
  onContinueInBackground?: () => void;
  stageLabels?: readonly string[];
  /**
   * The active row in `stageLabels`, when the caller has a REAL per-stage signal
   * (the resume stream, or the lifecycle machine). Deliberately has no default:
   * OMITTING it is what opts a surface into the sanctioned timed fallback below.
   * Supplying it always wins — a real signal is never overridden by the timer.
   */
  activeStageIndex?: number;
  // NO index signature. A `[legacyProp: string]: unknown` catch-all used to live
  // here and it silently swallowed the `steps` -> `stageLabels` rename: six
  // callers kept passing a prop that no longer existed, with no type error and no
  // runtime warning, and every one of them fell through to a bare spinner for
  // weeks (quick 260803-fxz). An unmigrated prop must be a compile error.
}

const THRESHOLDS = Object.freeze({
  reassuranceMs: 45_000,
  pollingMs: 120_000,
});

/**
 * Timed step advancement.
 *
 * Authorised by the operator on 2026-08-03 (quick 260803-fxz). Career Compass,
 * Recruiting Lens, LinkedIn Grader, Onboarding and Interview Prep emit NO
 * per-stage signal, so without this the stage ladder would be a frozen list.
 * Two hard limits keep the Phase 03 OT-7 honesty intent intact:
 *
 *   1. A real signal always takes precedence — the timer only runs when a caller
 *      supplies `stageLabels` AND omits `activeStageIndex`.
 *   2. It advances a STEP, never a fabricated percentage or duration claim. It
 *      also holds on the final step rather than completing early and idling on a
 *      finished-looking list while the run is still in flight.
 */
const STEP_ADVANCE_MS = 6_000;

/**
 * Ambient drifting blobs.
 *
 * The blur lives on a STATIC child of the transformed wrapper, never on the
 * animated element itself. That is both the cheap construction — a `blur-3xl`
 * layer is rasterised once and then only transform-composited — and what
 * `responsive-source-guard.test.ts` F6 requires ("no `blur-3xl` on an animated
 * element"). Restored 2026-08-03, quick 260803-hwm.
 */
function AmbientBlobs({ prefersReducedMotion }: { prefersReducedMotion: boolean | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {!prefersReducedMotion && (
        <motion.div
          animate={{ x: [0, 100, 0], y: [0, -50, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-1/4 top-1/4 h-64 w-64"
        >
          <div className="h-full w-full rounded-full bg-primary/10 blur-3xl" />
        </motion.div>
      )}
      {prefersReducedMotion && (
        <div className="absolute left-1/4 top-1/4 h-64 w-64">
          <div className="h-full w-full rounded-full bg-primary/10 blur-3xl" />
        </div>
      )}

      {!prefersReducedMotion && (
        <motion.div
          animate={{ x: [0, -80, 0], y: [0, 60, 0], scale: [1, 0.9, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-1/4 right-1/4 h-96 w-96"
        >
          <div className="h-full w-full rounded-full bg-primary/5 blur-3xl" />
        </motion.div>
      )}
      {prefersReducedMotion && (
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96">
          <div className="h-full w-full rounded-full bg-primary/5 blur-3xl" />
        </div>
      )}

      {/* The third blob's original hardcoded green is remapped to `bg-accent`. */}
      {!prefersReducedMotion && (
        <motion.div
          animate={{ x: [0, 50, 0], y: [0, -30, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute right-1/3 top-1/2 h-48 w-48"
        >
          <div className="h-full w-full rounded-full bg-accent/5 blur-3xl" />
        </motion.div>
      )}
      {prefersReducedMotion && (
        <div className="absolute right-1/3 top-1/2 h-48 w-48">
          <div className="h-full w-full rounded-full bg-accent/5 blur-3xl" />
        </div>
      )}
    </div>
  );
}

/** The header assembly: halo, conic spin, icon pulse and orbiting particles. */
function AnalyzingEmblem({
  icon,
  prefersReducedMotion,
}: {
  icon?: React.ReactNode;
  prefersReducedMotion: boolean | null;
}) {
  const glyph = icon ?? <Sparkles className="h-8 w-8" />;
  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Outer glow halo */}
      {!prefersReducedMotion && (
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 h-20 w-20 rounded-full bg-primary/20 blur-xl"
          aria-hidden="true"
        />
      )}
      {prefersReducedMotion && (
        <div
          className="absolute inset-0 h-20 w-20 rounded-full bg-primary/20 opacity-[0.45] blur-xl"
          aria-hidden="true"
        />
      )}

      {/* Rotating conic border */}
      {!prefersReducedMotion && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 h-20 w-20 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent, hsl(var(--primary)), transparent)',
          }}
          aria-hidden="true"
        />
      )}
      {prefersReducedMotion && (
        <div
          className="absolute inset-0 h-20 w-20 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent, hsl(var(--primary)), transparent)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Inner circle with the feature icon */}
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-primary/20 bg-gradient-to-br from-primary/20 to-primary/5 backdrop-blur-sm">
        {!prefersReducedMotion && (
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="text-primary"
          >
            {glyph}
          </motion.div>
        )}
        {prefersReducedMotion && <div className="text-primary">{glyph}</div>}
      </div>

      {/* Orbiting particles */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="pointer-events-none absolute h-28 w-28"
          style={{ transformOrigin: 'center center' }}
          aria-hidden="true"
        >
          {!prefersReducedMotion && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 4 + i, repeat: Infinity, ease: 'linear', delay: i * 0.5 }}
              className="absolute inset-0"
            >
              {!prefersReducedMotion && (
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute h-2 w-2 rounded-full bg-primary"
                  style={ORBIT_DOT_STYLE[i]}
                />
              )}
            </motion.div>
          )}
          {prefersReducedMotion && (
            <div className="absolute inset-0" style={{ transform: STATIC_ORBIT_ROTATION[i] }}>
              <div className="absolute h-2 w-2 rounded-full bg-primary" style={ORBIT_DOT_STYLE[i]} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Orbit dot placement, hoisted out of JSX so the percentage units live in a
 * plain style object rather than inline in the markup. They are CSS lengths, not
 * a progress claim — see the source guard's narrowed rendered-percentage rule.
 */
const ORBIT_DOT_STYLE: React.CSSProperties[] = [
  { top: '50%', left: '0%', transform: 'translate(-50%, -50%)' },
  { top: '50%', left: '100%', transform: 'translate(-50%, -50%)' },
  { top: '50%', left: '0%', transform: 'translate(-50%, -50%)' },
];

/** Fixed orbital angles so the static particles are distributed, not stacked. */
const STATIC_ORBIT_ROTATION = ['rotate(0deg)', 'rotate(120deg)', 'rotate(240deg)'];

/**
 * One stage row, shared by the `stageLabels` and `lifecycleEntries` ladders so
 * the two can never drift visually apart.
 */
function StageRow({
  label,
  state,
  index,
  prefersReducedMotion,
}: {
  label: string;
  state: 'completed' | 'active' | 'pending';
  index: number;
  prefersReducedMotion: boolean | null;
}) {
  const completed = state === 'completed';
  const active = state === 'active';
  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: completed || active ? 1 : 0.45, x: 0 }}
      transition={{ delay: index * 0.1 + 0.4 }}
      className={`relative flex items-center gap-4 rounded-2xl px-5 py-4 text-sm leading-[1.4] transition-all duration-500 ${
        active
          ? 'border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent font-medium text-foreground shadow-lg shadow-primary/5'
          : completed
            ? 'border border-primary/20 bg-primary/5 text-foreground/80'
            : 'border border-transparent bg-secondary/30 text-muted-foreground'
      }`}
    >
      {/* Active glow */}
      {active && !prefersReducedMotion && (
        <motion.div
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 -z-10 rounded-2xl bg-primary/5 blur-xl"
          aria-hidden="true"
        />
      )}
      {active && prefersReducedMotion && (
        <div
          className="absolute inset-0 -z-10 rounded-2xl bg-primary/5 blur-xl"
          aria-hidden="true"
        />
      )}

      {/* Step indicator */}
      <div className="relative shrink-0" aria-hidden="true">
        {completed ? (
          // 2026-08-03, quick 260803-mqs (D5): ONE completion colour per row. The
          // right-hand slot became a green tick, so leaving this badge coral would
          // read as two different states on the same row. The spring-scale entrance
          // is the 260803-hwm restoration and is unchanged — only the two colour
          // classes moved from `primary` to `success`.
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-success/20"
          >
            <CheckCircle2 className="h-5 w-5 text-success" />
          </motion.div>
        ) : active ? (
          <div className="relative h-8 w-8">
            {!prefersReducedMotion && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary"
              />
            )}
            {prefersReducedMotion && (
              <div className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary" />
            )}
            {!prefersReducedMotion && (
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="absolute inset-2 rounded-full bg-primary"
              />
            )}
            {prefersReducedMotion && (
              <div className="absolute inset-2 rounded-full bg-primary" />
            )}
          </div>
        ) : (
          // Dimmed, never invisible: five stage labels stay simultaneously
          // visible (`e2e/elite-rerun-merit.spec.ts`).
          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted-foreground/30">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          </div>
        )}
      </div>

      <span
        className={`flex-1 text-sm font-medium transition-colors duration-300 md:text-base ${
          active ? 'text-foreground' : completed ? 'text-foreground/80' : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>

      {completed && (
        <motion.span
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex shrink-0 items-center text-success"
        >
          {/* 2026-08-03, quick 260803-mqs: the visible word "Done" became a tick.
              The glyph is decorative; the completion state stays announced by the
              sr-only label, so this row is no less accessible than before. */}
          <Check className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Done</span>
        </motion.span>
      )}
    </motion.div>
  );
}

/**
 * A transport fallback can remount the overlay while the same run remains
 * active. Keep only its non-sensitive start timestamp so thresholds stay tied
 * to the run, not to the latest React mount. The entry is removed as soon as
 * the owning surface reports `isAnalyzing=false`.
 */
const activeWaitStartedAt = new Map<string, number>();

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
        'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('aria-hidden'));
}

export function UniversalAnalyzing({
  isAnalyzing,
  title,
  icon,
  feature = 'Resume Analysis',
  lifecycleState = null,
  streamStageLabel = null,
  realtimeDegraded = false,
  offline = false,
  onRetryOffline,
  onContinueInBackground,
  stageLabels,
  activeStageIndex,
}: UniversalAnalyzingProps) {
  const prefersReducedMotion = useReducedMotion();
  const { lock, unlock } = useAnalysisLock();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const previousOverflowRef = useRef('');
  const [dismissed, setDismissed] = useState(false);
  const [showReassurance, setShowReassurance] = useState(false);
  const [showPollingCopy, setShowPollingCopy] = useState(false);
  const [timedStageIndex, setTimedStageIndex] = useState(0);

  // Derived scalars, not the array itself: an inline literal from a caller would
  // otherwise change identity every render and restart the interval forever.
  const stageCount = stageLabels?.length ?? 0;
  const hasExternalStageIndex = activeStageIndex !== undefined;
  const resolvedStageIndex = Math.min(
    activeStageIndex ?? timedStageIndex,
    Math.max(stageCount - 1, 0),
  );

  const currentStageCopy = stageLabels?.[resolvedStageIndex] ?? resolveStageCopy({
    feature,
    lifecycleState,
    streamLabel: streamStageLabel,
  });
  const degradedCopy = getClientErrorCopy('CLIENT_REALTIME_DEGRADED');
  const offlineCopy = getClientErrorCopy('CLIENT_OFFLINE');

  // See STEP_ADVANCE_MS. Inert unless a caller supplies a ladder and no real index.
  useEffect(() => {
    if (!isAnalyzing || stageCount === 0 || hasExternalStageIndex) return;
    setTimedStageIndex(0);
    const id = window.setInterval(() => {
      setTimedStageIndex((i) => (i >= stageCount - 1 ? i : i + 1));
    }, STEP_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [isAnalyzing, stageCount, hasExternalStageIndex, title]);

  useEffect(() => {
    if (!isAnalyzing) {
      activeWaitStartedAt.delete(title);
      setDismissed(false);
      return;
    }
    const startedAt = activeWaitStartedAt.get(title) ?? Date.now();
    activeWaitStartedAt.set(title, startedAt);
    const elapsed = Date.now() - startedAt;
    setShowReassurance(elapsed >= THRESHOLDS.reassuranceMs);
    setShowPollingCopy(elapsed >= THRESHOLDS.pollingMs);
    const reassuranceTimer = window.setTimeout(
      () => setShowReassurance(true),
      Math.max(0, THRESHOLDS.reassuranceMs - elapsed),
    );
    const pollingTimer = window.setTimeout(
      () => setShowPollingCopy(true),
      Math.max(0, THRESHOLDS.pollingMs - elapsed),
    );
    return () => {
      window.clearTimeout(reassuranceTimer);
      window.clearTimeout(pollingTimer);
    };
  }, [isAnalyzing, title]);

  useEffect(() => {
    if (!isAnalyzing || dismissed) return;
    lock();
    return () => unlock();
  }, [dismissed, isAnalyzing, lock, unlock]);

  useEffect(() => {
    if (!isAnalyzing || dismissed) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflowRef.current;
      returnFocusRef.current?.focus();
    };
  }, [dismissed, isAnalyzing]);

  const dismiss = () => {
    document.body.style.overflow = previousOverflowRef.current;
    setDismissed(true);
    onContinueInBackground?.();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current ? focusableElements(dialogRef.current) : [];
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!isAnalyzing || dismissed) return null;

  const lifecycleEntries = lifecycleState
    ? Object.entries(LIFECYCLE_STAGE_COPY)
        .filter(([, entry]) => {
          const resolved = typeof entry === 'function' ? entry('') : entry;
          return resolved.shown;
        })
        .map(([state]) => state as LifecycleState)
    : [];
  const activeIndex = lifecycleState ? lifecycleEntries.indexOf(lifecycleState) : -1;
  const stepProgressValue = stageCount > 0 ? (resolvedStageIndex / stageCount) * 100 : 0;

  return (
    <AnimatePresence>
      <motion.div
        ref={dialogRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex min-h-viewport items-center justify-center bg-background/98 p-4 outline-none backdrop-blur-md md:p-8"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <AmbientBlobs prefersReducedMotion={prefersReducedMotion} />

        <div className="relative z-10 w-full max-w-xl space-y-8">
          <div className="space-y-4 text-center">
            <AnalyzingEmblem icon={icon} prefersReducedMotion={prefersReducedMotion} />
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold leading-tight text-foreground md:text-3xl"
            >
              {title}
            </motion.h2>
          </div>

          {/*
            The one and only announcement source. The restored decorative copy
            below is deliberately NOT `aria-live` — a second live region would
            make the surface talk over itself.
          */}
          <p aria-live="polite" className="sr-only">
            {currentStageCopy}
          </p>

          <div className="space-y-3" data-testid="analysis-stage-list">
            {stageLabels && stageLabels.length > 0 ? (
              stageLabels.map((label, index) => (
                <StageRow
                  key={label}
                  label={label}
                  index={index}
                  state={
                    index < resolvedStageIndex
                      ? 'completed'
                      : index === resolvedStageIndex
                        ? 'active'
                        : 'pending'
                  }
                  prefersReducedMotion={prefersReducedMotion}
                />
              ))
            ) : lifecycleEntries.length > 0 ? (
              lifecycleEntries.map((state, index) => (
                <StageRow
                  key={state}
                  label={resolveStageCopy({ feature, lifecycleState: state }) ?? ''}
                  index={index}
                  state={
                    index < activeIndex
                      ? 'completed'
                      : index === activeIndex
                        ? 'active'
                        : 'pending'
                  }
                  prefersReducedMotion={prefersReducedMotion}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent px-5 py-4 text-sm leading-[1.4] text-foreground">
                {currentStageCopy}
              </div>
            )}
          </div>

          {/*
            Determinate bar: completed steps over total steps, plus the restored
            duplicated glow layer. Deliberately carries NO numeric label — OT-7
            bans a rendered percentage — and is aria-hidden so the single
            aria-live region stays the only announcement source.
          */}
          {stageCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="space-y-3"
              aria-hidden="true"
            >
              <div className="relative">
                <Progress
                  value={stepProgressValue}
                  className="h-2 bg-secondary/50"
                  aria-hidden="true"
                />
                {!prefersReducedMotion && (
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="pointer-events-none absolute inset-0 blur-sm"
                  >
                    <Progress
                      value={stepProgressValue}
                      className="h-2 bg-transparent"
                      aria-hidden="true"
                    />
                  </motion.div>
                )}
                {prefersReducedMotion && (
                  <div className="pointer-events-none absolute inset-0 blur-sm">
                    <Progress
                      value={stepProgressValue}
                      className="h-2 bg-transparent"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Processing...</p>
            </motion.div>
          )}

          {realtimeDegraded && (
            <p role="status" className="text-sm text-muted-foreground">
              {degradedCopy.heading}. {degradedCopy.body}
            </p>
          )}
          {offline && (
            <div role="status" className="space-y-2 text-sm text-muted-foreground">
              <p>{offlineCopy.heading}. {offlineCopy.body}</p>
              {onRetryOffline && (
                <Button variant="secondary" onClick={onRetryOffline}>
                  {offlineCopy.affordance.secondary?.label}
                </Button>
              )}
            </div>
          )}
          {showReassurance && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">{WAITING_SURFACE_COPY.reassurance}</p>
              {/* Frozen label: Continue in the background */}
              <Button variant="ghost" onClick={dismiss}>
                {WAITING_SURFACE_COPY.continueInBackground}
              </Button>
            </div>
          )}
          {showPollingCopy && (
            <p className="text-sm text-muted-foreground">{WAITING_SURFACE_COPY.polling}</p>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="pt-4 text-center"
            aria-hidden="true"
          >
            <p className="text-xs text-muted-foreground/60">
              <Sparkles className="mr-1 inline h-3 w-3" />
              AI is analyzing your profile with precision
            </p>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
