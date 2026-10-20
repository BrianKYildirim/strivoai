import { useEffect, useState } from "react";
import { GraduationCap, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useUserTargets } from "@/hooks/useUserTargets";

const DISMISS_KEY = "cohort_backfill_banner_dismissed_v1";

function readDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage?.setItem(DISMISS_KEY, "1");
  } catch {
    // Non-critical preference persistence can fail in restricted test/browser contexts.
  }
}

export default function CohortBackfillBanner() {
  const { profile, loading } = useUserTargets();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(readDismissed());
  }, []);

  if (loading || hidden || profile?.school) return null;

  return (
    <Alert className="mb-6 border-primary/30 bg-primary/5">
      <GraduationCap className="h-5 w-5 text-primary" />
      <AlertDescription>
        <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">
            Help us benchmark you — add your school, major, and graduation year.
          </p>
          <Button asChild size="sm" className="w-fit">
            <Link to="/profile#education-targets">Add details</Link>
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Dismiss cohort backfill banner"
          className="absolute right-2 top-2 h-8 w-8"
          onClick={() => {
            writeDismissed();
            setHidden(true);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
