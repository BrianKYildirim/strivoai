import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";

const schema = z.object({
  result: z.enum(["rejected", "interview", "offer", "withdrawn", "ghosted"]),
  rejection_stage: z
    .enum(["resume_screen", "phone_screen", "technical_screen", "onsite", "offer_stage", "other"])
    .optional(),
  interview_rounds: z.coerce.number().int().min(0).max(20).optional(),
  offer_received: z.boolean().default(false),
  final_outcome_date: z.string().optional(),
  outcome_confidence_score: z.number().min(0).max(100).default(80),
});

// @hookform/resolvers v5 splits the resolver's input vs output types: zod
// `.default()` fields are optional on INPUT but present on OUTPUT, so `useForm`
// must be typed with both (input = z.input, output = z.output). Runtime behavior
// is unchanged — this is a type-only adaptation to the v5 resolver signature.
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

interface ReportOutcomeDialogProps {
  applicationId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function ReportOutcomeDialog({
  applicationId,
  onOpenChange,
  onSaved,
}: ReportOutcomeDialogProps) {
  const [saving, setSaving] = useState(false);
  const [confidenceScore, setConfidenceScore] = useState(80);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      offer_received: false,
      outcome_confidence_score: 80,
    },
  });

  const result = watch("result");
  const offerReceived = watch("offer_received");

  // Prefetch existing outcome for upsert-edit flow
  useEffect(() => {
    if (!applicationId) return;

    const fetchExisting = async () => {
      const { data } = await supabase
        .from("outcomes")
        .select("*")
        .eq("application_id", applicationId)
        .maybeSingle();

      if (data) {
        setValue("result", data.result as FormValues["result"]);
        setValue("rejection_stage", data.rejection_stage as FormValues["rejection_stage"]);
        setValue("interview_rounds", data.interview_rounds ?? undefined);
        setValue("offer_received", data.offer_received ?? false);
        setValue("final_outcome_date", data.final_outcome_date ?? undefined);
        const score = data.outcome_confidence_score ?? 80;
        setValue("outcome_confidence_score", score);
        setConfidenceScore(score);
      }
    };

    void fetchExisting();
  }, [applicationId, setValue]);

  const onSubmit = async (values: FormValues) => {
    if (!applicationId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("outcomes").upsert(
        {
          application_id: applicationId,
          result: values.result,
          rejection_stage: values.result === "rejected" ? (values.rejection_stage ?? null) : null,
          interview_rounds: values.interview_rounds ?? null,
          offer_received: values.offer_received,
          final_outcome_date: values.final_outcome_date || null,
          outcome_confidence_score: values.outcome_confidence_score,
          outcome_source: "self_reported",
        },
        { onConflict: "application_id" },
      );

      if (error) throw error;

      toast.success("Outcome saved!");
      reset();
      onOpenChange(false);
      onSaved();
    } catch (error) {
      console.error("[ReportOutcomeDialog] Error:", error);
      toast.error("Failed to save outcome. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!applicationId) return null;

  return (
    <Dialog open={!!applicationId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report Outcome</DialogTitle>
          <DialogDescription>
            Record the result of this application. Re-submitting will update the existing outcome.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label>Result *</Label>
            <Select onValueChange={(val) => setValue("result", val as FormValues["result"])}>
              <SelectTrigger>
                <SelectValue placeholder="Select result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interview">Got Interview</SelectItem>
                <SelectItem value="offer">Received Offer</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="withdrawn">Withdrawn</SelectItem>
                <SelectItem value="ghosted">Ghosted</SelectItem>
              </SelectContent>
            </Select>
            {errors.result && (
              <p className="text-sm text-destructive">{errors.result.message}</p>
            )}
          </div>

          {result === "rejected" && (
            <div className="space-y-1">
              <Label>Rejection Stage</Label>
              <Select
                onValueChange={(val) =>
                  setValue("rejection_stage", val as FormValues["rejection_stage"])
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resume_screen">Resume Screen</SelectItem>
                  <SelectItem value="phone_screen">Phone Screen</SelectItem>
                  <SelectItem value="technical_screen">Technical Screen</SelectItem>
                  <SelectItem value="onsite">Onsite</SelectItem>
                  <SelectItem value="offer_stage">Offer Stage</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="interview_rounds">Interview Rounds</Label>
            <Input
              id="interview_rounds"
              type="number"
              min="0"
              max="20"
              placeholder="0"
              {...register("interview_rounds")}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="final_outcome_date">Final Outcome Date</Label>
            <Input
              id="final_outcome_date"
              type="date"
              {...register("final_outcome_date")}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="offer_received"
              checked={offerReceived}
              onCheckedChange={(checked) => setValue("offer_received", !!checked)}
            />
            <Label htmlFor="offer_received">Offer received</Label>
          </div>

          <div className="space-y-2">
            <Label>
              Confidence Score: <span className="font-semibold">{confidenceScore}</span>
            </Label>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[confidenceScore]}
              onValueChange={([val]) => {
                setConfidenceScore(val);
                setValue("outcome_confidence_score", val);
              }}
            />
            <p className="text-xs text-muted-foreground">
              How confident are you in this outcome report? (0 = uncertain, 100 = certain)
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Outcome"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
