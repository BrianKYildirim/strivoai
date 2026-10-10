import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Lock, Shield, Target, AlertCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { RecruiterFirstImpressionModel, Insight, LockedInsight } from '@/lib/dashboard-intelligence';
import { EmptyState, MiniMeter, SectionHeader, dashboardShellClass } from './DashboardSectionPrimitives';

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge variant="outline" className="shrink-0 rounded-full border-border/70 bg-background/60 text-[11px] font-medium text-muted-foreground">
      {source}
    </Badge>
  );
}

function InsightRow({ item, icon: Icon }: { item: Insight; icon: typeof CheckCircle2 }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/45 px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{item.title}</p>
        <SourceBadge source={item.source} />
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{item.body}</p>
    </div>
  );
}

function LockedRow({ item }: { item: LockedInsight }) {
  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/5 px-3 py-3 text-sm text-muted-foreground">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Lock className="h-4 w-4 text-primary" />
        <p className="font-semibold text-foreground">{item.title}</p>
        <SourceBadge source={item.source} />
      </div>
      <p className="leading-6">{item.body}</p>
    </div>
  );
}

export function RecruiterFirstImpression({ model }: { model: RecruiterFirstImpressionModel }) {
  if (model.status === 'empty' && model.emptyState) {
    return (
      <section>
        <SectionHeader
          eyebrow="Recruiter first impression"
          title="Recruiter First Impression"
          description="How your current resume and LinkedIn position you to employers."
        />
        <EmptyState
          icon={Shield}
          title={model.emptyState.title}
          body={model.emptyState.body}
          cta={model.emptyState.cta}
          href={model.emptyState.href}
        />
      </section>
    );
  }

  return (
    <section>
      <SectionHeader
        eyebrow="Recruiter first impression"
        title="Recruiter First Impression"
        description="How your current resume and LinkedIn position you to employers."
      />

      <div className={cn(dashboardShellClass, 'p-4 sm:p-6')}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/15">Current Positioning</Badge>
                <Badge variant="outline" className="rounded-full capitalize">{model.response.confidence} confidence</Badge>
              </div>
              <p className="text-base leading-7 text-foreground">{model.currentPositioning}</p>
              {model.stalenessNotes.length > 0 && (
                <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
                  {model.stalenessNotes.map((note) => <p key={note}>{note}</p>)}
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">What Stands Out</h3>
                <div className="space-y-2">
                  {model.standouts.length > 0
                    ? model.standouts.map((item) => <InsightRow key={item.id} item={item} icon={CheckCircle2} />)
                    : <p className="rounded-2xl border border-border/60 bg-background/45 px-3 py-3 text-sm text-muted-foreground">No supported standout signals yet.</p>}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">What May Create Doubt</h3>
                <div className="space-y-2">
                  {model.concerns.length > 0
                    ? model.concerns.map((item) => <InsightRow key={item.id} item={item} icon={AlertCircle} />)
                    : <p className="rounded-2xl border border-border/60 bg-background/45 px-3 py-3 text-sm text-muted-foreground">No source-backed concerns surfaced yet.</p>}
                </div>
              </div>
            </div>

            {model.lockedTeasers.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2">
                {model.lockedTeasers.map((item) => <LockedRow key={item.id} item={item} />)}
              </div>
            )}
          </div>

          <aside className="rounded-2xl border border-border/60 bg-background/45 p-4">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Likely Recruiter Response</p>
                <h3 className="font-semibold text-foreground">{model.response.label}</h3>
              </div>
            </div>

            <MiniMeter value={model.response.score} label="Recruiter response strength" />

            <div className="mt-5 space-y-2">
              {model.signalScores.map((signal) => (
                <div key={signal.key} className="rounded-xl border border-border/60 bg-card/65 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{signal.label}</span>
                    <span>{signal.available ? `${signal.score}%` : 'Needs data'}</span>
                  </div>
                  <MiniMeter value={signal.available ? signal.score : 8} label={signal.label} hideLabel muted={!signal.available} />
                </div>
              ))}
            </div>

            <Button className="mt-5 w-full gap-2 rounded-xl" asChild>
              <Link to={model.cta.href}>
                {model.cta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{model.cta.reason}</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
