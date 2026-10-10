import { useEffect, useRef } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MeritCostPreview } from '@/components/MeritCostPreview';
import { useFeatureCosts, getCostForFeature } from '@/hooks/useFeatureCosts';
import { useEliteRerun, type EliteRerunSource } from '@/hooks/useEliteRerun';
import { normalizeActiveTier } from '@/config/pricing-config';

type CtaResume = EliteRerunSource & { analyzed_tier?: string | null };

interface EliteRerunCtaProps {
  sourceResume: CtaResume;
  userTier: string;
  unlockStatus?: 'idle' | 'running' | 'error';
  unlockError?: string | null;
  backgrounded?: boolean;
}

export function EliteRerunCta({
  sourceResume,
  userTier,
  unlockStatus = 'idle',
  unlockError = null,
  backgrounded = false,
}: EliteRerunCtaProps) {
  const navigate = useNavigate();
  const { data: featureCosts } = useFeatureCosts();
  const { startEliteRerun, isStarting, error: startError } = useEliteRerun();
  const recoveryHeadingRef = useRef<HTMLHeadingElement>(null);
  const accountTier = normalizeActiveTier(userTier);
  const analyzedTier = sourceResume.analyzed_tier;

  useEffect(() => {
    if (unlockStatus === 'error') recoveryHeadingRef.current?.focus();
  }, [unlockStatus]);

  if (accountTier !== 'elite') return null;
  if (analyzedTier == null) {
    return (
      <Card className="p-4 mb-6 bg-card border-border">
        <p className="text-sm text-muted-foreground">
          Tier of this analysis isn't recorded (pre-upgrade record).{' '}
          <Link to="/upload" className="text-primary hover:underline">
            Run a fresh Elite analysis
          </Link>
          .
        </p>
      </Card>
    );
  }
  if (analyzedTier !== 'free') return null;

  const cost = getCostForFeature(featureCosts, 'resume_analysis', userTier);
  if (cost === null) return null;

  const effectiveError = unlockError ?? startError;
  const isConflict = effectiveError === 'fresh_analysis_required';
  const isMissingText = effectiveError === 'stored_text_unavailable';
  const failureMessage = isConflict
    ? 'This resume has changed, so it needs a new full analysis.'
    : isMissingText
      ? 'This resume\u2019s text isn\u2019t stored. Upload it again to create a new Elite analysis.'
      : 'We couldn\u2019t unlock the Elite insights. Your Free analysis is unchanged.';
  const failureAction = isConflict
    ? 'Analyze updated resume'
    : isMissingText
      ? 'Upload resume'
      : 'Try again';

  if (unlockStatus === 'error' || startError) {
    return (
      <Card className="p-5 mb-6 bg-card border-border" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex-1 space-y-3">
            <h3 ref={recoveryHeadingRef} tabIndex={-1} className="text-xl font-semibold text-foreground">
              Elite insights weren\u2019t unlocked
            </h3>
            <p className="text-base leading-relaxed text-muted-foreground">{failureMessage}</p>
            <Button
              className="min-h-11 w-full sm:w-auto"
              onClick={() => {
                if (isConflict || isMissingText) navigate('/upload');
                else void startEliteRerun(sourceResume);
              }}
            >
              {failureAction}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (unlockStatus === 'running' && backgrounded) {
    return (
      <Card className="p-5 mb-6 bg-card border-border">
        <Button className="min-h-11 w-full sm:w-auto" disabled aria-busy="true">
          Unlocking Elite insights…
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 mb-6 bg-card border-border">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-semibold leading-tight text-foreground">
            Unlock the rest of your Elite analysis
          </h3>
          <p className="mt-1 text-base leading-relaxed text-muted-foreground">
            Add only the missing Elite insights to this result. Your existing Free analysis won’t change.
          </p>
          <div className="mt-3">
            {cost === undefined ? (
              <Button className="min-h-11 w-full sm:w-auto" disabled>
                Loading pricing…
              </Button>
            ) : (
              <>
                <MeritCostPreview featureCost={cost} />
                <Button
                  className="min-h-11 w-full whitespace-normal sm:w-auto"
                  disabled={isStarting || unlockStatus === 'running'}
                  aria-busy={isStarting || unlockStatus === 'running'}
                  onClick={() => void startEliteRerun(sourceResume)}
                >
                  <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isStarting ? 'Starting\u2026' : `Unlock Elite insights \u2014 ${cost} merits`}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
