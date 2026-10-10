import { Briefcase, FileText, Linkedin, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RecruitingLensTutorialModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: () => void;
  onSkip: () => void;
}

const tutorialSteps = [
  {
    icon: Briefcase,
    title: "Company and role",
    body: "Name the company and role so the match report can anchor the score to the actual hiring context.",
  },
  {
    icon: FileText,
    title: "Job description",
    body: "Paste the full posting. Recruiting Lens uses it to identify deal breakers, keywords, and evidence gaps.",
  },
  {
    icon: Target,
    title: "Resume context",
    body: "Your selected resume analysis supplies the experience, strengths, and gaps compared against the role.",
  },
  {
    icon: Linkedin,
    title: "LinkedIn context",
    body: "Add LinkedIn text when available. It is optional, but it can sharpen credibility and profile recommendations.",
  },
];

export function RecruitingLensTutorialModal({
  open,
  onOpenChange,
  onStart,
  onSkip,
}: RecruitingLensTutorialModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>How Recruiting Lens uses your job details</DialogTitle>
          <DialogDescription>
            Review the inputs that shape this job match before you run the analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {tutorialSteps.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3 rounded-lg border bg-card p-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onSkip}>
            Skip tutorial
          </Button>
          <Button type="button" onClick={onStart}>
            Start job analysis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
