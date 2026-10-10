import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { LifecycleState } from '@/hooks/useAnalysisRun';

/**
 * AnalysisLockContext — global signal for "an analysis is currently running".
 *
 * Pages can call lock()/unlock() directly, but in practice the
 * <UniversalAnalyzing> component auto-locks on `isAnalyzing=true` and unlocks
 * on cleanup, so individual pages do NOT need to call these manually.
 *
 * The Navbar consumes `isLocked` to disable nav links + dropdown items while
 * an analysis is in progress, preventing the user from navigating away mid-run.
 *
 * Refcount semantics: lock()/unlock() are paired increments/decrements so
 * concurrent locks (e.g., a stream-path overlay re-mounting while a queue-path
 * polling overlay is also live) do not release the lock prematurely.
 */
interface AnalysisLockContextValue {
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;
  waitingSurface: AnalysisWaitingSurface | null;
  showWaitingSurface: (surface: AnalysisWaitingSurface) => void;
  hideWaitingSurface: (key: string) => void;
}

export interface AnalysisWaitingSurface {
  key: string;
  title: string;
  streamStageLabel?: string | null;
  lifecycleState?: LifecycleState | null;
  stageLabels?: readonly string[];
  activeStageIndex?: number;
  onContinueInBackground?: () => void;
}

const AnalysisLockContext = createContext<AnalysisLockContextValue | null>(null);

export function AnalysisLockProvider({ children }: { children: ReactNode }) {
  const [lockCount, setLockCount] = useState(0);
  const [waitingSurface, setWaitingSurface] = useState<AnalysisWaitingSurface | null>(null);
  const lock = useCallback(() => setLockCount((c) => c + 1), []);
  const unlock = useCallback(() => setLockCount((c) => Math.max(0, c - 1)), []);
  const showWaitingSurface = useCallback((surface: AnalysisWaitingSurface) => {
    setWaitingSurface((current) => {
      // CARRY-FORWARD — 2026-08-03, quick 260803-mqs.
      //
      // showWaitingSurface REPLACES the record. That is correct for a caller that
      // supplies its own ladder, but it meant a page ADOPTING an in-flight wait
      // (Results, mounting after Onboarding navigated) erased the ladder its
      // predecessor had seeded and dropped the user to the single-row fallback
      // mid-analysis. So: when an update targets the SAME key and supplies no
      // `stageLabels` of its own, the live ladder (and its index) survive.
      //
      // Inert for the polling/job-status path: `e2e/cross-device/waiting-surface.spec.ts`
      // OT-8 and `realtime-fallback.spec.ts` navigate straight to /results with NO
      // prior seed, so `current` is null, nothing is carried, and the single-row
      // 'Working on your analysis' surface renders exactly as before. Pinned as an
      // explicit negative control in AnalysisWaitingHost.test.tsx.
      const next: AnalysisWaitingSurface =
        current !== null &&
        current.key === surface.key &&
        surface.stageLabels === undefined &&
        current.stageLabels !== undefined
          ? {
              ...surface,
              stageLabels: current.stageLabels,
              activeStageIndex: current.activeStageIndex,
            }
          : surface;
      if (
        current?.key === next.key &&
        current.title === next.title &&
        current.streamStageLabel === next.streamStageLabel &&
        current.lifecycleState === next.lifecycleState
        && current.stageLabels === next.stageLabels
        && current.activeStageIndex === next.activeStageIndex
      ) {
        return current;
      }
      return next;
    });
  }, []);
  const hideWaitingSurface = useCallback((key: string) => {
    setWaitingSurface((current) => (current?.key === key ? null : current));
  }, []);
  return (
    <AnalysisLockContext.Provider
      value={{
        isLocked: lockCount > 0,
        lock,
        unlock,
        waitingSurface,
        showWaitingSurface,
        hideWaitingSurface,
      }}
    >
      {children}
    </AnalysisLockContext.Provider>
  );
}

export function useAnalysisLock() {
  const ctx = useContext(AnalysisLockContext);
  if (!ctx) throw new Error('useAnalysisLock must be used within AnalysisLockProvider');
  return ctx;
}
