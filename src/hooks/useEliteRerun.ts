import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeatureCosts, getCostForFeature } from '@/hooks/useFeatureCosts';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';

const LEASE_TTL_MS = 15 * 60 * 1000;
const MAX_LEASE_REUSES = 3;
const LEASE_PREFIX = 'elite_unlock_';
const leaseKey = (sourceResumeId: string): string => `${LEASE_PREFIX}${sourceResumeId}`;

export interface EliteUnlockLease {
  sourceResumeId: string;
  baseAnalysisId: string | null;
  createdAt: number;
  reuses: number;
}

export interface EliteRerunSource {
  id: string;
  user_id?: string;
  file_name?: string;
  file_url?: string;
  file_path?: string | null;
  file_hash?: string | null;
  file_size?: number;
  extracted_text?: string | null;
  text_hash?: string | null;
  grading_data?: unknown;
  overall_score?: number | null;
}

function readLease(sourceResumeId: string): EliteUnlockLease | null {
  try {
    const raw = localStorage.getItem(leaseKey(sourceResumeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EliteUnlockLease;
    if (!parsed || parsed.sourceResumeId !== sourceResumeId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearEliteRerunRecord(sourceResumeId: string): void {
  try {
    localStorage.removeItem(leaseKey(sourceResumeId));
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}

/** Backward-compatible export; the unlock now uses the same source resume ID. */
export function clearEliteRerunLeaseByNewResumeId(sourceResumeId: string): void {
  clearEliteRerunRecord(sourceResumeId);
}

export function useEliteRerun(): {
  startEliteRerun: (sourceResume: EliteRerunSource, baseAnalysisId?: string | null) => Promise<void>;
  isStarting: boolean;
  error: string | null;
} {
  const navigate = useNavigate();
  const { data: featureCosts } = useFeatureCosts();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitGuard = useSubmitGuard({
    feature: 'elite-resume-unlock',
    inputIdentity: 'same-row-unlock',
  });

  const startEliteRerun = useCallback(
    async (sourceResume: EliteRerunSource, baseAnalysisId: string | null = null): Promise<void> => {
      const submitToken = submitGuard.beginRerun(sourceResume.id);
      if (!submitToken) return;
      setError(null);
      setIsStarting(true);
      try {
        const meritCost = getCostForFeature(featureCosts, 'resume_analysis', 'elite') ?? 0;
        const existing = readLease(sourceResume.id);
        const withinBounds =
          !!existing &&
          existing.reuses < MAX_LEASE_REUSES &&
          Date.now() - existing.createdAt < LEASE_TTL_MS &&
          existing.baseAnalysisId === baseAnalysisId;
        const lease: EliteUnlockLease = withinBounds
          ? { ...existing, reuses: existing.reuses + 1 }
          : {
            sourceResumeId: sourceResume.id,
            baseAnalysisId,
            createdAt: Date.now(),
            reuses: 0,
          };

        localStorage.setItem(leaseKey(sourceResume.id), JSON.stringify(lease));
        sessionStorage.setItem(
          `stream_params_${sourceResume.id}`,
          JSON.stringify({
            mode: 'elite_unlock',
            resumeId: sourceResume.id,
            ...(baseAnalysisId ? { baseAnalysisId } : {}),
            meritCost,
          }),
        );
        navigate(`/results/${sourceResume.id}?stream=true&unlock=${lease.createdAt}`, { replace: true });
      } catch {
        const message = 'We couldn\u2019t start the Elite unlock. Your Free analysis is unchanged.';
        setError(message);
      } finally {
        setIsStarting(false);
        submitGuard.endSubmit(submitToken, { resetAttempt: false });
      }
    },
    [featureCosts, navigate, submitGuard],
  );

  return { startEliteRerun, isStarting, error };
}
