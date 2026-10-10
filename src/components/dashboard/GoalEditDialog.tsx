import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useProfessionalGoal } from '@/hooks/useProfessionalGoal';

/**
 * The ONE goal-edit surface, reused by BOTH the Dashboard hero and Profile.
 * Two implementations would drift; there is exactly one.
 *
 * ZERO AI (CONTEXT §9a/§9b): saving the goal makes no Anthropic call, no edge-function
 * invoke, and starts no background recompute latch. The plpgsql AFTER trigger
 * (`compute_goal_readiness`, migration 20260712000002) recomputes and PERSISTS the new
 * Goal Readiness INSIDE THE SAME WRITE, so the query invalidation that `saveGoal` already
 * performs brings the updated score back on the very next refetch. No second round-trip,
 * no spinner, no AI wait.
 */
export function GoalEditDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The RAW wording is the source of truth for editing — never the structured form.
  const { professionalGoal, saveGoal, isSaving } = useProfessionalGoal();
  const [value, setValue] = useState('');

  // Re-prime from the persisted raw goal each time the dialog opens, so a cancelled edit
  // never leaks into the next one.
  useEffect(() => {
    if (open) setValue(professionalGoal ?? '');
  }, [open, professionalGoal]);

  const trimmed = value.trim();
  // The goal can be CHANGED but never CLEARED: an empty goal would bounce the user back
  // through the onboarding gate (ProtectedRoute) on their next navigation.
  const canSave = trimmed.length > 0 && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await saveGoal(trimmed);
      toast.success('Goal updated', {
        description: 'Your Goal Readiness has been recalculated.',
      });
      onOpenChange(false);
    } catch (error) {
      console.error('[GoalEditDialog] save failed:', error);
      toast.error('Could not update your goal', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>Set Your Professional Goal</DialogTitle>
          </div>
          <DialogDescription>
            Tell Strivo the one professional outcome you are currently working towards. We'll use your
            resume, LinkedIn, and future improvements to help you get closer to it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="e.g. I want to secure an investment banking internship in New York in 2027, ideally at a leading global bank. I want to build the experience needed to move into private equity later."
            // Matches the DB CHECK (length <= 500) from migration 20260712000001 — without
            // this, a long paste is rejected by Postgres with an opaque error.
            maxLength={500}
            rows={4}
            className="min-h-[110px] resize-y"
            aria-label="Set Your Professional Goal"
            onKeyDown={(event) => {
              // A BARE Enter must insert a newline. This used to save, which made a
              // second sentence literally untypeable once the field became a textarea.
              // Cmd/Ctrl+Enter keeps the keyboard save path.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void handleSave();
            }}
          />
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              A phrase or a sentence or two — whatever fits. You can update this goal at any time.
            </p>
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{value.length}/500</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave}>
            {isSaving ? 'Saving...' : 'Save Goal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
