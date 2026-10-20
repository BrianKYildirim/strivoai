import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Lock, Scale, Target } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Insight, LockedInsight, ProfileAlignmentCategory, ProfileAlignmentModel } from '@/lib/dashboard-intelligence';
import { EmptyState, MiniMeter, SectionHeader, dashboardShellClass } from './DashboardSectionPrimitives';

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge variant="outline" className="shrink-0 rounded-full border-border/70 bg-background/60 text-[11px] font-medium text-muted-foreground">
      {source}
    </Badge>
  );
}

function CategoryRow({ category }: { category: ProfileAlignmentCategory }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{category.label}</p>
          {category.sources.map((source) => <SourceBadge key={source} source={source} />)}
        </div>
        <span className="text-xs font-semibold text-muted-foreground">{category.score}%</span>
      </div>
      <MiniMeter value={category.score} label={category.label} hideLabel />
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{category.summary}</p>
    </div>
  );
}

function ActionRow({ action }: { action: Insight }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/45 px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{action.title}</p>
        <SourceBadge source={action.source} />
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{action.body}</p>
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

export function ProfileAlignment({ model }: { model: ProfileAlignmentModel }) {
  if (model.status === 'missing' && model.emptyState) {
    return (
      <section className="pb-8">
        <SectionHeader
          eyebrow="Profile alignment"
          title="Profile Alignment"
          description="See whether your resume and LinkedIn tell one consistent professional story."
        />
        <EmptyState
          icon={Scale}
          title={model.emptyState.title}
          body={model.emptyState.body}
          cta={model.emptyState.cta}
          href={model.emptyState.href}
        />
      </section>
    );
  }

  return (
    <section className="pb-8">
      <SectionHeader
        eyebrow="Profile alignment"
        title="Profile Alignment"
        description="See whether your resume and LinkedIn tell one consistent professional story."
      />

      <div className={cn(dashboardShellClass, 'p-4 sm:p-6')}>
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-border/60 bg-background/45 p-4">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Alignment score</p>
                <h3 className="text-3xl font-bold text-foreground">{model.overallScore ?? '--'}%</h3>
              </div>
            </div>
            <MiniMeter value={model.overallScore ?? 0} label="Profile alignment score" />
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{model.interpretation}</p>
            {model.stalenessNotes.length > 0 && (
              <div className="mt-4 space-y-1 text-xs leading-5 text-muted-foreground">
                {model.stalenessNotes.map((note) => <p key={note}>{note}</p>)}
              </div>
            )}
            <Button className="mt-5 w-full gap-2 rounded-xl" asChild>
              <Link to={model.cta.href}>
                {model.cta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </aside>

          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              {model.categories.map((category) => <CategoryRow key={category.id} category={category} />)}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Synchronization Actions</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {model.actions.map((action) => <ActionRow key={action.id} action={action} />)}
                {model.lockedTeasers.map((item) => <LockedRow key={item.id} item={item} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
