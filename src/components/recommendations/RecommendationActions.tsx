import { useState, useCallback } from "react";
import { Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

// Recommendation row shape from generated types
export interface Recommendation {
  id: string;
  feature: string;
  user_id: string;
  source_version_id: string | null;
  suggestion_text: string;
  suggestion_type: string;
  target_ref_id: string | null;
  target_ref_type: string | null;
  shown_at: string | null;
  created_at: string;
}

interface BulletRef {
  id: string;
  score: number | null;
}

interface RecommendationActionsProps {
  recommendation: Recommendation | undefined;
  bullet?: BulletRef;
}

type Mode = "idle" | "editing" | "submitting";

const RecommendationActions = ({ recommendation, bullet }: RecommendationActionsProps) => {
  const [mode, setMode] = useState<Mode>("idle");
  const [editText, setEditText] = useState("");

  // useCallback must be called unconditionally before any early return (rules of hooks)
  const writeEdit = useCallback(
    async (action: "accepted" | "rejected" | "edited", finalUserText?: string) => {
      if (!recommendation) return;
      try {
        setMode("submitting");
        const { error } = await supabase.from("user_edits").insert({
          rec_id: recommendation.id,
          action,
          original_text: bullet ? undefined : recommendation.suggestion_text,
          suggested_text: recommendation.suggestion_text,
          score_before: bullet?.score ?? null,
          score_after: bullet?.score ?? null,
          ...(finalUserText !== undefined ? { final_user_text: finalUserText } : {}),
        });
        if (error) throw error;
        toast.success(
          action === "accepted"
            ? "Suggestion accepted"
            : action === "rejected"
              ? "Suggestion dismissed"
              : "Edit saved",
        );
      } catch (err) {
        console.error("[RecommendationActions] write failed", err);
        toast.error("Could not save your response. Please try again.");
      } finally {
        setMode("idle");
      }
    },
    [recommendation, bullet],
  );

  // Empty-state guard: pre-Phase-42 analyses have no recommendation row
  if (!recommendation) return null;

  const handleAccept = () => {
    void writeEdit("accepted");
  };

  const handleReject = () => {
    void writeEdit("rejected");
  };

  const handleEditToggle = () => {
    setEditText(recommendation.suggestion_text);
    setMode("editing");
  };

  const handleSave = () => {
    void writeEdit("edited", editText);
    setMode("idle");
  };

  const handleCancel = () => {
    setMode("idle");
    setEditText("");
  };

  const isSubmitting = mode === "submitting";

  if (mode === "editing") {
    return (
      <div className="mt-2 space-y-2">
        <Textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="min-h-[80px] text-sm"
          aria-label="Edit suggestion"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleSave}
            disabled={isSubmitting || !editText.trim()}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
        onClick={handleAccept}
        disabled={isSubmitting}
        aria-label="Accept suggestion"
        title="Accept"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
        onClick={handleReject}
        disabled={isSubmitting}
        aria-label="Reject suggestion"
        title="Reject"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-muted-foreground hover:text-foreground hover:bg-muted"
        onClick={handleEditToggle}
        disabled={isSubmitting}
        aria-label="Edit suggestion"
        title="Edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

export default RecommendationActions;
