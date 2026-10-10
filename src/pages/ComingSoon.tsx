/**
 * Phase 47 — Interview Prep production gate.
 *
 * Full-page fallback rendered at /interview-prep on Vercel "Production" scope
 * (where VITE_FEATURE_INTERVIEW_PREP !== 'true'). On Vercel "Preview" scope the
 * /interview-prep route renders the real <InterviewPrep /> page; this component
 * never mounts there.
 *
 * Flag-agnostic by design: routing-side gating happens in plan 47-02.
 */
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ComingSoon() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 bg-background">
      <Card className="max-w-md w-full bg-background border-border">
        <CardContent className="p-8 flex flex-col items-center text-center gap-4">
          <div
            className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
            aria-hidden="true"
          >
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Interview Prep is coming soon
          </h1>
          <p className="text-sm text-muted-foreground">
            We&apos;re rebuilding Interview Prep to make it sharper.
            It&apos;ll be back here when it&apos;s ready.
          </p>
          <Button variant="outline" asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
