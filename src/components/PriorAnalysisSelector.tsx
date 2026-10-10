import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { format } from "date-fns";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import { PriorSelectorEmptyState } from "@/components/PriorSelectorEmptyState";
import { PriorSelectorSkeleton } from "@/components/PriorSelectorSkeleton";

export interface ResumePriorAnalysis {
  id: string;
  fileName: string;
  analyzedAt: string;
  overallScore: number;
  gradingData: Record<string, unknown>;
  filePath?: string | null;
}

interface PriorAnalysisSelectorProps {
  onSelect: (prior: ResumePriorAnalysis) => void;
  emptyState?: ReactNode;
  onEmptyChange?: (empty: boolean) => void;
}

interface ResumePriorRow {
  id: string;
  file_name?: string | null;
  analyzed_at?: string | null;
  created_at?: string | null;
  overall_score?: number | null;
  grading_data?: Record<string, unknown> | null;
  file_path?: string | null;
}

const truncateIdentifier = (value: string): string =>
  value.length > 32 ? `${value.slice(0, 32)}...` : value;

const formatDate = (value: string): string => format(new Date(value), "MMM d, yyyy");

export function PriorAnalysisSelector({
  onSelect,
  emptyState,
  onEmptyChange,
}: PriorAnalysisSelectorProps) {
  const [loading, setLoading] = useState(true);
  const [priors, setPriors] = useState<ResumePriorAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const emittedSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchPriors = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setPriors([]);
            onEmptyChange?.(true);
          }
          return;
        }

        const { data, error } = await supabase
          .from("resumes")
          .select("id, file_name, analyzed_at, created_at, overall_score, grading_data, file_path")
          .eq("user_id", user.id)
          .not("grading_data", "is", null)
          .order("analyzed_at", { ascending: false, nullsFirst: false })
          .limit(10);

        if (error) {
          console.warn("[PriorAnalysisSelector] prior fetch failed", error);
          if (!cancelled) {
            setPriors([]);
            onEmptyChange?.(true);
          }
          return;
        }

        const normalized = ((data ?? []) as ResumePriorRow[])
          .filter((row) => row.grading_data)
          .map((row) => ({
            id: row.id,
            fileName: row.file_name || "Resume analysis",
            analyzedAt: row.analyzed_at || row.created_at || new Date().toISOString(),
            overallScore: row.overall_score ?? (row.grading_data?.overallScore as number | undefined) ?? 0,
            gradingData: row.grading_data ?? {},
            filePath: row.file_path,
          }));

        if (!cancelled) {
          setPriors(normalized);
          onEmptyChange?.(normalized.length === 0);
        }
      } catch (error) {
        console.warn("[PriorAnalysisSelector] prior fetch failed", error);
        if (!cancelled) {
          setPriors([]);
          onEmptyChange?.(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPriors();

    return () => {
      cancelled = true;
    };
  }, [onEmptyChange]);

  const selectedPrior = useMemo(
    () => priors.find((prior) => prior.id === selectedId) ?? priors[0],
    [priors, selectedId],
  );

  useEffect(() => {
    if (!selectedPrior) return;
    if (!selectedId) setSelectedId(selectedPrior.id);
    if (emittedSelectionRef.current === selectedPrior.id) return;
    emittedSelectionRef.current = selectedPrior.id;
    onSelect(selectedPrior);
  }, [selectedPrior, selectedId, onSelect]);

  if (loading) {
    return (
      <div aria-live="polite">
        <PriorSelectorSkeleton />
      </div>
    );
  }

  if (priors.length === 0) {
    return (
      <>
        {emptyState ?? (
          <PriorSelectorEmptyState
            headingText="No resume analysis found"
            bodyText="Analyze your resume first."
            ctaLabel="Analyze My Resume"
            ctaHref="/upload"
            blocking
          />
        )}
      </>
    );
  }

  return (
    <div aria-live="polite">
      <Label htmlFor="prior-resume-analysis" className="text-sm font-medium mb-2 block">
        Use a prior resume analysis
      </Label>
      <Select
        value={selectedPrior?.id ?? ""}
        onValueChange={(value) => {
          setSelectedId(value);
          const prior = priors.find((item) => item.id === value);
          if (prior) {
            emittedSelectionRef.current = prior.id;
            onSelect(prior);
          }
        }}
      >
        <SelectTrigger id="prior-resume-analysis" aria-label="Use a prior resume analysis">
          <SelectValue placeholder="Select a resume analysis">
            {selectedPrior ? `${truncateIdentifier(selectedPrior.fileName)} - ${formatDate(selectedPrior.analyzedAt)}` : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {priors.map((prior) => (
            <SelectItem key={prior.id} value={prior.id}>
              <div className="flex w-full min-w-0 items-center gap-2">
                <span className="text-sm font-semibold truncate">{truncateIdentifier(prior.fileName)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(prior.analyzedAt)}</span>
                <span className="ml-auto rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {prior.overallScore}/100
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
