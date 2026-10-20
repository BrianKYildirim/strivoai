import { useRef, useCallback } from 'react';

/**
 * Hook to prevent duplicate analysis calls.
 * Returns a guard function that ensures only one analysis runs at a time.
 */
export function useAnalysisGuard() {
  const isRunningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startAnalysis = useCallback(async <T>(
    analysisFunc: (signal?: AbortSignal) => Promise<T>
  ): Promise<{ success: boolean; data?: T; error?: string }> => {
    // Prevent duplicate calls
    if (isRunningRef.current) {
      return { success: false, error: 'Analysis already in progress' };
    }

    isRunningRef.current = true;
    abortControllerRef.current = new AbortController();

    try {
      const result = await analysisFunc(abortControllerRef.current.signal);
      return { success: true, data: result };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Analysis was cancelled' };
      }
      return { success: false, error: error.message || 'Analysis failed' };
    } finally {
      isRunningRef.current = false;
      abortControllerRef.current = null;
    }
  }, []);

  const cancelAnalysis = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const isRunning = useCallback(() => isRunningRef.current, []);

  return { startAnalysis, cancelAnalysis, isRunning };
}
