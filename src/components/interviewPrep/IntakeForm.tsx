// Plan 23-06a Task 1 — IntakeForm (D-13 required fields + D-14 defaults).
// 9 fields per Plan 01 IntakeFormSchema. v1 out-of-scope affordances are
// deliberately absent (see SC-14 in 23-UI-SPEC).
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  IntakeFormSchema,
  type IntakeForm as IntakeFormType,
} from "@/types/interviewPrep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CharacterCounter } from "./CharacterCounter";

export interface IntakeFormProps {
  tier: "pro" | "elite";
  onSubmit: (data: IntakeFormType) => void;
  isGenerating: boolean;
}

export function IntakeForm({ tier, onSubmit, isGenerating }: IntakeFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<IntakeFormType>({
    resolver: zodResolver(IntakeFormSchema),
    defaultValues: {
      // D-14 defaults
      interview_type: "behavioral",
      difficulty: "mid",
      duration: 30,
      format: "written",
      question_categories: ["behavioral"],
      elite_taste_request: false,
    },
    mode: "onSubmit",
  });

  const backgroundContext = watch("background_context") ?? "";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
      data-testid="intake-form"
    >
      {/* Required (D-13) — job_description */}
      <div className="space-y-2">
        <label htmlFor="job_description" className="text-sm font-medium">
          Job description *
        </label>
        <Textarea
          id="job_description"
          {...register("job_description")}
          placeholder="Paste the job description for your target role"
          className="min-h-[180px]"
        />
        {errors.job_description && (
          <p className="text-sm text-destructive">
            {errors.job_description.message}
          </p>
        )}
      </div>

      {/* Optional — role_title, company */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="role_title" className="text-sm font-medium">
            Role title (optional)
          </label>
          <Input id="role_title" {...register("role_title")} />
        </div>
        <div className="space-y-2">
          <label htmlFor="company" className="text-sm font-medium">
            Company (optional)
          </label>
          <Input id="company" {...register("company")} />
        </div>
      </div>

      {/* Optional — background_context (1500-char soft cap) */}
      <div className="space-y-2">
        <label htmlFor="background_context" className="text-sm font-medium">
          Background context (optional)
        </label>
        <Textarea
          id="background_context"
          {...register("background_context")}
          maxLength={1500}
          placeholder="Anything the coach should know — e.g. domain, seniority, team context."
          className="min-h-[100px]"
        />
        <CharacterCounter value={backgroundContext.length} max={1500} />
      </div>

      {/* Required dropdowns — interview_type, difficulty, duration, format */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Interview type *</label>
          <Select
            defaultValue="behavioral"
            onValueChange={(v) =>
              setValue("interview_type", v as IntakeFormType["interview_type"], {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="behavioral">Behavioral</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="mixed_panel">Mixed panel</SelectItem>
              <SelectItem value="executive">Executive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Difficulty *</label>
          <Select
            defaultValue="mid"
            onValueChange={(v) =>
              setValue("difficulty", v as IntakeFormType["difficulty"], {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entry">Entry</SelectItem>
              <SelectItem value="mid">Mid</SelectItem>
              <SelectItem value="senior">Senior</SelectItem>
              <SelectItem value="staff_plus">Staff+</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Duration *</label>
          <Select
            defaultValue="30"
            onValueChange={(v) =>
              setValue(
                "duration",
                parseInt(v, 10) as IntakeFormType["duration"],
                { shouldValidate: true },
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 minutes</SelectItem>
              <SelectItem value="30">30 minutes</SelectItem>
              <SelectItem value="45">45 minutes</SelectItem>
              <SelectItem value="60">60 minutes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Format *</label>
          <Select
            defaultValue="written"
            onValueChange={(v) =>
              setValue("format", v as IntakeFormType["format"], {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="written">Written</SelectItem>
              <SelectItem value="voice_style">Voice style</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="submit" disabled={isGenerating} className="w-full">
        {isGenerating ? "Generating..." : "Generate Prep"}
      </Button>
    </form>
  );
}
