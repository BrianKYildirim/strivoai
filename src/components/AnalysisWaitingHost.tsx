import { UniversalAnalyzing } from '@/components/UniversalAnalyzing';
import { useAnalysisLock } from '@/contexts/AnalysisLockContext';

/**
 * Persistent route-independent owner for an in-flight analysis wait.
 *
 * Upload starts the surface and Results adopts it by updating the same context
 * record. Because this host lives above Routes, navigation never replaces the
 * dialog DOM node and one attempt cannot paint a second overlay.
 */
export function AnalysisWaitingHost() {
  const { waitingSurface } = useAnalysisLock();

  if (!waitingSurface) return null;

  return (
    <UniversalAnalyzing
      isAnalyzing
      title={waitingSurface.title}
      streamStageLabel={waitingSurface.streamStageLabel}
      lifecycleState={waitingSurface.lifecycleState}
      stageLabels={waitingSurface.stageLabels}
      activeStageIndex={waitingSurface.activeStageIndex}
      onContinueInBackground={waitingSurface.onContinueInBackground}
    />
  );
}
