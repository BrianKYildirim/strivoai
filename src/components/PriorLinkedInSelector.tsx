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

export interface LinkedInPriorSource {
  id: string;
  sourceType: "onboarding_pdf" | "linkedin_grade";
  identifier: string;
  createdAt: string;
  overallScore: number | null;
  content?: string | null;
  gradingData?: Record<string, unknown> | null;
}

interface PriorLinkedInSelectorProps {
  onSelect: (source: LinkedInPriorSource) => void;
  emptyState?: ReactNode;
  onEmptyChange?: (empty: boolean) => void;
}

interface ProfileLinkedInRow {
  linkedin_pdf_content?: string | null;
  linkedin_pdf_filename?: string | null;
  linkedin_pdf_updated_at?: string | null;
}

interface LinkedInGradeRow {
  id: string;
  overall_score?: number | null;
  grading_data?: Record<string, unknown> | null;
  created_at?: string | null;
  profile_url?: string | null;
}

const truncateIdentifier = (value: string): string =>
  value.length > 32 ? `${value.slice(0, 32)}...` : value;

const formatDate = (value: string): string => format(new Date(value), "MMM d, yyyy");

const hasUsableV3Grade = (gradingData: Record<string, unknown> | null | undefined): boolean => {
  if (!gradingData) return false;
  const rawScore = gradingData.rawScore;
  const sectionBreakdown = gradingData.sectionBreakdown;
  return typeof rawScore === "number" && Array.isArray(sectionBreakdown);
};

export function PriorLinkedInSelector({
  onSelect,
  emptyState,
  onEmptyChange,
}: PriorLinkedInSelectorProps) {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<LinkedInPriorSource[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const emittedSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSources = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setSources([]);
            onEmptyChange?.(true);
          }
          return;
        }

        const [profileResult, gradesResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("linkedin_pdf_content, linkedin_pdf_filename, linkedin_pdf_updated_at")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("linkedin_grades")
            .select("id, overall_score, grading_data, created_at, profile_url")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(10),
        ]);

        if (profileResult.error || gradesResult.error) {
          console.warn("[PriorLinkedInSelector] prior fetch failed", profileResult.error || gradesResult.error);
        }

        const profile = profileResult.data as ProfileLinkedInRow | null;
        const merged: LinkedInPriorSource[] = [];

        if (profile?.linkedin_pdf_content) {
          const createdAt = profile.linkedin_pdf_updated_at || new Date().toISOString();
          merged.push({
            id: "onboarding-pdf",
            sourceType: "onboarding_pdf",
            identifier: profile.linkedin_pdf_filename || `LinkedIn profile (uploaded ${formatDate(createdAt)})`,
            createdAt,
            overallScore: null,
            content: profile.linkedin_pdf_content,
          });
        }

        ((gradesResult.data ?? []) as LinkedInGradeRow[])
          .filter((row) => hasUsableV3Grade(row.grading_data))
          .forEach((row) => {
            const createdAt = row.created_at || new Date().toISOString();
            const label = row.profile_url || `LinkedIn profile ${formatDate(createdAt)}`;
            merged.push({
              id: row.id,
              sourceType: "linkedin_grade",
              identifier: label,
              createdAt,
              overallScore: row.overall_score ?? (row.grading_data?.rawScore as number | undefined) ?? null,
              gradingData: row.grading_data ?? null,
              content: typeof row.grading_data?.profileContent === "string" ? row.grading_data.profileContent : null,
            });
          });

        const sorted = merged.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

        if (!cancelled) {
          setSources(sorted);
          onEmptyChange?.(sorted.length === 0);
        }
      } catch (error) {
        console.warn("[PriorLinkedInSelector] prior fetch failed", error);
        if (!cancelled) {
          setSources([]);
          onEmptyChange?.(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchSources();

    return () => {
      cancelled = true;
    };
  }, [onEmptyChange]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedId) ?? sources[0],
    [sources, selectedId],
  );

  useEffect(() => {
    if (!selectedSource) return;
    if (!selectedId) setSelectedId(selectedSource.id);
    if (emittedSelectionRef.current === selectedSource.id) return;
    emittedSelectionRef.current = selectedSource.id;
    onSelect(selectedSource);
  }, [selectedSource, selectedId, onSelect]);

  if (loading) {
    return (
      <div aria-live="polite">
        <PriorSelectorSkeleton />
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <>
        {emptyState ?? (
          <PriorSelectorEmptyState
            headingText="No LinkedIn source yet"
            bodyText="Add your LinkedIn for richer output - optional."
            ctaLabel="Add LinkedIn"
            ctaHref="/linkedin-grader"
            blocking={false}
          />
        )}
      </>
    );
  }

  return (
    <div aria-live="polite">
      <Label htmlFor="prior-linkedin-source" className="text-sm font-medium mb-2 block">
        Use a prior LinkedIn source
      </Label>
      <Select
        value={selectedSource?.id ?? ""}
        onValueChange={(value) => {
          setSelectedId(value);
          const source = sources.find((item) => item.id === value);
          if (source) {
            emittedSelectionRef.current = source.id;
            onSelect(source);
          }
        }}
      >
        <SelectTrigger id="prior-linkedin-source" aria-label="Use a prior LinkedIn source">
          <SelectValue placeholder="Select a LinkedIn source">
            {selectedSource ? `${truncateIdentifier(selectedSource.identifier)} - ${formatDate(selectedSource.createdAt)}` : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {sources.map((source) => (
            <SelectItem key={source.id} value={source.id}>
              <div className="flex w-full min-w-0 items-center gap-2">
                <span className="text-sm font-semibold truncate">{truncateIdentifier(source.identifier)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(source.createdAt)}</span>
                <span className="ml-auto rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {source.overallScore == null ? "-" : `${source.overallScore}/100`}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
