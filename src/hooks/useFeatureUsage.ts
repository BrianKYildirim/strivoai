import { useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

type FeatureId =
  | "resume_analysis"
  | "linkedin_grading"
  | "career_compass"
  | "recruiting_lens";

type FeatureAction = "open" | "submit" | "view_results" | "export";

/**
 * Telemetry hook for recording feature usage events.
 *
 * Uses a per-mount useRef Set to dedup rapid double-fires (RESEARCH Pitfall 6).
 * Each (feature, action) pair is sent at most once per component mount lifecycle.
 * RPC errors are logged as warnings and never thrown.
 */
export function useFeatureUsage(feature: FeatureId): {
  recordEvent: (action: FeatureAction) => void;
} {
  const firedRef = useRef<Set<string>>(new Set());

  const recordEvent = useCallback(
    (action: FeatureAction) => {
      const key = `${feature}:${action}`;
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);

      supabase
        .rpc("record_feature_usage", { p_feature: feature, p_action: action })
        .then(({ error }) => {
          if (error) {
            console.warn("[useFeatureUsage]", feature, action, error);
          }
        });
    },
    [feature],
  );

  return { recordEvent };
}
