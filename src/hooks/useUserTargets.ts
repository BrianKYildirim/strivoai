import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import type { Database } from "@/integrations/supabase/types";

type ProfileTargetFields = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "school" | "major" | "year" | "graduation_year" | "location_preference"
>;

type CareerTargetsRow = Database["public"]["Tables"]["career_targets"]["Row"];

interface UserTargetsState {
  profile: ProfileTargetFields | null;
  targets: CareerTargetsRow | null;
  loading: boolean;
  error: string | null;
}

export function useUserTargets(): UserTargetsState & { refresh: () => void } {
  const [state, setState] = useState<UserTargetsState>({
    profile: null,
    targets: null,
    loading: true,
    error: null,
  });
  const [refreshIndex, setRefreshIndex] = useState(0);

  const refresh = useCallback(() => {
    setRefreshIndex((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTargets(): Promise<void> {
      setState((current) => ({ ...current, loading: true, error: null }));

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error("Not authenticated");

        const [profileResult, targetsResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, school, major, year, graduation_year, location_preference")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("career_targets")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        if (profileResult.error) throw profileResult.error;
        if (targetsResult.error) throw targetsResult.error;

        if (!cancelled) {
          setState({
            profile: profileResult.data,
            targets: targetsResult.data,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Failed to load user targets";
          setState({
            profile: null,
            targets: null,
            loading: false,
            error: message,
          });
        }
      }
    }

    void loadTargets();

    return () => {
      cancelled = true;
    };
  }, [refreshIndex]);

  return {
    ...state,
    refresh,
  };
}

export type { CareerTargetsRow, ProfileTargetFields };
