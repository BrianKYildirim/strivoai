import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PriorSelectorEmptyStateProps {
  headingText: string;
  bodyText: string;
  ctaLabel: string;
  ctaHref: string;
  blocking: boolean;
  icon?: ReactNode;
}

export function PriorSelectorEmptyState({
  headingText,
  bodyText,
  ctaLabel,
  ctaHref,
  blocking,
  icon,
}: PriorSelectorEmptyStateProps) {
  return (
    <Card className="bg-secondary/50 border border-border/50">
      <CardContent className="p-4 text-center space-y-2">
        <div className="flex justify-center text-muted-foreground">
          {icon ?? <AlertCircle className="w-8 h-8" />}
        </div>
        <p className="text-sm font-semibold text-foreground">{headingText}</p>
        <p className="text-xs text-muted-foreground">{bodyText}</p>
        <Button asChild variant={blocking ? "default" : "outline"} size="sm" className="mt-1">
          <Link to={ctaHref}>{ctaLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

