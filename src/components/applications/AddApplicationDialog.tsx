import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";

const schema = z.object({
  company_applied: z.string().min(3, "Company name must be at least 3 characters").max(200),
  role_applied: z.string().min(3, "Role must be at least 3 characters").max(200),
  industry: z.string().max(100).optional(),
  application_date: z.string().optional(),
  application_source: z.enum(["linkedin", "indeed", "referral", "company_site", "other", "recruiting_lens"]).optional(),
  referral_used: z.boolean().default(false),
  status: z.enum(["saved", "applied", "interviewing", "offered", "rejected", "withdrawn", "ghosted"]).default("saved"),
});

// @hookform/resolvers v5 splits the resolver's input vs output types: zod
// `.default()` fields are optional on INPUT but present on OUTPUT, so `useForm`
// must be typed with both (input = z.input, output = z.output). Runtime behavior
// is unchanged — this is a type-only adaptation to the v5 resolver signature.
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

interface AddApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export default function AddApplicationDialog({
  open,
  onOpenChange,
  onCreated,
}: AddApplicationDialogProps) {
  const [saving, setSaving] = useState(false);

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
      status: "saved",
      referral_used: false,
    },
  });

  const referralUsed = watch("referral_used");

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("applications").insert({
        user_id: user.id,
        company_applied: values.company_applied,
        role_applied: values.role_applied,
        industry: values.industry || null,
        application_date: values.application_date || null,
        application_source: values.application_source || "other",
        referral_used: values.referral_used,
        status: values.status,
        resume_version_id: null,
        linkedin_version_id: null,
        jd_id: null,
      });

      if (error) throw error;

      toast.success("Application added successfully!");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (error) {
      console.error("[AddApplicationDialog] Error:", error);
      toast.error("Failed to add application. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Application</DialogTitle>
          <DialogDescription>
            Track a new job application manually.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="company_applied">Company *</Label>
            <Input
              id="company_applied"
              placeholder="e.g. Google"
              {...register("company_applied")}
            />
            {errors.company_applied && (
              <p className="text-sm text-destructive">{errors.company_applied.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="role_applied">Role *</Label>
            <Input
              id="role_applied"
              placeholder="e.g. Software Engineer"
              {...register("role_applied")}
            />
            {errors.role_applied && (
              <p className="text-sm text-destructive">{errors.role_applied.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              placeholder="e.g. Technology"
              {...register("industry")}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="application_date">Application Date</Label>
            <Input
              id="application_date"
              type="date"
              {...register("application_date")}
            />
          </div>

          <div className="space-y-1">
            <Label>Application Source</Label>
            <Select
              onValueChange={(val) =>
                setValue("application_source", val as FormValues["application_source"])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="indeed">Indeed</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="company_site">Company Site</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Status</Label>
            <Select
              defaultValue="saved"
              onValueChange={(val) => setValue("status", val as FormValues["status"])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="saved">Saved</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="interviewing">Interviewing</SelectItem>
                <SelectItem value="offered">Offered</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="withdrawn">Withdrawn</SelectItem>
                <SelectItem value="ghosted">Ghosted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="referral_used"
              checked={referralUsed}
              onCheckedChange={(checked) => setValue("referral_used", !!checked)}
            />
            <Label htmlFor="referral_used">Applied via referral</Label>
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
              {saving ? "Adding…" : "Add Application"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
