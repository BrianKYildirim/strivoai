/**
 * OutcomeOverdueBanner — self-hiding dashboard banner.
 *
 * Fetches applications older than 14 days that have no outcomes row (client-side
 * LEFT JOIN via Postgres FK embed). If count === 0, returns null (self-hides).
 *
 * Future planner-discretion follow-up: promote to a VIEW `applications_overdue` or
 * SECURITY-DEFINER RPC if EXPLAIN ANALYZE > 100ms at expected scale (RESEARCH §Open Q #3).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

const OVERDUE_THRESHOLD_DAYS = 14;

export default function OutcomeOverdueBanner() {
  const [overdueCount, setOverdueCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchOverdue = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const cutoffDate = new Date(Date.now() - OVERDUE_THRESHOLD_DAYS * 86400000)
          .toISOString()
          .slice(0, 10);

        const { data, error } = await supabase
          .from("applications")
          .select("id, outcomes(id)")
          .eq("user_id", user.id)
          .lt("application_date", cutoffDate);

        if (error || !data || cancelled) return;

        // outcomes is embedded as an array via FK; empty array means no outcome (LEFT JOIN)
        const overdue = (data as Array<{ id: string; outcomes: Array<{ id: string }> }>).filter(
          (row) => row.outcomes.length === 0,
        );

        setOverdueCount(overdue.length);
      } catch (error) {
        // A thrown query chain (e.g. an incomplete mock missing `.lt`) must not
        // escape as an unhandled promise rejection that crashes a neighboring
        // test worker. Fall back to the same self-hidden state the resolved-error
        // path already produces (benign no-op).
        console.error("[OutcomeOverdueBanner] overdue fetch failed:", error);
        if (!cancelled) setOverdueCount(0);
      }
    };

    void fetchOverdue();

    return () => {
      cancelled = true;
    };
  }, []);

  // Self-hide until data loaded and count > 0
  if (overdueCount === null || overdueCount === 0) return null;

  const noun = overdueCount === 1 ? "application" : "applications";

  return (
    <Alert className="mb-6 border-destructive/30 bg-destructive/5">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <AlertDescription>
        <div className="flex flex-col gap-3 pr-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">
            {overdueCount} {noun} overdue for an outcome update
          </p>
          <Button asChild size="sm" variant="destructive" className="w-fit">
            <Link to="/applications?filter=overdue">Report now</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
